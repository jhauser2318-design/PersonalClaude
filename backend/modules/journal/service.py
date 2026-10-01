"""Journal: one entry per day, written whenever you like (usually at night).

Entries are private: they're never sent to the AI as background context.
The AI bar can only add to an entry when you ask it to ("journal: ...").
"""
import re
from datetime import date, timedelta

from ...database import get_setting, register_schema, row_to_dict, set_setting
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS journal_entries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL UNIQUE,
        body       TEXT NOT NULL DEFAULT '',
        mood       INTEGER,                 -- 1 (rough) to 5 (great), optional
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """
)

MOODS = {1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄"}
DEFAULT_REMIND = "21:30"


def _day(value) -> str:
    try:
        d = date.fromisoformat(str(value)[:10]) if value else date.today()
    except ValueError:
        raise ValidationError("The date must look like 2026-10-02")
    if d > date.today():
        raise ValidationError("You can't write an entry for a day that hasn't happened yet")
    return d.isoformat()


def _words(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def _out(row) -> dict | None:
    e = row_to_dict(row)
    if e:
        e["words"] = _words(e["body"])
        e["mood_emoji"] = MOODS.get(e["mood"] or 0, "")
    return e


def get_entry(conn, day) -> dict | None:
    return _out(conn.execute("SELECT * FROM journal_entries WHERE date = ?", (_day(day),)).fetchone())


def save_entry(conn, day, body: str | None = None, mood: int | None = None, clear_mood: bool = False) -> dict | None:
    """Create or update a day's entry. An entry left empty (no text, no mood) is removed."""
    day = _day(day)
    old = get_entry(conn, day)
    body = (old["body"] if old else "") if body is None else body.rstrip()
    if clear_mood:
        mood = None
    elif mood is None:
        mood = old["mood"] if old else None
    else:
        mood = max(1, min(5, int(mood)))
    if not body.strip() and mood is None:
        conn.execute("DELETE FROM journal_entries WHERE date = ?", (day,))
        return None
    if old:
        conn.execute("UPDATE journal_entries SET body = ?, mood = ?, updated_at = ? WHERE date = ?",
                     (body, mood, now_iso(), day))
    else:
        conn.execute("INSERT INTO journal_entries (date, body, mood, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                     (day, body, mood, now_iso(), now_iso()))
    return get_entry(conn, day)


def add_to_entry(conn, text: str, day=None) -> dict:
    """Add a paragraph to a day's entry (used by the AI bar)."""
    text = (text or "").strip()
    if not text:
        raise ValidationError("What should go in your journal?")
    old = get_entry(conn, day)
    body = f"{old['body'].rstrip()}\n\n{text}" if old and old["body"].strip() else text
    return save_entry(conn, day, body)


def delete_entry(conn, day) -> None:
    conn.execute("DELETE FROM journal_entries WHERE date = ?", (_day(day),))


def streak(conn, today: date | None = None) -> int:
    """Days in a row with an entry, ending today (or yesterday, if tonight's isn't written yet)."""
    today = today or date.today()
    days = {r[0] for r in conn.execute("SELECT date FROM journal_entries WHERE date >= ?",
                                       ((today - timedelta(days=400)).isoformat(),))}
    d = today if today.isoformat() in days else today - timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


def overview(conn, q: str = "", limit: int = 60) -> dict:
    today = date.today()
    q = (q or "").strip()
    sql, params = "SELECT * FROM journal_entries", []
    if q:
        sql += " WHERE body LIKE ?"
        params.append(f"%{q}%")
    entries = [_out(r) for r in conn.execute(sql + " ORDER BY date DESC LIMIT ?", (*params, max(1, min(500, limit))))]
    for e in entries:
        e["preview"] = re.sub(r"\s+", " ", e.pop("body")).strip()[:180]
    month = today.replace(day=1).isoformat()
    count, words = conn.execute("SELECT COUNT(*), COALESCE(SUM(LENGTH(body)), 0) FROM journal_entries").fetchone()
    # A year ago, or a month ago: a small look back.
    look_back = None
    for label, d in (("A year ago today", today.replace(year=today.year - 1) if not (today.month == 2 and today.day == 29)
                      else today - timedelta(days=365)), ("A month ago today", today - timedelta(days=30))):
        e = get_entry(conn, d)
        if e and e["body"].strip():
            look_back = {"label": label, **e}
            break
    return {
        "today": today.isoformat(),
        "entries": entries,
        "total": count,
        "this_month": conn.execute("SELECT COUNT(*) FROM journal_entries WHERE date >= ?", (month,)).fetchone()[0],
        "streak": streak(conn, today),
        "written_today": bool(get_entry(conn, today)),
        "look_back": look_back,
        "moods": MOODS,
        "remind_at": remind_time(conn),
        "query": q,
    }


def remind_time(conn) -> str:
    """When to nudge you to write tonight ("" = off)."""
    v = get_setting(conn, "journal_remind")
    return DEFAULT_REMIND if v is None else v


def set_remind_time(conn, value: str) -> str:
    value = (value or "").strip()
    if value and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
        raise ValidationError("The reminder time must look like 21:30")
    set_setting(conn, "journal_remind", value)
    return value
