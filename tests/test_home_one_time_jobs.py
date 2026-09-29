import os, sys, tempfile, sqlite3
from datetime import date, datetime, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
# a database from the previous version (no one_time/due_date columns)
c0 = sqlite3.connect(f"{tmp}/life.db")
c0.execute("CREATE TABLE maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'home', every_n INTEGER NOT NULL DEFAULT 3, every_unit TEXT NOT NULL DEFAULT 'months', last_done TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)")
c0.execute("INSERT INTO maintenance (name, last_done, created_at) VALUES ('HVAC filter', '2026-05-01', 'x')"); c0.commit(); c0.close()
import backend.modules  # noqa
from backend.database import get_db, init_db
init_db()
from fastapi.testclient import TestClient
from backend.main import app
from backend import notify
c = TestClient(app)
T = date.today()
j = c.post("/api/home/maintenance", json={"name": "Fix faucet", "one_time": True, "due_date": (T + timedelta(days=2)).isoformat()}).json()
assert j["one_time"] == 1 and j["status"] == "soon" and j["due_in"] == 2, j
n = c.post("/api/home/maintenance", json={"name": "Replace remote", "one_time": True}).json(); assert n["status"] == "todo"
o = c.get("/api/home").json(); print([(i["name"], i["status"]) for i in o["maintenance"]], o["attention"])
with get_db() as conn:
    notify.collect(conn, datetime.combine(T, datetime.min.time()).replace(hour=9, minute=30))
    print([r[0] for r in conn.execute("SELECT title FROM notifications")])
d = c.post(f"/api/home/maintenance/{j['id']}/done", json={"cost": 12}).json(); assert d["status"] == "done", d
r = c.post(f"/api/home/maintenance/{j['id']}/reopen").json(); assert r["status"] == "soon" and not r["last_done"], r
print("jobs ok")
