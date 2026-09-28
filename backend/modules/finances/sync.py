"""Pulling fresh data from SimpleFIN into the local database.

A sync runs when the app starts and when you open the Finances page (if the
last one is more than a few hours old), or when you click "Sync now".
SimpleFIN itself refreshes from your banks about once a day.
"""
import logging
import threading
from datetime import date, datetime, timedelta

from ...database import get_db
from ..assistant.claude_client import AssistantError
from . import assistant, service, simplefin

FIRST_SYNC_DAYS = 90   # how far back the first sync reaches (SimpleFIN keeps about 90 days)
OVERLAP_DAYS = 14      # later syncs re-read the last 2 weeks, catching pending charges that posted
STALE_HOURS = 6

log = logging.getLogger(__name__)
_lock = threading.Lock()  # held while a sync runs, so two never overlap


def is_running() -> bool:
    return _lock.locked()


def is_stale() -> bool:
    with get_db() as conn:
        last = service.sync_status(conn)["last_sync"]
    if not last:
        return True
    try:
        return datetime.now() - datetime.fromisoformat(last[:19]) > timedelta(hours=STALE_HOURS)
    except ValueError:
        return True


def run_sync() -> dict:
    """Fetch, save, then let the AI sort any new merchants. Raises FinanceError on failure."""
    if not _lock.acquire(blocking=False):
        return {"busy": True}
    try:
        return _sync()
    finally:
        _lock.release()


def _sync() -> dict:
    with get_db() as conn:
        latest = service.latest_posted(conn)
    start = (date.fromisoformat(latest) - timedelta(days=OVERLAP_DAYS)) if latest else \
        date.today() - timedelta(days=FIRST_SYNC_DAYS)
    start_ts = datetime.combine(start, datetime.min.time()).timestamp()
    try:
        data = simplefin.fetch_accounts(start_ts)
    except simplefin.FinanceError as e:
        with get_db() as conn:
            service.save_sync_status(conn, ok=False, error=str(e))
        raise
    with get_db() as conn:
        result = service.store_sync(conn, data["accounts"])
        service.save_sync_status(conn, ok=True, messages=data["messages"])
    result["messages"] = data["messages"]
    try:
        result["categorized"] = assistant.categorize()
    except AssistantError as e:
        result["categorize_error"] = str(e)
    return result


def sync_in_background(only_if_stale: bool = True) -> bool:
    """Start a sync without waiting for it. Returns True if one was started."""
    if not simplefin.is_connected() or (only_if_stale and not is_stale()):
        return False
    # Take the lock now (not in the thread), so the page sees "syncing" right away.
    if not _lock.acquire(blocking=False):
        return False

    def work():
        try:
            _sync()
        except Exception as e:  # noqa: BLE001 (already saved as last_error; never crash the app)
            log.warning("Finance sync failed: %s", e)
        finally:
            _lock.release()

    threading.Thread(target=work, daemon=True).start()
    return True
