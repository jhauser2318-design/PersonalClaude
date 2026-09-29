import os, sys, tempfile, json, base64
from datetime import date, datetime, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"; os.environ["ANTHROPIC_API_KEY"] = "x"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import get_db, init_db, set_setting
init_db()
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from backend import notify, push
from backend.modules.goals import service as goals
from backend.modules.followups import service as fu
from fastapi.testclient import TestClient
from backend.main import app

def phone():
    k = ec.generate_private_key(ec.SECP256R1())
    pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    auth = os.urandom(16)
    return k, auth, {"endpoint": f"https://web.push.apple.com/{os.urandom(6).hex()}",
                     "keys": {"p256dh": push._b64(pub), "auth": push._b64(auth)}}

def decrypt(body, k, auth):  # the phone's side of RFC 8291
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt, rs, idlen = body[:16], int.from_bytes(body[16:20], "big"), body[20]
    as_pub = body[21:21 + idlen]; ct = body[21 + idlen:]
    ua_pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = k.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    ikm = push._hkdf(auth, shared, b"WebPush: info\x00" + ua_pub + as_pub, 32)
    cek = push._hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16); nonce = push._hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    pt = AESGCM(cek).decrypt(nonce, ct, None); assert pt.endswith(b"\x02"); return json.loads(pt[:-1])

# Subscribe through the API as a signed-in phone would (the task install fails off Windows; that's fine).
c = TestClient(app)
key = c.get("/api/push/status").json()["key"]; assert len(push._unb64(key)) == 65
k1, a1, s1 = phone(); k2, a2, s2 = phone()
sent_log = []
real_post = push._post
push._post = lambda ep, body, h: (sent_log.append((ep, body, h)), 201)[1]
r = c.post("/api/push/subscribe", json={"subscription": s1, "label": "iPhone"}).json(); print(r)
assert r["test_sent"] == 1 and decrypt(sent_log[-1][1], k1, a1)["title"].startswith("🔔")
c.post("/api/push/subscribe", json={"subscription": s2, "label": "iPad"})
assert c.get("/api/notifications").json()["settings"]["notify_enabled"] == "1"

# A task reminder comes due: both phones get it, the PC too unless turned off.
with get_db(real=True) as conn:
    t = goals.create_task(conn, {"title": "Call Mom", "area": "social", "due_date": date.today().isoformat()})
    fu.set_reminder(conn, "task", t["id"], f"{date.today()}T09:00")
toasts = []; sent_log.clear()
res = notify.run_once(datetime.combine(date.today(), datetime.min.time()).replace(hour=9, minute=1),
                      sender=lambda *a: toasts.append(a))
print(res, toasts)
assert len(sent_log) == 2 and len(toasts) == 1
m = decrypt(sent_log[0][1], k1, a1); print(m)
assert m["title"] == "⏰ Call Mom" and m["url"] == "/#/tasks" and m["badge"] >= 1
assert sent_log[0][2]["Urgency"] == "high" and sent_log[0][2]["Authorization"].startswith("vapid t=")

# Phones only; a reset phone (410) is forgotten.
c.patch("/api/notifications/settings", json={"notify_desktop": False})
push._post = lambda ep, body, h: 410 if ep == s2["endpoint"] else 201
with get_db(real=True) as conn:
    fu.add_notification(conn, "test", "Hello", "world", "dashboard", dedupe="x1")
toasts.clear()
notify.run_once(datetime.now(), sender=lambda *a: toasts.append(a))
assert not toasts
devs = c.get("/api/push/status").json()["devices"]; print([d["label"] for d in devs]); assert [d["label"] for d in devs] == ["iPhone"]
# Test button to one phone; failure message when it can't be delivered.
push._post = lambda ep, body, h: (403, "BadJwtToken")
r = c.post("/api/push/test", json={"endpoint": s1["endpoint"]}); print(r.json())
assert r.status_code == 400 and "clock" in r.json()["detail"]
assert "clock" in c.get("/api/push/status").json()["devices"][0]["last_error"]
push._post = lambda ep, body, h: (_ for _ in ()).throw(OSError("getaddrinfo failed"))
r = c.post("/api/push/test", json={"endpoint": s1["endpoint"]}); print(r.json()); assert "couldn't reach" in r.json()["detail"]
# Subscribing again with the test rejected: the phone sees why
push._post = lambda ep, body, h: (410, "Unregistered")
r = c.post("/api/push/subscribe", json={"subscription": s1, "label": "iPhone"}).json(); print(r["test_error"]); assert r["test_error"]
# Missing package: status says so, subscribe refuses with a clear message (and a repair is started)
orig_ready, orig_install = push.ready, push.install_missing
push.ready = lambda: "cryptography missing"; push.install_missing = lambda: False
st = c.get("/api/push/status").json(); assert st["problem"] and st["key"] is None
r = c.post("/api/push/subscribe", json={"subscription": s1}); assert r.status_code == 503, r.text
push.ready, push.install_missing = orig_ready, orig_install
push._post = real_post
assert c.get("/sw.js").status_code == 200 and "javascript" in c.get("/sw.js").headers["content-type"]
print("push ok")
