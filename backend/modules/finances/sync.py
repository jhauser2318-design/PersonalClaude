"""Pulling fresh data from SimpleFIN into the local database.

A sync runs when the app starts and when you open the Finances page (if the
last one is more than a few hours old), or when you click "Sync now".
SimpleFIN itself refreshes from your banks about once a day.
"""
import logging
import threading
from datetime import date, datetime, timedelta

from ...database import demo_on, get_db
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
    if demo_on():  # never pull real bank data into the demo
        return {"accounts": 0, "new": 0, "demo": True}
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
    with get_db() as conn:
        result["alerts"] = budget_alerts(conn)
        from . import planning
        planning.sync_goal_progress(conn)
    return result


def budget_alerts(conn) -> int:
    """Queue a notification the first time a category goes over its budget this month."""
    from ..followups import service as followups
    settings = followups.get_settings(conn)
    if settings["notify_enabled"] != "1" or settings["notify_budget"] != "1":
        return 0
    month = service.month_summary(conn)
    sent = 0
    for row in month["categories"]:
        if row.get("status") != "over":
            continue
        over = row["spent"] - row["budget"]
        sent += followups.add_notification(
            conn, "budget", f"💸 Over budget: {row['category']}",
            f"${row['spent']:,.0f} spent of ${row['budget']:,.0f} this month (${over:,.0f} over)",
            "finances", dedupe=f"budget:{month['month']}:{row['category']}")
    return sent


def sync_in_background(only_if_stale: bool = True) -> bool:
    """Start a sync without waiting for it. Returns True if one was started."""
    if demo_on() or not simplefin.is_connected() or (only_if_stale and not is_stale()):
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
