"""Backups: daily copy, keeping 14, extra folder, restore (with a safety copy), tidy-up."""
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/data/life.db"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backend.modules  # noqa: F401,E402
from backend import backup  # noqa: E402
from backend.database import get_db, init_db, set_setting  # noqa: E402
from backend.modules.goals import service as goals  # noqa: E402

init_db()
backup.BACKUP_DIR = Path(tmp) / "data" / "backups"
with get_db(real=True) as c:
    goals.create_goal(c, {"title": "Before", "area": "work"})
    c.execute("CREATE TABLE workouts (id INTEGER)")  # a leftover table from a removed page

assert backup.daily() is True and backup.daily() is False  # once a day
first = backup.list_backups()
assert len(first) == 1, first

extra = Path(tmp) / "OneDrive"
extra.mkdir()
with get_db(real=True) as c:
    set_setting(c, "backup_folder", str(extra))
    goals.create_goal(c, {"title": "After", "area": "work"})
r = backup.backup_now()
assert r["extra"] and (extra / "Life Control Center backups" / r["name"]).exists(), r

# Restore the first backup: "After" disappears, and a safety copy of the current data is saved.
out = backup.restore(first[0]["name"])
with get_db(real=True) as c:
    titles = [g["title"] for g in goals.list_goals(c)]
assert titles == ["Before"], titles
assert any(b["before_restore"] for b in backup.list_backups())
backup.restore(out["saved_current_as"])  # and the restore can be undone
with get_db(real=True) as c:
    assert sorted(g["title"] for g in goals.list_goals(c)) == ["After", "Before"]

# Only the newest 14 are kept.
for _ in range(16):
    backup.backup_now()
assert len(list(backup.BACKUP_DIR.glob("life-*.db"))) == 14

# Tidy: old delivered notifications and undo history go; leftover tables are dropped (a backup exists).
old = (datetime.now() - timedelta(days=120)).isoformat(timespec="seconds")
with get_db(real=True) as c:
    c.execute("INSERT INTO notifications (kind, title, created_at, delivered_at) VALUES ('x', 'old', ?, ?)", (old, old))
    c.execute("INSERT INTO notifications (kind, title, created_at) VALUES ('x', 'new', ?)", (datetime.now().isoformat(),))
    c.execute("INSERT INTO command_log (text, reply, changes, created_at) VALUES ('a', 'b', '[]', ?)", (old,))
res = backup.tidy()
with get_db(real=True) as c:
    assert [r[0] for r in c.execute("SELECT title FROM notifications")] == ["new"]
    assert c.execute("SELECT COUNT(*) FROM command_log").fetchone()[0] == 0
    assert not c.execute("SELECT 1 FROM sqlite_master WHERE name = 'workouts'").fetchone()
# (the leftover table was already dropped by the first daily run, right after its backup)
print("backups ok")
