"""Journal: one entry per day, autosaved, searchable, with a nightly nudge."""
import os, sys, tempfile
from datetime import date, datetime, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import get_db, init_db
init_db()
from fastapi.testclient import TestClient
from backend.main import app
from backend import notify, search
from backend.modules.assistant import actions
c = TestClient(app)
T = date.today()
t, y = T.isoformat(), (T - timedelta(days=1)).isoformat()

assert c.get(f"/api/journal/{t}").json()["new"] is True
o = c.get("/api/journal").json()
assert o["total"] == 0 and o["streak"] == 0 and not o["written_today"] and o["remind_at"] == "21:30"

# Write tonight, then keep typing (autosave updates the same entry).
c.put(f"/api/journal/{t}", json={"body": "Long day."})
e = c.put(f"/api/journal/{t}", json={"body": "Long day. Gym was great though"}).json()
assert e["words"] == 6 and e["mood"] is None, e
e = c.put(f"/api/journal/{t}", json={"mood": 4}).json()
assert e["mood"] == 4 and e["body"].startswith("Long day"), e  # mood alone keeps the text
assert c.put(f"/api/journal/{t}", json={"clear_mood": True}).json()["mood"] is None

# A missed night can be written later; future days can't.
c.put(f"/api/journal/{y}", json={"body": "Forgot to write: dinner with Sam at the ramen place", "mood": 5})
assert c.put(f"/api/journal/{(T + timedelta(days=1)).isoformat()}", json={"body": "x"}).status_code == 400
o = c.get("/api/journal").json()
assert o["total"] == 2 and o["streak"] == 2 and o["written_today"], o
assert [x["date"] for x in o["entries"]] == [t, y] and "body" not in o["entries"][0]
assert [x["date"] for x in c.get("/api/journal?q=ramen").json()["entries"]] == [y]

# Search across the app finds it.
with get_db() as conn:
    groups = search.search(conn, "ramen")
assert any(g["group"] == "Journal" and g["items"][0]["link"] == f"journal/{y}" for g in groups), groups

# Clearing the text (and no mood) removes the entry.
assert c.put(f"/api/journal/{y}", json={"body": "  ", "clear_mood": True}).json()["new"] is True
assert c.get("/api/journal").json()["total"] == 1

# Nightly reminder: only after the chosen time, only if tonight isn't written.
with get_db() as conn:
    night = datetime.combine(T, datetime.min.time()).replace(hour=21, minute=45)
    notify.collect(conn, night)
    assert not conn.execute("SELECT 1 FROM notifications WHERE kind = 'journal'").fetchone()
    conn.execute("DELETE FROM journal_entries")
    notify.collect(conn, night.replace(hour=20))
    assert not conn.execute("SELECT 1 FROM notifications WHERE kind = 'journal'").fetchone()
    notify.collect(conn, night); notify.collect(conn, night.replace(minute=50))
    assert conn.execute("SELECT COUNT(*) FROM notifications WHERE kind = 'journal'").fetchone()[0] == 1
assert c.put("/api/journal/settings", json={"remind_at": "25:00"}).status_code == 400
assert c.put("/api/journal/settings", json={"remind_at": ""}).json()["remind_at"] == ""
assert c.get("/api/journal").json()["remind_at"] == ""

# AI bar: "journal: ..." adds to the day's entry, and undo puts it back.
from backend.modules.journal import service as journal
c.put(f"/api/journal/{t}", json={"body": "Morning notes."})
with get_db() as conn:
    undo, summary = actions.apply_actions(conn, [{"type": "add_journal", "note": "Presentation went well.", "date": "", "amount": 4}])
    assert summary and "journal" in summary[0], summary
    e = journal.get_entry(conn, t)
    assert e["body"] == "Morning notes.\n\nPresentation went well." and e["mood"] == 4, e
    log_id = actions.log_command(conn, "journal: presentation went well", "ok", undo)
    actions.undo_command(conn, log_id)
    e = journal.get_entry(conn, t)
    assert e["body"] == "Morning notes." and e["mood"] is None, e
print("journal ok")
