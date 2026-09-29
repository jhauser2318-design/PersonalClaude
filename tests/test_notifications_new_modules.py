import os, sys, tempfile, shutil
from datetime import date, datetime, timedelta
tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import get_db, init_db
init_db()
from backend.demo.seed import seed
from backend import notify
with get_db() as c:
    seed(c)
    today = date.today()
    n = notify.collect(c, datetime.combine(today, datetime.min.time()).replace(hour=9, minute=30))
    rows = c.execute("SELECT kind, title, body FROM notifications WHERE delivered_at IS NULL").fetchall()
    for r in rows: print(r["kind"], "|", r["title"], "|", r["body"])
    assert notify.collect(c, datetime.combine(today, datetime.min.time()).replace(hour=9, minute=31)) == 0  # deduped
    sunday = today + timedelta(days=(6 - today.weekday()))
    notify.collect(c, datetime.combine(sunday, datetime.min.time()).replace(hour=18, minute=5))
    assert c.execute("SELECT COUNT(*) FROM notifications WHERE kind='review'").fetchone()[0] == 1
    print(notify.briefing(c, today))
print("notify ok")
