"""Follow-ups, reminders and the notification history.

- A follow-up is something you promised to do ("I need to…") or are waiting
  on from someone ("Waiting on…"), with an optional due date.
- A reminder can be attached to a task or follow-up (once, at a date and
  time) or to a routine (every day at a time, only if it isn't done yet).
- When a reminder is due, a row is added to `notifications`, and the
  background checker (backend/notify.py) shows it as a Windows notification.
"""
import re
from datetime import date, datetime

from ...database import get_setting, register_schema, row_to_dict, set_setting
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS followups (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        person     TEXT NOT NULL DEFAULT '',
        direction  TEXT NOT NULL DEFAULT 'todo',   -- todo: I need to · waiting: waiting on them
        notes      TEXT NOT NULL DEFAULT '',
        due_date   TEXT,
        done       INTEGER NOT NULL DEFAULT 0,
        done_at    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        kind       TEXT NOT NULL,                  -- task | followup | routine
        ref_id     INTEGER NOT NULL,
        at         TEXT NOT NULL,                  -- "YYYY-MM-DDTHH:MM" (once) or "HH:MM" (daily)
        repeat     TEXT NOT NULL DEFAULT 'once',   -- once | daily
        fired_at   TEXT,                           -- once: when it went off
        last_date  TEXT,                           -- daily: the last day it was handled
        created_at TEXT NOT NULL,
        UNIQUE (kind, ref_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        kind         TEXT NOT NULL,                -- task | followup | routine | briefing | budget | test
        ref_id       INTEGER,
        title        TEXT NOT NULL,
        body         TEXT NOT NULL DEFAULT '',
        link         TEXT NOT NULL DEFAULT '',     -- page to open, e.g. "tasks"
        dedupe       TEXT UNIQUE,
        created_at   TEXT NOT NULL,
        delivered_at TEXT,
        read_at      TEXT
    );
    """
)

DIRECTIONS = ("todo", "waiting")
KINDS = {"task": "once", "followup": "once", "routine": "daily"}
LINKS = {"task": "tasks", "followup": "followups", "routine": "routines"}

# Settings (in app_settings) and their defaults.
SETTINGS = {"notify_enabled": "0", "notify_briefing": "", "notify_budget": "1"}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def get_settings(conn) -> dict:
    return {k: (get_setting(conn, k) if get_setting(conn, k) is not None else v) for k, v in SETTINGS.items()}


def save_settings(conn, fields: dict) -> dict:
    for key, value in fields.items():
        if key not in SETTINGS or value is None:
            continue
        value = str(value)
        if key == "notify_briefing" and value and not re.fullmatch(r"\d{2}:\d{2}", value):
            raise ValidationError("Morning briefing time must look like 08:00")
        if key in ("notify_enabled", "notify_budget"):
            value = "1" if value in ("1", "True", "true") else "0"
        set_setting(conn, key, value)
    return get_settings(conn)


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------

def clean_when(kind: str, at: str) -> str:
    """Check a reminder time and return it in the stored format."""
    at = (at or "").strip()
    if KINDS.get(kind) == "daily":
        m = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", at[-8:] if "T" in at else at)
        if not m or int(m[1]) > 23 or int(m[2]) > 59:
            raise ValidationError("A routine reminder needs a time of day, like 07:30")
        return f"{int(m[1]):02d}:{m[2]}"
    try:
        if len(at) == 10:  # just a date: remind at 9 in the morning
            when = datetime.combine(date.fromisoformat(at), datetime.min.time()).replace(hour=9)
        else:
            when = datetime.fromisoformat(at.replace(" ", "T"))
    except ValueError:
        raise ValidationError("A reminder needs a date and time, like 2026-10-02T09:00")
    return when.strftime("%Y-%m-%dT%H:%M")


def get_reminder(conn, kind: str, ref_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM reminders WHERE kind = ? AND ref_id = ?",
                                    (kind, ref_id)).fetchone())


def set_reminder(conn, kind: str, ref_id: int, at: str | None) -> dict | None:
    """Add, change (at = time) or remove (at = None/"") the reminder on an item."""
    if kind not in KINDS:
        raise ValidationError(f"Unknown reminder type '{kind}'")
    if not at:
        conn.execute("DELETE FROM reminders WHERE kind = ? AND ref_id = ?", (kind, ref_id))
        return None
    at = clean_when(kind, at)
    repeat = KINDS[kind]
    now = datetime.now()
    # A daily reminder set for a time that has already passed starts tomorrow.
    last_date = now.date().isoformat() if repeat == "daily" and at <= now.strftime("%H:%M") else None
    conn.execute(
        "INSERT INTO reminders (kind, ref_id, at, repeat, fired_at, last_date, created_at) "
        "VALUES (?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(kind, ref_id) DO UPDATE SET at = excluded.at, "
        "repeat = excluded.repeat, fired_at = NULL, last_date = excluded.last_date",
        (kind, ref_id, at, repeat, last_date, now_iso()))
    return get_reminder(conn, kind, ref_id)


def restore_reminder(conn, kind: str, ref_id: int, before: dict | None):
    """Put a reminder back exactly as it was (used by Undo)."""
    conn.execute("DELETE FROM reminders WHERE kind = ? AND ref_id = ?", (kind, ref_id))
    if before:
        cols = [c for c in before if c != "id"]
        conn.execute(f"INSERT INTO reminders ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                     [before[c] for c in cols])


def pending_reminder(conn, kind: str, ref_id: int) -> str | None:
    """The reminder time to show on an item, or None (once-reminders that already went off don't count)."""
    row = get_reminder(conn, kind, ref_id)
    if not row or (row["repeat"] == "once" and row["fired_at"]):
        return None
    return row["at"]


def upcoming(conn) -> list[dict]:
    """Every reminder that will still go off, with the item's title."""
    rows = conn.execute(
        """SELECT r.*, COALESCE(t.title, f.title, h.title) AS title,
                  COALESCE(t.done, f.done, 1 - h.active) AS closed
           FROM reminders r
           LEFT JOIN tasks t ON r.kind = 'task' AND t.id = r.ref_id
           LEFT JOIN followups f ON r.kind = 'followup' AND f.id = r.ref_id
           LEFT JOIN habits h ON r.kind = 'routine' AND h.id = r.ref_id
           WHERE (r.repeat = 'daily' OR r.fired_at IS NULL)""").fetchall()
    out = [dict(r) for r in rows if r["title"] is not None and not r["closed"]]
    # Daily ones sort by their time today; one-off ones by date.
    today = date.today().isoformat()
    return sorted(out, key=lambda r: r["at"] if r["repeat"] == "once" else f"{today}T{r['at']}")


# ---------------------------------------------------------------------------
# Follow-ups
# ---------------------------------------------------------------------------

def _clean_followup(fields: dict) -> dict:
    out = {}
    for key in ("title", "person", "direction", "notes", "due_date", "done"):
        if key not in fields or fields[key] is None and key not in ("due_date",):
            continue
        value = fields[key]
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A follow-up needs a title")
        elif key in ("person", "notes"):
            value = (value or "").strip()
        elif key == "direction":
            if value not in DIRECTIONS:
                raise ValidationError("A follow-up is either something you need to do or something you're waiting on")
        elif key == "due_date":
            if value:
                try:
                    value = date.fromisoformat(str(value)[:10]).isoformat()
                except ValueError:
                    raise ValidationError("Due date must look like 2026-10-02")
            else:
                value = None
        elif key == "done":
            value = 1 if value else 0
        out[key] = value
    return out


def get_followup(conn, fid: int) -> dict | None:
    row = row_to_dict(conn.execute("SELECT * FROM followups WHERE id = ?", (fid,)).fetchone())
    if row:
        row["remind_at"] = pending_reminder(conn, "followup", fid)
    return row


def list_followups(conn) -> list[dict]:
    rows = conn.execute("SELECT id FROM followups ORDER BY done, due_date IS NULL, due_date, id").fetchall()
    return [get_followup(conn, r["id"]) for r in rows]


def create_followup(conn, fields: dict) -> dict:
    data = {"person": "", "direction": "todo", "notes": "", "due_date": None, "done": 0}
    data.update(_clean_followup(fields))
    if not data.get("title"):
        raise ValidationError("A follow-up needs a title")
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO followups (title, person, direction, notes, due_date, done, done_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (data["title"], data["person"], data["direction"], data["notes"], data["due_date"], data["done"],
         ts if data["done"] else None, ts, ts))
    return get_followup(conn, cur.lastrowid)


def update_followup(conn, fid: int, fields: dict) -> dict:
    current = get_followup(conn, fid)
    if current is None:
        raise ValidationError(f"Follow-up #{fid} doesn't exist")
    data = _clean_followup(fields)
    if "done" in data and data["done"] != current["done"]:
        data["done_at"] = now_iso() if data["done"] else None
    if data:
        data["updated_at"] = now_iso()
        conn.execute(f"UPDATE followups SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?",
                     (*data.values(), fid))
    return get_followup(conn, fid)


def delete_followup(conn, fid: int) -> None:
    conn.execute("DELETE FROM followups WHERE id = ?", (fid,))
    conn.execute("DELETE FROM reminders WHERE kind = 'followup' AND ref_id = ?", (fid,))


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def add_notification(conn, kind: str, title: str, body: str = "", link: str = "", ref_id: int | None = None,
                     dedupe: str | None = None) -> bool:
    """Queue a notification. Returns False if one with the same `dedupe` key already exists."""
    cur = conn.execute(
        "INSERT OR IGNORE INTO notifications (kind, ref_id, title, body, link, dedupe, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)", (kind, ref_id, title[:200], body[:500], link, dedupe, now_iso()))
    return cur.rowcount > 0


def list_notifications(conn, limit: int = 30) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (limit,))]


def unread_count(conn) -> int:
    return conn.execute("SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL").fetchone()["n"]


def mark_all_read(conn) -> None:
    conn.execute("UPDATE notifications SET read_at = ? WHERE read_at IS NULL", (now_iso(),))


def summary(conn) -> dict:
    today = date.today().isoformat()
    rows = conn.execute("SELECT direction, due_date FROM followups WHERE done = 0").fetchall()
    return {
        "open": len(rows),
        "waiting": sum(1 for r in rows if r["direction"] == "waiting"),
        "due": sum(1 for r in rows if r["due_date"] and r["due_date"] <= today),
        "unread": unread_count(conn),
    }
