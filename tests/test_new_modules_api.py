import os, sys, tempfile
from datetime import date, timedelta
tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import get_db, init_db
init_db()
from fastapi.testclient import TestClient
from backend.main import app
c = TestClient(app)
today = date.today(); T = today.isoformat()
def ok(r):
    assert r.status_code == 200, (r.status_code, r.text); return r.json()

# habits for linking
h = ok(c.post("/api/habits", json={"title": "CPA study", "area": "education", "frequency": "daily", "target_amount": 2, "unit": "hours"}))
g = ok(c.post("/api/habits", json={"title": "Gym", "area": "health", "frequency": "daily"}))

# schedule
d = ok(c.get(f"/api/schedule?day={T}")); assert d["blocks"] == []
b = ok(c.post("/api/schedule/blocks", json={"date": T, "start": "07:00", "end": "09:00", "title": "CPA study", "area": "education"}))
ok(c.post("/api/schedule/blocks", json={"date": T, "start": "06:00", "end": "07:00", "title": "Gym", "area": "health"}))
assert c.post("/api/schedule/blocks", json={"date": T, "start": "09:00", "end": "08:00", "title": "x"}).status_code == 400
ok(c.patch(f"/api/schedule/blocks/{b['id']}", json={"done": True}))
t = ok(c.post("/api/schedule/templates", json={"name": "Weekday", "weekdays": [0,1,2,3,4,5,6], "from_date": T}))
assert len(t["blocks"]) == 2
tm = (today + timedelta(days=1)).isoformat()
d2 = ok(c.get(f"/api/schedule?day={tm}")); assert d2["template_used"] == "Weekday" and len(d2["blocks"]) == 2, d2
ok(c.delete(f"/api/schedule/blocks/{d2['blocks'][0]['id']}"))
d2 = ok(c.get(f"/api/schedule?day={tm}")); assert len(d2["blocks"]) == 1  # not refilled
f = ok(c.post("/api/focus/finish", json={"minutes": 50, "label": "FAR", "habit_id": h["id"]}))
assert abs(f["habit"]["amount_today"] - 0.83) < 0.01, f["habit"]
print("schedule ok")

# cpa
o = ok(c.get("/api/cpa")); far = o["sections"][0]; assert far["code"] == "FAR"
o = ok(c.patch(f"/api/cpa/sections/{far['id']}", json={"status": "studying", "study_start": (today - timedelta(days=10)).isoformat(), "exam_date": (today + timedelta(days=50)).isoformat()}))
far = o["sections"][0]; assert far["hours"] == 0.8 and far["per_day_needed"] > 0, far
o = ok(c.post("/api/cpa/scores", json={"section": "far", "score": 72}))
assert o["sections"][0]["last_score"] == 72
aud = o["sections"][1]
o = ok(c.patch(f"/api/cpa/sections/{aud['id']}", json={"status": "passed", "passed_date": "2026-05-01", "score": 81}))
assert o["window"]["deadline"] == "2028-11-01", o["window"]
print("cpa ok")

# people
p = ok(c.post("/api/people", json={"name": "Mom", "relation": "family", "birthday": (today + timedelta(days=5)).replace(year=1965).isoformat(), "cadence_days": 7}))
assert p["due"] and p["birthday_in"] == 5 and p["turning"] == today.year - 1965 + (1 if (today + timedelta(days=5)).year > today.year else 0)
ok(c.post(f"/api/people/{p['id']}/contact", json={"kind": "call", "note": "Talked about trip"}))
e = ok(c.get("/api/people")); assert not e["people"][0]["due"] and len(e["birthdays"]) == 1
ok(c.post("/api/people", json={"name": "Sam", "birthday": "04-12"}))
print("people ok")

# fun
e = ok(c.post("/api/fun", json={"title": "Bowling", "category": "Friends & social", "rating": 5, "with_whom": "Sam", "cost": 30}))
assert e["category"] == "friends" and e["rating"] == 5
i = ok(c.post("/api/fun/ideas", json={"title": "Axe throwing", "category": "friends"}))
ok(c.post(f"/api/fun/ideas/{i['id']}/done", json={"rating": 4}))
f = ok(c.get("/api/fun")); assert f["this_month"] == 2 and not f["ideas"] and f["favorites"][0]["title"] == "Bowling", f
print("fun ok")


# home
m = ok(c.post("/api/home/maintenance", json={"name": "HVAC filter", "every_n": 3, "every_unit": "months", "last_done": "2026-06-01"}))
m = ok(c.post(f"/api/home/maintenance/{m['id']}/done", json={"cost": 20}))
assert m["last_done"] == T and m["status"] == "ok"
dd = ok(c.post("/api/home/dates", json={"name": "Passport", "kind": "document", "date": (today + timedelta(days=20)).isoformat()}))
assert dd["status"] == "soon"
print("home ok")

# review
rv = ok(c.get("/api/review")); assert "stats" in rv
wk = rv["review"]["week_start"]
rv = ok(c.put(f"/api/review/{wk}", json={"went_well": "Studied", "priorities": ["Finish FAR ch 5", "Call bank"], "completed": True}))
made = ok(c.post(f"/api/review/{wk}/tasks", json={"area": "education"}))["created"]; assert len(made) == 2
from backend.modules.review import service as rs
with get_db() as conn: print(rs.stats_text(rs.stats(conn, rs.monday())))
print("review ok")

# finance bills/savings
bl = ok(c.post("/api/finances/bills", json={"name": "Rent", "amount": 1500, "due_day": 1}))
ok(c.post("/api/finances/bills", json={"name": "Car insurance", "amount": 600, "due_day": 15, "frequency": "yearly", "start_month": today.month}))
mo = ok(c.get("/api/finances/bills")); assert len(mo["items"]) == 2 and mo["total"] == 2100
nm = (today.replace(day=1) + timedelta(days=32)).strftime("%Y-%m")
assert len(ok(c.get(f"/api/finances/bills?month={nm}"))["items"]) == 1
goal = ok(c.post("/api/goals", json={"title": "Emergency fund", "area": "work"}))
sv = ok(c.post("/api/finances/savings", json={"name": "Emergency fund", "target": 10000, "saved": 2500, "target_date": (today + timedelta(days=365)).isoformat(), "goal_id": goal["id"]}))
assert sv["pct"] == 25 and sv["monthly_needed"] == 625, sv
assert ok(c.get(f"/api/goals/{goal['id']}"))["progress"] == 25
print("finance planning ok")
