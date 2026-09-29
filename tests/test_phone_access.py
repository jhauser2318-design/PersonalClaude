import json, os, stat, sys, tempfile
SP = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"

# A fake "tailscale" program on PATH.
bindir = os.path.join(tmp, "bin"); os.makedirs(bindir)
state_file = os.path.join(tmp, "ts_state.json")
json.dump({"serving": False, "https": False, "needs_enable": True}, open(state_file, "w"))
fake = os.path.join(bindir, "tailscale")
open(fake, "w").write(f"""#!{sys.executable}
import json, sys
st = json.load(open({state_file!r}))
a = sys.argv[1:]
if a[:2] == ["status", "--json"]:
    print(json.dumps({{"BackendState": "Running", "Self": {{"DNSName": "jack-pc.tail1234.ts.net.", "UserID": 7}},
        "User": {{"7": {{"LoginName": "jhauser2318@gmail.com"}}}}, "CertDomains": ["jack-pc.tail1234.ts.net"] if st["https"] else None}}))
elif a[:3] == ["serve", "status", "--json"]:
    print(json.dumps({{"Web": {{"jack-pc.tail1234.ts.net:443": {{"Handlers": {{"/": {{"Proxy": "http://127.0.0.1:8000"}}}}}}}}}} if st["serving"] else {{}}))
elif a[:2] == ["serve", "--bg"]:
    if st["needs_enable"]:
        print("Serve is not enabled on your tailnet.\\nTo enable, visit:\\n\\n  https://login.tailscale.com/f/serve?node=abc123\\n")
        sys.exit(1)
    st["serving"] = True; json.dump(st, open({state_file!r}, "w"))
    print("Available within your tailnet: https://jack-pc.tail1234.ts.net/")
elif a[:2] == ["serve", "reset"]:
    st["serving"] = False; json.dump(st, open({state_file!r}, "w"))
""")
os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
os.environ["PATH"] = bindir + os.pathsep + os.environ["PATH"]

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from backend import config
from backend.modules.remote import host
host.HOST_FILE = config.PROJECT_ROOT.__class__(tmp) / "host.json"
from fastapi.testclient import TestClient
from backend.main import app

PHONE = {"X-Forwarded-For": "100.101.1.2", "Tailscale-User-Login": "jhauser2318@gmail.com",
         "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"}

with TestClient(app) as pc, TestClient(app, base_url="https://jack-pc.tail1234.ts.net") as phone:
    print("pc areas", pc.get("/api/areas").status_code)
    r = phone.get("/api/areas", headers=PHONE); print("phone areas no login", r.status_code, r.json())
    print("phone auth status", phone.get("/api/auth/status", headers=PHONE).json())
    print("phone static", phone.get("/", headers=PHONE).status_code, phone.get("/manifest.webmanifest", headers=PHONE).status_code)
    print("login no passcode", phone.post("/api/auth/login", json={"passcode": "123456"}, headers=PHONE).json())
    print("phone set passcode", phone.post("/api/remote/passcode", json={"passcode": "999999"}, headers=PHONE).status_code)
    print("short passcode", pc.post("/api/remote/passcode", json={"passcode": "12"}).json())
    print("set passcode", pc.post("/api/remote/passcode", json={"passcode": "482913"}).json())
    for i in range(5):
        r = phone.post("/api/auth/login", json={"passcode": "000000"}, headers=PHONE)
    print("after 5 wrong", r.json())
    print("locked even if right", phone.post("/api/auth/login", json={"passcode": "482913"}, headers=PHONE).json())
    from backend.modules.remote import auth as A
    A._failures.update(count=0, until=0)
    r = phone.post("/api/auth/login", json={"passcode": " 482913 "}, headers=PHONE)
    print("login ok", r.json(), "cookie:", r.headers.get("set-cookie", "")[:90])
    print("phone areas", phone.get("/api/areas", headers=PHONE).status_code)
    print("phone status", {k: v for k, v in phone.get("/api/remote/status", headers=PHONE).json().items() if k != "background"})
    print("phone calendar connect", phone.get("/api/calendar/connect", headers=PHONE).status_code)
    print("phone background toggle", phone.post("/api/remote/background", json={"on": True}, headers=PHONE).status_code)
    # data version
    v0 = pc.post("/api/app/ping").json()["data_version"]
    r = phone.post("/api/tasks", json={"title": "From phone", "area": "work"}, headers=PHONE)
    print("phone write", r.status_code, "X-Data-Version", r.headers.get("x-data-version"), "ping now", pc.post("/api/app/ping").json()["data_version"], "was", v0)
    g = pc.get("/api/tasks"); print("GET has header", g.headers.get("x-data-version"))
    # PC side setup
    st = pc.get("/api/remote/status").json()
    print("pc status tailscale", st["tailscale"], "bg", st["background"])
    print("bg on", pc.post("/api/remote/background", json={"on": True}).json(), json.load(open(host.HOST_FILE)))
    print("serve (needs enable)", pc.post("/api/remote/tailscale/on").json())
    s = json.load(open(state_file)); s.update(https=True, needs_enable=False); json.dump(s, open(state_file, "w"))
    r = pc.post("/api/remote/tailscale/on").json(); print("serve", r["serving"], r["url"])
    print("devices", [(d["name"]) for d in pc.get("/api/remote/status").json()["devices"]])
    print("off", pc.post("/api/remote/tailscale/off").json(), pc.get("/api/remote/status").json()["tailscale"]["serving"])
    # sign out this device from phone
    me = phone.get("/api/remote/status", headers=PHONE).json()["this_device"]
    print("forget", phone.delete(f"/api/remote/devices/{me}", headers=PHONE).json(), phone.get("/api/areas", headers=PHONE).status_code)
    # changing passcode signs everyone out
    phone.post("/api/auth/login", json={"passcode": "482913"}, headers=PHONE)
    pc.post("/api/remote/passcode", json={"passcode": "5555555"})
    print("after new passcode", phone.get("/api/areas", headers=PHONE).status_code)
    print("bg off", pc.post("/api/remote/background", json={"on": False}).json())
print("ALL OK")
