"""Desktop notifications: the part that runs even when the app is closed.

Windows Task Scheduler runs notifier.pyw once a minute (after you turn
notifications on in the app). Each run:
  1. turns due reminders into notifications (tasks, follow-ups, routines
     that aren't done yet, the morning briefing),
  2. shows any new notifications as Windows notifications (clicking one
     opens the app on the right page),
  3. once each morning, syncs your bank accounts (if Finances is connected)
     so budget alerts arrive even if you don't open the app.

This file deliberately loads only the database helpers (no web server, no
AI), so a run takes a fraction of a second.
"""
import logging
import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

from . import config
from .database import connect, get_setting, set_setting

ROOT = config.PROJECT_ROOT
APP_ID = "LifeControlCenter.App"            # how Windows knows our notifications
POWERSHELL_APP_ID = r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
TASK_NAME = "Life Control Center reminders"
PROTOCOL = "lifecc"                          # lifecc://open/<page> opens the app on that page
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
MAX_AGE = timedelta(hours=24)                # older undelivered notifications are skipped, not shown

log = logging.getLogger("notify")


def _now_iso(now: datetime) -> str:
    return now.isoformat(timespec="seconds")


def _add(conn, kind, title, body="", link="", ref_id=None, dedupe=None, now=None):
    conn.execute(
        "INSERT OR IGNORE INTO notifications (kind, ref_id, title, body, link, dedupe, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (kind, ref_id, title[:200], body[:500], link, dedupe, _now_iso(now or datetime.now())))


# ---------------------------------------------------------------------------
# 1. Which reminders are due?
# ---------------------------------------------------------------------------

def _habit_open_today(conn, h, today: date) -> bool:
    """True if a routine should still be done today (scheduled and not done yet)."""
    if not h["active"]:
        return False

    def done(day_iso):
        log_row = conn.execute("SELECT amount FROM habit_logs WHERE habit_id = ? AND date = ?",
                               (h["id"], day_iso)).fetchone()
        if not log_row:
            return False
        return not h["target_amount"] or log_row["amount"] is None or log_row["amount"] >= h["target_amount"]

    if done(today.isoformat()):
        return False
    if h["frequency"] == "weekdays":
        return str(today.weekday()) in (h["days"] or "").split(",")
    if h["frequency"] == "times_per_week":
        monday = today - timedelta(days=today.weekday())
        count = sum(1 for i in range(today.weekday() + 1) if done((monday + timedelta(days=i)).isoformat()))
        return count < (h["times_per_week"] or 1)
    return True


def _fmt_time(hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return f"{(h % 12) or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def collect(conn, now: datetime) -> int:
    """Create notifications for everything that's due. Returns how many."""
    before = conn.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]
    now_s = now.strftime("%Y-%m-%dT%H:%M")
    today = now.date()

    # One-off reminders on tasks and follow-ups.
    for r in conn.execute("SELECT * FROM reminders WHERE repeat = 'once' AND fired_at IS NULL AND at <= ?",
                          (now_s,)).fetchall():
        conn.execute("UPDATE reminders SET fired_at = ? WHERE id = ?", (_now_iso(now), r["id"]))
        late = datetime.fromisoformat(r["at"]) < now - timedelta(minutes=30)
        when = f" (was due {datetime.fromisoformat(r['at']).strftime('%a %b %d')}, {_fmt_time(r['at'][11:])})" if late else ""
        if r["kind"] == "task":
            t = conn.execute("SELECT title, done, due_date FROM tasks WHERE id = ?", (r["ref_id"],)).fetchone()
            if t and not t["done"]:
                due = ""
                if t["due_date"]:
                    due = "due today" if t["due_date"] == today.isoformat() else (
                        "overdue" if t["due_date"] < today.isoformat() else f"due {t['due_date']}")
                _add(conn, "task", f"⏰ {t['title']}", "Task reminder" + (f" · {due}" if due else "") + when,
                     "tasks", r["ref_id"], f"rem:{r['id']}:{r['at']}", now)
        elif r["kind"] == "followup":
            f = conn.execute("SELECT title, person, direction, done FROM followups WHERE id = ?",
                             (r["ref_id"],)).fetchone()
            if f and not f["done"]:
                who = f" · {f['person']}" if f["person"] else ""
                body = ("Waiting on" if f["direction"] == "waiting" else "Follow up") + who + when
                _add(conn, "followup", f"↩ {f['title']}", body, "followups", r["ref_id"],
                     f"rem:{r['id']}:{r['at']}", now)

    # Daily routine reminders: only if the routine is still to do today.
    for r in conn.execute("SELECT * FROM reminders WHERE repeat = 'daily' AND at <= ? "
                          "AND (last_date IS NULL OR last_date < ?)",
                          (now.strftime("%H:%M"), today.isoformat())).fetchall():
        conn.execute("UPDATE reminders SET last_date = ? WHERE id = ?", (today.isoformat(), r["id"]))
        h = conn.execute("SELECT * FROM habits WHERE id = ?", (r["ref_id"],)).fetchone()
        if h and _habit_open_today(conn, h, today):
            target = f" · {h['target_amount']:g} {h['unit'] or ''}".rstrip() if h["target_amount"] else ""
            _add(conn, "routine", f"🔁 {h['title']}", f"Not checked off yet today{target}", "routines",
                 h["id"], f"routine:{h['id']}:{today.isoformat()}", now)

    # Morning briefing, once a day at the chosen time.
    brief_at = get_setting(conn, "notify_briefing") or ""
    if brief_at and now.strftime("%H:%M") >= brief_at and get_setting(conn, "notify_briefing_last") != today.isoformat():
        set_setting(conn, "notify_briefing_last", today.isoformat())
        body = briefing(conn, today)
        if body:
            _add(conn, "briefing", "☀️ Your day", body, "dashboard", None, f"briefing:{today.isoformat()}", now)

    return conn.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] - before


def briefing(conn, today: date) -> str:
    t = today.isoformat()
    parts = []
    due = conn.execute("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date = ?", (t,)).fetchone()[0]
    overdue = conn.execute("SELECT COUNT(*) FROM tasks WHERE done = 0 AND due_date < ?", (t,)).fetchone()[0]
    if due or overdue:
        parts.append(f"{due} task{'s' if due != 1 else ''} due" + (f" ({overdue} overdue)" if overdue else ""))
    routines = sum(1 for h in conn.execute("SELECT * FROM habits WHERE active = 1").fetchall()
                   if _habit_open_today(conn, h, today))
    if routines:
        parts.append(f"{routines} routine{'s' if routines != 1 else ''} to do")
    fu = conn.execute("SELECT COUNT(*) FROM followups WHERE done = 0 AND due_date <= ?", (t,)).fetchone()[0]
    if fu:
        parts.append(f"{fu} follow-up{'s' if fu != 1 else ''} due")
    try:
        yesterday = (today - timedelta(days=1)).isoformat()
        from .modules.finances import service as fin  # only loaded once a day
        y = fin.totals(conn, yesterday, yesterday)
        if y["income"] > 0:
            parts.append(f"yesterday +${y['income']:,.0f} in, ${y['spending']:,.0f} out")
        elif y["spending"] > 0:
            parts.append(f"${y['spending']:,.0f} spent yesterday")
    except Exception:  # noqa: BLE001 (Finances not set up, or anything else: skip that line)
        pass
    return " · ".join(parts)


# ---------------------------------------------------------------------------
# 2. Showing notifications
# ---------------------------------------------------------------------------

def toast_xml(title: str, body: str, link: str, reminder: bool) -> str:
    target = escape(f"{PROTOCOL}://open/{link or 'dashboard'}", {'"': "&quot;"})
    actions = (f'<actions><action content="Open" activationType="protocol" arguments="{target}"/>'
               '<action content="Dismiss" activationType="system" arguments="dismiss"/></actions>') if reminder else ""
    scenario = ' scenario="reminder"' if reminder else ""  # reminders stay on screen until dismissed
    return (f'<toast activationType="protocol" launch="{target}"{scenario}>'
            f'<visual><binding template="ToastGeneric"><text>{escape(title)}</text><text>{escape(body)}</text>'
            f'</binding></visual>{actions}</toast>')


TOAST_PS = r"""
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($env:LCC_TOAST_XML)
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:LCC_APP_ID).Show($toast)
"""


def send_toast(title: str, body: str, link: str = "", reminder: bool = False) -> None:
    """Show one notification on this computer. Raises RuntimeError if it couldn't."""
    if os.name == "nt":
        register_app()
        xml = toast_xml(title, body, link, reminder)
        for app_id in (APP_ID, POWERSHELL_APP_ID):
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", TOAST_PS],
                env={**os.environ, "LCC_TOAST_XML": xml, "LCC_APP_ID": app_id},
                capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW)
            if result.returncode == 0:
                return
            log.warning("Toast via %s failed: %s", app_id, result.stderr.strip()[:500])
        raise RuntimeError("Windows didn't accept the notification.")
    if sys.platform == "darwin":
        script = f"display notification {_applescript(body)} with title {_applescript(title)}"
        subprocess.run(["osascript", "-e", script], check=True, timeout=15)
        return
    try:
        subprocess.run(["notify-send", "-a", "Life Control Center", title, body], check=True, timeout=15)
    except FileNotFoundError:
        raise RuntimeError("This computer has no notification tool (notify-send).")


def _applescript(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def deliver(conn, now: datetime, sender=None) -> int:
    """Show undelivered notifications. Returns how many were shown."""
    sender = sender or send_toast
    rows = conn.execute("SELECT * FROM notifications WHERE delivered_at IS NULL ORDER BY id").fetchall()
    stamp = _now_iso(now)
    fresh = [r for r in rows if datetime.fromisoformat(r["created_at"]) >= now - MAX_AGE]
    for r in rows:
        conn.execute("UPDATE notifications SET delivered_at = ? WHERE id = ?", (stamp, r["id"]))
    conn.commit()  # mark first, so a crash never repeats notifications every minute
    if not fresh:
        return 0
    if len(fresh) > 4:  # don't flood the screen: one summary instead
        titles = ", ".join(r["title"] for r in fresh[:4])
        sender(f"{len(fresh)} reminders", f"{titles}…", "followups", False)
        return 1
    for r in fresh:
        sender(r["title"], r["body"], r["link"], r["kind"] in ("task", "followup", "routine"))
    return len(fresh)


# ---------------------------------------------------------------------------
# 3. The once-a-minute run (notifier.pyw)
# ---------------------------------------------------------------------------

def run_once(now: datetime | None = None, sender=None) -> dict:
    now = now or datetime.now()
    if not config.DATABASE_PATH.exists():  # always your real data, even while demo mode is on
        return {"skipped": "no database yet"}
    conn = connect(real=True)
    try:
        if get_setting(conn, "notify_enabled") != "1":
            return {"skipped": "notifications are off"}
        created = collect(conn, now)
        conn.commit()
        from .database import demo_on
        # While demo mode is on, hold your real reminders (they'd show your own
        # information on screen); they appear once demo mode is turned off.
        shown = 0 if demo_on() else deliver(conn, now, sender)
    except sqlite3.OperationalError as e:  # e.g. tables not created yet (app never started since the update)
        return {"skipped": str(e)}
    finally:
        conn.close()
    synced = morning_finance_sync(now)
    return {"created": created, "shown": shown, "synced": synced}


def morning_finance_sync(now: datetime) -> bool:
    """Once each morning, refresh bank data so budget alerts don't wait for you to open the app."""
    from .database import demo_on
    if now.hour < 6 or demo_on() or not (ROOT / "data" / "simplefin.json").exists():
        return False
    conn = connect(real=True)
    try:
        last = get_setting(conn, "fin_last_sync") or ""
        tried = get_setting(conn, "fin_auto_sync_day") or ""
        if last[:10] == now.date().isoformat() or tried == now.date().isoformat():
            return False
        set_setting(conn, "fin_auto_sync_day", now.date().isoformat())  # at most one try a day
        conn.commit()
    finally:
        conn.close()
    try:
        from .modules.finances import sync  # the full app code: loaded only for this
        sync.run_sync()
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("Morning bank sync failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Turning it on and off (Windows)
# ---------------------------------------------------------------------------

def pythonw() -> str:
    exe = Path(sys.executable)
    candidate = exe.with_name("pythonw.exe")
    return str(candidate if candidate.exists() else exe)


def register_app() -> None:
    """Tell Windows our app's name and icon (for the notification header), and
    register lifecc:// so clicking a notification opens the app."""
    if os.name != "nt":
        return
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\AppUserModelId\{APP_ID}") as key:
        winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Life Control Center")
        winreg.SetValueEx(key, "IconUri", 0, winreg.REG_SZ, str(ROOT / "frontend" / "icon.png"))
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{PROTOCOL}") as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "URL:Life Control Center")
        winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\{PROTOCOL}\shell\open\command") as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{pythonw()}" "{ROOT / "launcher.pyw"}" "%1"')


TASK_PS = r"""
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute $env:LCC_PYW -Argument ('"' + $env:LCC_SCRIPT + '"') -WorkingDirectory $env:LCC_ROOT
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $env:LCC_TASK -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Shows Life Control Center reminders. Runs a quick check once a minute.' -Force | Out-Null
"""


def install_task() -> None:
    """Create (or update) the once-a-minute scheduled task. Raises RuntimeError on failure."""
    if os.name != "nt":
        raise RuntimeError("Desktop notifications in the background are set up for Windows only.")
    register_app()
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", TASK_PS],
        env={**os.environ, "LCC_PYW": pythonw(), "LCC_SCRIPT": str(ROOT / "notifier.pyw"),
             "LCC_ROOT": str(ROOT), "LCC_TASK": TASK_NAME},
        capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW)
    if result.returncode != 0:
        log.warning("Couldn't create the scheduled task: %s", result.stderr.strip()[:800])
        raise RuntimeError("Windows didn't let the app schedule its reminder check. "
                           "Details are in data\\app.log.")


def remove_task() -> None:
    if os.name != "nt":
        return
    subprocess.run(["schtasks", "/Delete", "/TN", TASK_NAME, "/F"], capture_output=True, timeout=30,
                   creationflags=NO_WINDOW)


def task_installed() -> bool | None:
    """True/False on Windows; None where background reminders aren't supported."""
    if os.name != "nt":
        return None
    result = subprocess.run(["schtasks", "/Query", "/TN", TASK_NAME], capture_output=True, timeout=30,
                            creationflags=NO_WINDOW)
    return result.returncode == 0
