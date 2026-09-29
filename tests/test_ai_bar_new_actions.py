"""AI bar: home jobs, marking upkeep done, bills, savings, block reminders, and undo for each."""
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backend.modules  # noqa: F401,E402
from backend import notify  # noqa: E402
from backend.database import get_db, init_db, set_setting  # noqa: E402
from backend.modules.assistant import actions  # noqa: E402
from backend.modules.assistant.claude_client import ACTION_SCHEMA, BLANKS, build_context, normalize_action  # noqa: E402
from backend.modules.assistant.routes import extra_context  # noqa: E402
from backend.modules.finances import planning  # noqa: E402
from backend.modules.home import service as home  # noqa: E402

init_db()
T = date.today()


def A(**kw):
    a = dict(BLANKS)
    a.update(type=kw.pop("type"), link_to_new_goal=False)
    a.update(kw)
    assert set(a) == set(ACTION_SCHEMA["properties"])
    return normalize_action(a)


def run(acts):
    with get_db() as c:
        undo, summary = actions.apply_actions(c, acts)
        lid = actions.log_command(c, "x", "y", undo)
    print(*summary, sep="\n")
    return lid


with get_db() as c:
    filt = home.save_item(c, {"name": "HVAC filter", "every_n": 3, "every_unit": "months", "last_done": "2026-01-01"})
    planning.save_savings(c, {"name": "Lisbon trip", "target": 1800, "saved": 1000})

lid = run([A(type="add_home_job", title="Fix the faucet", due_date=(T + timedelta(days=3)).isoformat(), description="home"),
           A(type="complete_home_item", item_id=filt["id"], price=24),
           A(type="add_bill", title="Rent", price=1450, date="2026-10-01"),
           A(type="add_to_savings", title="lisbon", price=200),
           A(type="add_schedule_block", start="19:00", end="21:00", title="CPA study", remind_at="10")])
with get_db() as c:
    ctx = build_context([], [], [], {}, [], [], extra_context(c))
    assert "Fix the faucet" in ctx and "Rent $1,450.00 day 1 monthly" in ctx and "Lisbon trip $1,200" in ctx, ctx
    assert home.get_item(c, filt["id"])["last_done"] == T.isoformat()
    assert c.execute("SELECT remind FROM schedule_blocks").fetchone()[0] == 10
    print(actions.undo_command(c, lid))
    assert home.get_item(c, filt["id"])["last_done"] == "2026-01-01"
    for t in ("fin_bills", "schedule_blocks", "maintenance_log"):
        assert c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0, t
    assert c.execute("SELECT COUNT(*) FROM maintenance").fetchone()[0] == 1
    assert c.execute("SELECT saved FROM fin_savings_goals").fetchone()[0] == 1000

# Savings goals that follow a bank account can't be topped up by hand.
with get_db() as c:
    c.execute("INSERT INTO fin_accounts (id, org, name, kind, balance, balance_date, updated_at) VALUES ('S', 'B', 'Savings', 'savings', 5000, '2026-01-01', 'x')")
    planning.save_savings(c, {"name": "Emergency fund", "target": 10000, "account_id": "S"})
try:
    run([A(type="add_to_savings", title="Emergency fund", price=50)])
    raise SystemExit("should have refused")
except Exception as e:  # noqa: BLE001
    assert "bank account" in str(e), e

# Block reminder fires 10 minutes before, once.
with get_db() as c:
    from backend.modules.schedule import service as schedule
    schedule.create_block(c, {"date": T.isoformat(), "start": "19:00", "end": "21:00", "title": "CPA study", "remind": 10})
    set_setting(c, "notify_enabled", "1")
at = datetime.combine(T, datetime.min.time()).replace(hour=18, minute=51)
with get_db(real=True) as c:
    notify.collect(c, at)
    notify.collect(c, at + timedelta(minutes=1))
    rows = c.execute("SELECT title, body FROM notifications WHERE kind = 'block'").fetchall()
assert len(rows) == 1 and rows[0]["body"].startswith("In 9 min"), [dict(r) for r in rows]

# Calendar alerts: 15 minutes before, from a cached list (Google is only asked every 15 minutes).
(Path(tmp) / "data").mkdir(exist_ok=True)
notify.ROOT = Path(tmp)
(Path(tmp) / "data" / "google_token.json").write_text("{}")
calls = []
from backend.modules.calendar import service as cal  # noqa: E402
cal.list_events = lambda start, days: calls.append(1) or [
    {"id": "e1", "title": "Dentist", "start": f"{T}T15:00", "end": f"{T}T16:00", "all_day": False, "location": "Main St"}]
with get_db(real=True) as c:
    set_setting(c, "notify_calendar", "15")
    for minute in (40, 44, 45, 50):
        notify.collect(c, datetime.combine(T, datetime.min.time()).replace(hour=14, minute=minute))
    ev = c.execute("SELECT title, body FROM notifications WHERE kind = 'event'").fetchall()
assert len(ev) == 1 and ev[0]["title"] == "📅 Dentist" and "Main St" in ev[0]["body"], [dict(r) for r in ev]
assert len(calls) == 1, calls
print("new ai actions ok")
