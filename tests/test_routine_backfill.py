"""Going back and checking off a routine for a day you forgot."""
import os, sys, tempfile
from datetime import date, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import init_db
init_db()
from fastapi.testclient import TestClient
from backend.main import app
c = TestClient(app)
T = date.today()
y, y2 = (T - timedelta(days=1)).isoformat(), (T - timedelta(days=2)).isoformat()

h = c.post("/api/habits", json={"title": "Skincare", "area": "health"}).json()
assert c.get(f"/api/habits/{h['id']}/log?date={y}").json()["logged"] is False

# Forgot yesterday and the day before: fill them in.
c.post(f"/api/habits/{h['id']}/log", json={"date": y2})
r = c.post(f"/api/habits/{h['id']}/log", json={"date": y, "note": "late entry"})
assert r.status_code == 200, r.text
g = c.get(f"/api/habits/{h['id']}/log?date={y}").json()
assert g["logged"] is True and g["note"] == "late entry", g
hb = c.get(f"/api/habits/{h['id']}").json()
assert hb["streak"] >= 2, hb["streak"]
assert {d["date"]: d["state"] for d in hb["history"]}.get(y) == "done", hb["history"][-3:]
assert not hb["logged_today"]

# Undo a day.
c.delete(f"/api/habits/{h['id']}/log?date={y2}")
assert c.get(f"/api/habits/{h['id']}/log?date={y2}").json()["logged"] is False

# Amount routines: fixing a day replaces the amount.
s = c.post("/api/habits", json={"title": "CPA study", "area": "education", "target_amount": 2, "unit": "hours"}).json()
c.post(f"/api/habits/{s['id']}/log", json={"date": y, "amount": 1})
c.post(f"/api/habits/{s['id']}/log", json={"date": y, "amount": 2.5})
assert c.get(f"/api/habits/{s['id']}/log?date={y}").json()["amount"] == 2.5

# Future days are refused.
f = c.post(f"/api/habits/{h['id']}/log", json={"date": (T + timedelta(days=1)).isoformat()})
assert f.status_code == 400, f.text
print("backfill ok")
