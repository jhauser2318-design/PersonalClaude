"""Life Control Center - reminder check (runs in the background).

Windows Task Scheduler runs this once a minute after you turn on desktop
notifications (Follow-ups page). It shows any reminders that are due, even
when the app's window is closed. See backend/notify.py.

Problems are written to data/notifier.log.
"""
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

LOG = ROOT / "data" / "notifier.log"
if LOG.exists() and LOG.stat().st_size > 300_000:
    LOG.unlink()
LOG.parent.mkdir(exist_ok=True)
logging.basicConfig(filename=LOG, level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")

try:
    from backend import notify
    notify.run_once()
except Exception:  # noqa: BLE001
    logging.exception("Reminder check failed")
