import json, os, sys, tempfile
from datetime import date, datetime, timedelta
from types import SimpleNamespace as NS

tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from backend.database import get_db, init_db, set_setting, get_setting
from backend import notify
from backend.modules.followups import service as fu
from backend.modules.goals import service as goals
from backend.modules.habits import service as habits
from backend.modules.assistant import actions
from backend.modules.assistant.claude_client import build_context, normalize_action, BLANKS
init_db()

shown = []
def sender(title, body, link, reminder):
    shown.append((title, body, link, reminder))

today = date.today()
T = lambda d, hm: datetime.combine(d, datetime.strptime(hm, "%H:%M").time())

with get_db() as c:
    task = goals.create_task(c, {"title": "Call Mom", "area": "social", "due_date": today.isoformat()})
    fu.set_reminder(c, "task", task["id"], f"{today}T18:00")
    done_task = goals.create_task(c, {"title": "Done thing", "area": "work"})
    fu.set_reminder(c, "task", done_task["id"], f"{today}T08:00")
    goals.update_task(c, done_task["id"], {"done": True})
    gym = habits.create_habit(c, {"title": "Gym", "area": "health", "frequency": "daily"})
    skin = habits.create_habit(c, {"title": "Skincare", "area": "health", "frequency": "daily"})
    cpa = habits.create_habit(c, {"title": "CPA", "area": "education", "frequency": "daily", "target_amount": 2, "unit": "hours"})
    for h in (gym, skin, cpa):
        c.execute("INSERT INTO reminders (kind, ref_id, at, repeat, created_at) VALUES ('routine', ?, '07:00', 'daily', 'x')", (h["id"],))
    habits.log_habit(c, skin["id"], today.isoformat())
    habits.log_habit(c, cpa["id"], today.isoformat(), 1.0)  # partial: still due
    f1 = fu.create_followup(c, {"title": "Contract", "person": "Sarah", "direction": "waiting", "due_date": today.isoformat()})
    fu.set_reminder(c, "followup", f1["id"], today.isoformat())  # date only -> 09:00
    print("task row:", goals.get_task(c, task["id"])["remind_at"], "| habit remind:", habits.get_habit(c, gym["id"])["remind_at"],
          "| followup:", fu.get_followup(c, f1["id"])["remind_at"])
    try: fu.set_reminder(c, "routine", gym["id"], "tomorrow"); assert False
    except goals.ValidationError as e: print("bad time ->", e)

print("disabled:", notify.run_once(T(today, "07:30"), sender))
with get_db() as c:
    fu.save_settings(c, {"notify_enabled": "1", "notify_briefing": "07:15"})

r = notify.run_once(T(today, "07:30"), sender); print("07:30", r)
for s in shown: print("  ", s)
assert {s[0] for s in shown} == {"🔁 Gym", "🔁 CPA", "☀️ Your day"}, shown
shown.clear()
print("07:31 again", notify.run_once(T(today, "07:31"), sender), shown)
assert not shown
r = notify.run_once(T(today, "18:45"), sender); print("18:45", r)
for s in shown: print("  ", s)
assert [s[0] for s in shown] == ["↩ Contract", "⏰ Call Mom"] or sorted(s[0] for s in shown) == ["↩ Contract", "⏰ Call Mom"]
assert all("was due" in s[1] for s in shown)
shown.clear()
# next day routines fire again; flood -> summary
tomorrow = today + timedelta(days=1)
with get_db() as c:
    for i in range(5):
        fu.add_notification(c, "test", f"n{i}", created := None) if False else fu.add_notification(c, "test", f"n{i}")
r = notify.run_once(T(tomorrow, "07:05"), sender); print("tomorrow", r, shown)
assert len(shown) == 1 and "reminders" in shown[0][0]
# stale notifications older than 24h are skipped
shown.clear()
with get_db() as c:
    c.execute("INSERT INTO notifications (kind, title, created_at) VALUES ('test', 'old', ?)", ((datetime.now() - timedelta(days=3)).isoformat(),))
notify.run_once(T(tomorrow, "07:06"), sender); print("stale skipped:", shown)
assert not shown

# briefing text
with get_db() as c:
    print("briefing:", notify.briefing(c, today))
    print("upcoming:", [(u["kind"], u["title"], u["at"]) for u in fu.upcoming(c)])
    print("toast xml:", notify.toast_xml("A & <b>", "x", "tasks", True))

# ---- AI actions + undo ----
def act(**kw):
    a = dict(BLANKS, type=kw.pop("type"), link_to_new_goal=False, done="", active="")
    a.update(kw)
    return normalize_action(a)

with get_db() as c:
    undo, summary = actions.apply_actions(c, [
        act(type="create_task", title="Pay rent", area="work", due_date=today.isoformat(), remind_at=f"{today}T20:00"),
        act(type="create_followup", title="Invoice", person="Mike", followup_kind="waiting", due_date=today.isoformat(), remind_at=f"{tomorrow}T10:00"),
        act(type="set_reminder", habit_id=gym["id"], remind_at="06:30"),
        act(type="update_followup", followup_id=f1["id"], done="yes"),
    ])
    print("summary:", summary)
    log_id = actions.log_command(c, "x", "y", undo)
with get_db() as c:
    print("after:", fu.get_reminder(c, "routine", gym["id"])["at"], len(fu.list_followups(c)))
    ctx = build_context(goals.list_goals(c), goals.list_tasks(c), habits.list_habits(c), {}, [], fu.list_followups(c))
    print(ctx.split("FOLLOW-UPS")[1])
    print([l for l in ctx.splitlines() if "Pay rent" in l or "Gym" in l])
with get_db() as c:
    print(actions.undo_command(c, log_id))
with get_db() as c:
    assert fu.get_reminder(c, "routine", gym["id"])["at"] == "07:00"
    assert len(fu.list_followups(c)) == 1 and not fu.get_followup(c, f1["id"])["done"]
    assert not [t for t in goals.list_tasks(c) if t["title"] == "Pay rent"]
    assert not c.execute("SELECT * FROM reminders WHERE kind='followup' AND ref_id != ?", (f1["id"],)).fetchall()
    try:
        actions.apply_actions(c, [act(type="set_reminder", remind_at="09:00")]); assert False
    except goals.ValidationError as e: print("set_reminder no target ->", e)
    undo, s = actions.apply_actions(c, [act(type="set_reminder", task_id=task["id"], remind_at="off")])
    print(s)

# ---- budget alerts ----
from backend.modules.finances import sync as fsync, service as fin
with get_db() as c:
    c.execute("INSERT INTO fin_accounts (id, name, updated_at) VALUES ('A','Chk','x')")
    c.execute("INSERT INTO fin_merchants (key, name, category, updated_at) VALUES ('out:cafe','Cafe','Dining & Coffee','x')")
    c.execute("INSERT INTO fin_transactions (id, account_id, posted, amount, merchant_key, created_at) VALUES ('A:1','A',?, -150, 'out:cafe','x')", (today.isoformat(),))
    fin.set_budget(c, "Dining & Coffee", 100)
    print("alerts:", fsync.budget_alerts(c), fsync.budget_alerts(c))
    print(fu.list_notifications(c, 1)[0]["title"])

# ---- API ----
from fastapi.testclient import TestClient
from backend.main import app
notify.task_installed = lambda: None
with TestClient(app) as cl:
    r = cl.post("/api/tasks", json={"title": "API task", "area": "work", "remind_at": f"{tomorrow}T09:30"}).json()
    print("api task", r["remind_at"])
    r = cl.patch(f"/api/tasks/{r['id']}", json={"remind_at": None}).json(); print("cleared", r["remind_at"])
    h = cl.post("/api/habits", json={"title": "Read", "area": "education", "remind_at": "21:00"}).json(); print("habit", h["remind_at"])
    h = cl.patch(f"/api/habits/{h['id']}", json={"remind_at": "22:15"}).json(); print("habit2", h["remind_at"])
    f = cl.post("/api/followups", json={"title": "Call bank", "remind_at": f"{tomorrow}T11:00"}).json(); print("fu", f)
    print(cl.patch(f"/api/followups/{f['id']}", json={"done": True}).json()["done"])
    print(cl.get("/api/followups").json()["summary"])
    print(cl.get("/api/reminders").status_code, len(cl.get("/api/reminders").json()))
    n = cl.get("/api/notifications").json(); print("notif", n["settings"], n["background"], n["unread"])
    print(cl.patch("/api/notifications/settings", json={"notify_briefing": "8am"}).json())
    print(cl.patch("/api/notifications/settings", json={"notify_briefing": "08:00", "notify_budget": False}).json())
    print(cl.put("/api/reminders/bogus/1", json={"at": "x"}).status_code)
    print(cl.post("/api/notifications/read").json(), cl.get("/api/followups").json()["summary"])
    print("enable (linux):", cl.post("/api/notifications/enable").json())
    print(cl.delete(f"/api/habits/{h['id']}").json())
print("ALL OK")
