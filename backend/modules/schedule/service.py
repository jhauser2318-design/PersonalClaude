"""Your daily schedule: time blocks for your own day (gym 6-7, deep work 9-11,
CPA study 7-9...). It never goes to Google Calendar; only important events do.

- Templates are "typical days" (e.g. weekdays, weekends). A day with no blocks
  yet is filled from the template for that weekday the first time you open it.
- Focus sessions (the focus timer) are saved here too, and can count toward a
  routine (e.g. 50 minutes of focus = 0.83 hours of CPA study).
"""
import json
import re
from datetime import date, datetime, timedelta

from ...areas import AREA_IDS
from ...database import add_column, get_setting, register_schema, row_to_dict, set_setting
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS schedule_blocks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        start      TEXT NOT NULL,     -- "HH:MM"
        end        TEXT NOT NULL,
        title      TEXT NOT NULL,
        area       TEXT,
        notes      TEXT NOT NULL DEFAULT '',
        done       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedule_blocks_date ON schedule_blocks(date);
    CREATE TABLE IF NOT EXISTS schedule_templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        weekdays   TEXT NOT NULL DEFAULT '',   -- "0,1,2,3,4" (0 = Monday)
        blocks     TEXT NOT NULL DEFAULT '[]', -- [{"start","end","title","area","notes"}]
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_days (
        date   TEXT PRIMARY KEY,               -- days already filled from a template
        filled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        minutes    REAL NOT NULL,
        label      TEXT NOT NULL DEFAULT '',
        habit_id   INTEGER
    );
    """
)

# Notify me before a block starts: minutes before (0 = at the start), NULL = no reminder.
add_column("schedule_blocks", "remind", "INTEGER")
REMIND_CHOICES = [0, 5, 10, 15, 30, 60]

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def clean_time(value: str, what: str = "time") -> str:
    m = TIME_RE.match((value or "").strip()[-5:] if "T" in (value or "") else (value or "").strip())
    if not m or int(m[1]) > 24 or int(m[2]) > 59:
        raise ValidationError(f"The {what} must look like 07:30")
    return f"{int(m[1]):02d}:{m[2]}"


def _clean_date(value) -> str:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except (TypeError, ValueError):
        raise ValidationError("The date must look like 2026-10-02")


def _clean(fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A block needs a name")
        elif key in ("start", "end"):
            value = clean_time(value, "start time" if key == "start" else "end time")
        elif key == "date":
            value = _clean_date(value)
        elif key == "area":
            value = value if value in AREA_IDS else None
        elif key == "notes":
            value = (value or "").strip()
        elif key == "done":
            value = 1 if value else 0
        elif key == "remind":
            value = None if value in (None, "", False) else (0 if value is True else max(0, min(120, int(value))))
        else:
            continue
        out[key] = value
    return out


def _check(block: dict) -> None:
    if block["end"] <= block["start"]:
        raise ValidationError("A block has to end after it starts")


# ---------------------------------------------------------------------------
# Blocks
# ---------------------------------------------------------------------------

def get_block(conn, block_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM schedule_blocks WHERE id = ?", (block_id,)).fetchone())


def list_blocks(conn, day: str) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM schedule_blocks WHERE date = ? ORDER BY start, end, id", (day,))]


def create_block(conn, fields: dict) -> dict:
    data = {"area": None, "notes": "", "done": 0, "remind": None}
    data.update(_clean(fields))
    for k in ("date", "start", "end", "title"):
        if k not in data:
            raise ValidationError("A block needs a date, start, end and name")
    _check(data)
    conn.execute("INSERT OR IGNORE INTO schedule_days (date, filled) VALUES (?, 1)", (data["date"],))
    cur = conn.execute(
        "INSERT INTO schedule_blocks (date, start, end, title, area, notes, done, remind, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (data["date"], data["start"], data["end"], data["title"], data["area"], data["notes"], data["done"],
         data["remind"], now_iso()))
    return get_block(conn, cur.lastrowid)


def update_block(conn, block_id: int, fields: dict) -> dict:
    current = get_block(conn, block_id)
    if current is None:
        raise ValidationError(f"Block #{block_id} doesn't exist")
    data = _clean(fields)
    _check({**current, **data})
    if data:
        conn.execute(f"UPDATE schedule_blocks SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?",
                     (*data.values(), block_id))
    return get_block(conn, block_id)


def delete_block(conn, block_id: int) -> None:
    conn.execute("DELETE FROM schedule_blocks WHERE id = ?", (block_id,))


def restore_block(conn, before: dict) -> None:
    cols = list(before)
    conn.execute(f"INSERT INTO schedule_blocks ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                 [before[c] for c in cols])


def copy_day(conn, from_day: str, to_day: str, replace: bool = False) -> list[dict]:
    from_day, to_day = _clean_date(from_day), _clean_date(to_day)
    if replace:
        conn.execute("DELETE FROM schedule_blocks WHERE date = ?", (to_day,))
    for b in list_blocks(conn, from_day):
        create_block(conn, {"date": to_day, "start": b["start"], "end": b["end"], "title": b["title"],
                            "area": b["area"], "notes": b["notes"], "remind": b.get("remind")})
    return list_blocks(conn, to_day)


# ---------------------------------------------------------------------------
# Templates ("typical days")
# ---------------------------------------------------------------------------

def _template(row) -> dict:
    d = dict(row)
    d["weekdays"] = [int(x) for x in d["weekdays"].split(",") if x != ""]
    d["blocks"] = json.loads(d["blocks"] or "[]")
    return d


def list_templates(conn) -> list[dict]:
    return [_template(r) for r in conn.execute("SELECT * FROM schedule_templates ORDER BY id")]


def save_template(conn, name: str, weekdays: list[int], blocks: list[dict], template_id: int | None = None) -> dict:
    name = (name or "").strip() or "My typical day"
    days = ",".join(str(d) for d in sorted({int(d) for d in weekdays if 0 <= int(d) <= 6}))
    clean_blocks = []
    for b in blocks:
        cb = _clean({k: b.get(k) for k in ("start", "end", "title", "area", "notes", "remind") if k in b})
        _check(cb)
        clean_blocks.append({k: cb.get(k) for k in ("start", "end", "title", "area", "notes", "remind")})
    clean_blocks.sort(key=lambda b: b["start"])
    # A weekday belongs to one template only.
    for t in list_templates(conn):
        if t["id"] != template_id and set(t["weekdays"]) & set(int(d) for d in days.split(",") if d):
            left = [d for d in t["weekdays"] if str(d) not in days.split(",")]
            conn.execute("UPDATE schedule_templates SET weekdays = ? WHERE id = ?", (",".join(map(str, left)), t["id"]))
    if template_id:
        conn.execute("UPDATE schedule_templates SET name = ?, weekdays = ?, blocks = ? WHERE id = ?",
                     (name, days, json.dumps(clean_blocks), template_id))
    else:
        template_id = conn.execute("INSERT INTO schedule_templates (name, weekdays, blocks, created_at) VALUES (?, ?, ?, ?)",
                                   (name, days, json.dumps(clean_blocks), now_iso())).lastrowid
    return _template(conn.execute("SELECT * FROM schedule_templates WHERE id = ?", (template_id,)).fetchone())


def delete_template(conn, template_id: int) -> None:
    conn.execute("DELETE FROM schedule_templates WHERE id = ?", (template_id,))


def apply_template(conn, template_id: int, day: str, replace: bool = True) -> list[dict]:
    row = conn.execute("SELECT * FROM schedule_templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        raise ValidationError("That template doesn't exist")
    day = _clean_date(day)
    if replace:
        conn.execute("DELETE FROM schedule_blocks WHERE date = ?", (day,))
    for b in _template(row)["blocks"]:
        create_block(conn, {**b, "date": day})
    conn.execute("INSERT OR REPLACE INTO schedule_days (date, filled) VALUES (?, 1)", (day,))
    return list_blocks(conn, day)


def day_plan(conn, day: str) -> dict:
    """A day's blocks, filling it from the matching template the first time it's opened
    (today and future days only)."""
    day = _clean_date(day)
    filled = conn.execute("SELECT 1 FROM schedule_days WHERE date = ?", (day,)).fetchone()
    template_used = None
    if not filled and day >= date.today().isoformat():
        wd = date.fromisoformat(day).weekday()
        match = next((t for t in list_templates(conn) if wd in t["weekdays"]), None)
        if match:
            apply_template(conn, match["id"], day, replace=False)
            template_used = match["name"]
        else:
            conn.execute("INSERT OR IGNORE INTO schedule_days (date, filled) VALUES (?, 1)", (day,))
    blocks = list_blocks(conn, day)
    return {"date": day, "blocks": blocks, "template_used": template_used,
            "done": sum(b["done"] for b in blocks), "total": len(blocks)}


# ---------------------------------------------------------------------------
# Common blocks (the palette you drag onto your day)
# ---------------------------------------------------------------------------

DEFAULT_PRESETS = [
    {"title": "Work", "minutes": 240, "area": "work"},
    {"title": "Deep work", "minutes": 120, "area": "work"},
    {"title": "Meeting", "minutes": 60, "area": "work"},
    {"title": "Gym", "minutes": 60, "area": "health"},
    {"title": "Run", "minutes": 45, "area": "health"},
    {"title": "Study", "minutes": 120, "area": "education"},
    {"title": "CPA study", "minutes": 120, "area": "education"},
    {"title": "Reading", "minutes": 30, "area": "education"},
    {"title": "Friends", "minutes": 120, "area": "social"},
    {"title": "Lunch", "minutes": 45, "area": None},
    {"title": "Errands", "minutes": 60, "area": None},
    {"title": "Break", "minutes": 15, "area": None},
]


def list_presets(conn) -> list[dict]:
    raw = get_setting(conn, "schedule_presets")
    try:
        presets = json.loads(raw) if raw else DEFAULT_PRESETS
    except ValueError:
        presets = DEFAULT_PRESETS
    return presets


def save_presets(conn, presets: list[dict]) -> list[dict]:
    clean = []
    for p in presets[:30]:
        title = (p.get("title") or "").strip()
        if not title:
            continue
        minutes = max(5, min(12 * 60, int(p.get("minutes") or 60)))
        remind = p.get("remind")
        clean.append({"title": title[:40], "minutes": minutes, "area": p.get("area") if p.get("area") in AREA_IDS else None,
                      "remind": None if remind in (None, "", False) else int(remind)})
    set_setting(conn, "schedule_presets", json.dumps(clean))
    return clean


# ---------------------------------------------------------------------------
# Focus sessions
# ---------------------------------------------------------------------------

def finish_focus(conn, minutes: float, label: str = "", habit_id: int | None = None) -> dict:
    """Save a focus session; if it's linked to a routine, count it toward today."""
    from ..habits import service as habits
    minutes = max(0.0, float(minutes or 0))
    if minutes < 1:
        raise ValidationError("That session was under a minute, so it wasn't saved")
    conn.execute("INSERT INTO focus_sessions (started_at, minutes, label, habit_id) VALUES (?, ?, ?, ?)",
                 ((datetime.now() - timedelta(minutes=minutes)).isoformat(timespec="seconds"), round(minutes, 1),
                  (label or "").strip(), habit_id))
    logged = None
    if habit_id:
        h = habits.get_habit_row(conn, habit_id)
        if h is None:
            raise ValidationError("That routine doesn't exist")
        unit = (h["unit"] or "").lower()
        amount = None
        if h["target_amount"]:
            amount = round(minutes / 60, 2) if unit.startswith("h") else round(minutes, 1) if unit.startswith("min") else None
        if amount is not None:
            habits.log_habit(conn, habit_id, None, amount, "", add=True)
        else:
            habits.log_habit(conn, habit_id, None, None, "")
        logged = habits.get_habit(conn, habit_id)
    return {"minutes": round(minutes, 1), "habit": logged, "today_minutes": focus_today(conn)}


def focus_today(conn) -> float:
    return round(conn.execute("SELECT COALESCE(SUM(minutes), 0) FROM focus_sessions WHERE started_at >= ?",
                              (date.today().isoformat(),)).fetchone()[0], 1)
