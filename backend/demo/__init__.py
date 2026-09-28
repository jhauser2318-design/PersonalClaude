"""Demo mode: show the app with made-up data, without showing your own.

Turning it on builds a separate database (data/demo.db) full of sample data
(backend/demo/seed.py) and switches the app to it; Google Calendar and Gmail
are replaced by a built-in sample calendar and inbox (fake_google.py), and bank
syncing is paused. Your real database, Google connection and bank link are
never touched. Turning it off switches straight back.

Always your real settings, even in demo mode: phone sign-in, notification
settings and AI model choices.
"""
import json
import os
import time
from datetime import datetime

from .. import database
from ..database import DEMO_FLAG, DEMO_PATH, demo_on, init_db
from . import fake_google


def status() -> dict:
    info = {}
    if demo_on():
        try:
            info = json.loads(DEMO_FLAG.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            info = {}
    return {"on": demo_on(), "started_at": info.get("started_at")}


def _forget_caches() -> None:
    fake_google.reset()
    from ..modules.calendar import service as calendar
    calendar._time_zone = None
    database._changes["n"] += 1  # every open window (PC and phone) redraws


def _build() -> None:
    """Build fresh sample data in a temporary file, then swap it in."""
    from .seed import seed
    tmp = DEMO_PATH.with_name("demo-building.db")
    for p in (tmp, tmp.with_name(tmp.name + "-journal")):
        p.unlink(missing_ok=True)
    init_db(tmp)
    with database.get_db(path=tmp) as conn:
        seed(conn)
    for attempt in range(20):  # the old demo file may be open for a moment
        try:
            os.replace(tmp, DEMO_PATH)
            return
        except PermissionError:
            time.sleep(0.1)
    raise RuntimeError("Couldn't replace the demo data. Try again in a moment.")


def enable() -> dict:
    _build()
    DEMO_FLAG.write_text(json.dumps({"started_at": datetime.now().isoformat(timespec="seconds")}), encoding="utf-8")
    _forget_caches()
    return status()


def reset() -> dict:
    """Fresh sample data (undoes anything changed while showing the demo)."""
    return enable()


def disable() -> dict:
    DEMO_FLAG.unlink(missing_ok=True)
    _forget_caches()
    return status()
