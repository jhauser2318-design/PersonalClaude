"""Phone notifications (Web Push).

An iPhone (iOS 16.4+) can get notifications from a web app that's been added
to its Home Screen. The phone gives us a "subscription" (an address at
Apple's push service plus two keys); to notify it we encrypt the message for
that phone and post it there. Apple delivers it even when the app is closed.

The encryption (RFC 8291, "aes128gcm") and the sender identification (VAPID,
RFC 8292) are done here with the `cryptography` package, so there's nothing
else to install. Only the notifier on your PC sends pushes; the phone's
subscription details stay in your database.
"""
import base64
import json
import logging
import os
import struct
import time
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import urlparse

from . import net
from .database import get_setting, register_schema, set_setting

log = logging.getLogger("push")

register_schema(
    """
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint   TEXT NOT NULL UNIQUE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        label      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_ok    TEXT,
        last_error TEXT,
        fails      INTEGER NOT NULL DEFAULT 0
    );
    """
)

SUBJECT = "mailto:life-control-center@users.noreply.github.com"  # who's sending (required by push services)
TTL = 12 * 3600          # a reminder older than 12 hours isn't worth showing
MAX_FAILS = 20           # give up on a phone that keeps failing (it's probably been reset)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# ---------------------------------------------------------------------------
# Keys (VAPID): made once, kept in your real database
# ---------------------------------------------------------------------------

def _keys(conn):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    pem = get_setting(conn, "push_vapid_private")
    if pem:
        private = serialization.load_pem_private_key(pem.encode(), password=None)
    else:
        private = ec.generate_private_key(ec.SECP256R1())
        pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()).decode()
        set_setting(conn, "push_vapid_private", pem)
        conn.commit()
    public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return private, public


def public_key(conn) -> str:
    """The key the phone needs to subscribe (applicationServerKey)."""
    return _b64(_keys(conn)[1])


def _vapid_header(private, public: bytes, endpoint: str) -> str:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    url = urlparse(endpoint)
    header = _b64(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = _b64(json.dumps({"aud": f"{url.scheme}://{url.netloc}", "exp": int(time.time()) + 12 * 3600,
                              "sub": SUBJECT}, separators=(",", ":")).encode())
    signing_input = f"{header}.{claims}".encode()
    r, s = decode_dss_signature(private.sign(signing_input, ec.ECDSA(hashes.SHA256())))
    token = f"{header}.{claims}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={token}, k={_b64(public)}"


# ---------------------------------------------------------------------------
# Encryption (RFC 8291)
# ---------------------------------------------------------------------------

def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt(message: bytes, p256dh: str, auth: str, salt: bytes | None = None, private=None) -> bytes:
    """Encrypt one message for one phone (a single aes128gcm record)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    ua_public = _unb64(p256dh)
    auth_secret = _unb64(auth)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    private = private or ec.generate_private_key(ec.SECP256R1())  # a fresh key for every message
    as_public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = private.exchange(ec.ECDH(), ua_key)
    ikm = _hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ciphertext = AESGCM(cek).encrypt(nonce, message + b"\x02", None)  # \x02 = last (and only) record
    return salt + struct.pack("!IB", 4096, len(as_public)) + as_public + ciphertext


# ---------------------------------------------------------------------------
# Subscriptions (one per phone)
# ---------------------------------------------------------------------------

def subscribe(conn, sub: dict, label: str = "") -> dict:
    endpoint = (sub or {}).get("endpoint") or ""
    keys = (sub or {}).get("keys") or {}
    if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("That doesn't look like a push subscription")
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
                    label = excluded.label, fails = 0, last_error = NULL""",
                 (endpoint, keys["p256dh"], keys["auth"], (label or "Phone")[:60], now))
    return dict(conn.execute("SELECT id, label, created_at, last_ok FROM push_subscriptions WHERE endpoint = ?",
                             (endpoint,)).fetchone())


def unsubscribe(conn, endpoint: str | None = None, sub_id: int | None = None) -> None:
    if sub_id:
        conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
    elif endpoint:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))


def devices(conn) -> list[dict]:
    try:
        return [dict(r) for r in conn.execute(
            "SELECT id, label, created_at, last_ok, last_error, endpoint FROM push_subscriptions ORDER BY id")]
    except Exception:  # noqa: BLE001 (table not created yet)
        return []


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

def _post(endpoint: str, body: bytes, headers: dict) -> tuple[int, str]:
    """POST to the push service. Returns (status, the service's reason text if it refused)."""
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with net.urlopen(req, timeout=20) as res:
            return res.status, ""
    except urllib.error.HTTPError as e:
        try:
            text = e.read().decode("utf-8", "replace")[:300]
            reason = json.loads(text).get("reason", text) if text.startswith("{") else text
        except Exception:  # noqa: BLE001
            reason = ""
        return e.code, str(reason).strip()


def explain(status: int, reason: str) -> str:
    """A plain-English reason a push didn't go through."""
    r = (reason or "").lower()
    if status == 0 and "certificate" in r:
        return (f"The PC couldn't confirm it was talking to the real Apple push service ({reason}). "
                "Click Check for updates; if it keeps happening, antivirus “HTTPS scanning” may be interfering.")
    if status == 0:
        return (f"The PC couldn't reach Apple's push service ({reason}). Check the PC's internet connection, "
                "and that antivirus or a firewall isn't blocking Python from web.push.apple.com.")
    if "badjwttoken" in r or "expiredjwt" in r or status == 403:
        return (f"Apple refused the app's sign-in (403 {reason}). This usually means the PC's clock is off: "
                "check the date, time and time zone in Windows settings, then send a test again.")
    if status in (404, 410) or "unregistered" in r or "expired" in r:
        return "This phone's notification sign-up was no longer valid. On the phone, tap Turn on again."
    if status == 413:
        return "The notification was too big for Apple."
    if status == 429 or "toomany" in r:
        return "Apple says too many notifications were sent. Try again in a few minutes."
    return f"Apple's push service said {status} {reason}".strip()


def send_all(conn, messages: list[dict], poster=None, endpoint: str | None = None) -> int:
    """Send each message ({title, body, url, tag, urgent, badge}) to every phone (or just the one
    with `endpoint`). Returns how many pushes the push service accepted."""
    return send_report(conn, messages, poster, endpoint)["sent"]


def send_report(conn, messages: list[dict], poster=None, endpoint: str | None = None) -> dict:
    """Like send_all, but also says why anything failed: {"sent", "phones", "errors": [...]}."""
    subs = [dict(r) for r in conn.execute("SELECT * FROM push_subscriptions ORDER BY id")] if devices(conn) else []
    if endpoint:
        subs = [s for s in subs if s["endpoint"] == endpoint]
    out = {"sent": 0, "phones": len(subs), "errors": []}
    if not subs or not messages:
        return out
    poster = poster or _post
    private, public = _keys(conn)
    for s in subs:
        for m in messages:
            payload = json.dumps({k: m[k] for k in ("title", "body", "url", "tag", "badge") if m.get(k) is not None}).encode()
            try:
                body = encrypt(payload, s["p256dh"], s["auth"])
                res = poster(s["endpoint"], body, {
                    "Authorization": _vapid_header(private, public, s["endpoint"]),
                    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
                    "TTL": str(TTL), "Urgency": "high" if m.get("urgent") else "normal",
                })
                status, reason = res if isinstance(res, tuple) else (res, "")
            except Exception as e:  # noqa: BLE001 (no internet, bad keys...): try again next time
                status, reason = 0, str(e)[:200]
            now = datetime.now().isoformat(timespec="seconds")
            if 200 <= status < 300:
                out["sent"] += 1
                conn.execute("UPDATE push_subscriptions SET last_ok = ?, fails = 0, last_error = NULL WHERE id = ?",
                             (now, s["id"]))
                continue
            err = explain(status, reason)
            out["errors"].append({"phone": s["label"], "status": status, "reason": reason, "message": err})
            log.warning("Push to %s failed: %s %s", s["label"], status, reason)
            if status in (404, 410):  # the phone unsubscribed or was reset: forget it
                conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (s["id"],))
            else:
                conn.execute("UPDATE push_subscriptions SET fails = fails + 1, last_error = ? WHERE id = ?",
                             (f"{now[:16].replace('T', ' ')}: {err}", s["id"]))
                conn.execute("DELETE FROM push_subscriptions WHERE id = ? AND fails >= ?", (s["id"], MAX_FAILS))
            break
    conn.commit()
    return out


def ready() -> str | None:
    """None if phone notifications can be sent from this PC, else what's missing."""
    try:
        import cryptography  # noqa: F401
        from cryptography.hazmat.primitives.asymmetric import ec
        ec.generate_private_key(ec.SECP256R1())
        return None
    except Exception as e:  # noqa: BLE001
        return f"A piece the app needs for phone notifications (the “cryptography” package) isn't working on this PC: {e}"


def install_missing() -> bool:
    """Try to install the cryptography package (same as the updater does). Returns True if it now works."""
    import subprocess
    import sys
    from pathlib import Path
    python = Path(sys.executable).with_name("python.exe")
    if not python.is_file():
        python = Path(sys.executable)
    try:
        result = subprocess.run([str(python), "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
                                 "cryptography>=42"], capture_output=True, text=True, timeout=600,
                                creationflags=0x08000000 if os.name == "nt" else 0)
        if result.returncode != 0:
            log.warning("Installing cryptography failed: %s", (result.stderr or result.stdout)[-800:])
    except Exception as e:  # noqa: BLE001
        log.warning("Installing cryptography failed: %s", e)
    import importlib
    importlib.invalidate_caches()
    return ready() is None
