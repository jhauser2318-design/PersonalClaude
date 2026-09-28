"""CPA exam planner: sections, exam dates, study hours vs plan, practice scores,
and the credit window (after your first pass you have a set number of months
to pass the rest; 30 in most states, changeable in the planner).

Study hours come from your "CPA study" routine (plus focus-timer sessions
linked to it), counted from each section's study start date.
"""
from datetime import date, timedelta

from ...database import get_setting, register_schema, row_to_dict, set_setting
from ..goals.service import ValidationError, now_iso

CORE = ["FAR", "AUD", "REG"]
DISCIPLINES = ["BAR", "ISC", "TCP"]
NAMES = {"FAR": "Financial Accounting & Reporting", "AUD": "Auditing & Attestation", "REG": "Taxation & Regulation",
         "BAR": "Business Analysis & Reporting", "ISC": "Information Systems & Controls",
         "TCP": "Tax Compliance & Planning"}
STATUSES = ["not_started", "studying", "scheduled", "passed", "failed"]
DEFAULT_HOURS = {"FAR": 300, "AUD": 200, "REG": 200, "BAR": 150, "ISC": 120, "TCP": 150}

register_schema(
    """
    CREATE TABLE IF NOT EXISTS cpa_sections (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        code         TEXT NOT NULL UNIQUE,
        status       TEXT NOT NULL DEFAULT 'not_started',
        study_start  TEXT,
        exam_date    TEXT,
        target_hours REAL NOT NULL DEFAULT 0,
        score        INTEGER,               -- official score (75 passes)
        passed_date  TEXT,
        notes        TEXT NOT NULL DEFAULT '',
        sort         INTEGER NOT NULL DEFAULT 0,
        updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cpa_scores (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        section TEXT NOT NULL,
        date    TEXT NOT NULL,
        score   REAL NOT NULL,              -- percent
        kind    TEXT NOT NULL DEFAULT 'practice exam',
        notes   TEXT NOT NULL DEFAULT ''
    );
    """
)


def _ensure_sections(conn) -> None:
    if conn.execute("SELECT COUNT(*) FROM cpa_sections").fetchone()[0]:
        return
    for i, code in enumerate(CORE + ["BAR"]):
        conn.execute("INSERT INTO cpa_sections (code, target_hours, sort, updated_at) VALUES (?, ?, ?, ?)",
                     (code, DEFAULT_HOURS[code], i, now_iso()))


def study_habit(conn) -> dict | None:
    """The routine that counts as CPA study (set in the planner, or the one named like it)."""
    chosen = get_setting(conn, "cpa_habit_id")
    if chosen:
        row = conn.execute("SELECT * FROM habits WHERE id = ?", (int(chosen),)).fetchone()
        if row:
            return dict(row)
    row = conn.execute("SELECT * FROM habits WHERE title LIKE '%CPA%' ORDER BY active DESC, id LIMIT 1").fetchone()
    return row_to_dict(row)


def _hours(conn, habit: dict | None, start: str, end: str) -> float:
    if not habit:
        return 0.0
    unit = (habit["unit"] or "").lower()
    rows = conn.execute("SELECT amount FROM habit_logs WHERE habit_id = ? AND date BETWEEN ? AND ?",
                        (habit["id"], start, end)).fetchall()
    total = 0.0
    for r in rows:
        amt = r["amount"] if r["amount"] is not None else (habit["target_amount"] or 1)
        total += amt / 60 if unit.startswith("min") else amt if unit.startswith("h") or habit["target_amount"] else 1
    return round(total, 1)


def window_months(conn) -> int:
    return int(get_setting(conn, "cpa_window_months") or 30)


def overview(conn) -> dict:
    _ensure_sections(conn)
    today = date.today()
    habit = study_habit(conn)
    sections = []
    for row in conn.execute("SELECT * FROM cpa_sections ORDER BY sort, id"):
        s = dict(row)
        s["name"] = NAMES.get(s["code"], s["code"])
        start = s["study_start"] or (today - timedelta(days=30)).isoformat()
        end = s["passed_date"] or s["exam_date"] or today.isoformat()
        end = min(end, today.isoformat())
        s["hours"] = _hours(conn, habit, start, end) if s["status"] in ("studying", "scheduled", "passed", "failed") else 0.0
        s["scores"] = [dict(r) for r in conn.execute(
            "SELECT * FROM cpa_scores WHERE section = ? ORDER BY date, id", (s["code"],))]
        s["days_to_exam"] = (date.fromisoformat(s["exam_date"]) - today).days if s["exam_date"] else None
        if s["target_hours"] and s["status"] in ("studying", "scheduled") and s["exam_date"] and s["days_to_exam"] is not None:
            left = max(0.0, s["target_hours"] - s["hours"])
            days = max(1, s["days_to_exam"])
            s["hours_left"] = round(left, 1)
            s["per_day_needed"] = round(left / days, 2)
            if s["study_start"]:
                total_days = max(1, (date.fromisoformat(s["exam_date"]) - date.fromisoformat(s["study_start"])).days)
                elapsed = min(total_days, max(0, (today - date.fromisoformat(s["study_start"])).days))
                s["pace_hours"] = round(s["target_hours"] * elapsed / total_days, 1)
                s["behind_by"] = round(s["pace_hours"] - s["hours"], 1)
        s["last_score"] = s["scores"][-1]["score"] if s["scores"] else None
        sections.append(s)
    passed = [s for s in sections if s["status"] == "passed" and s["passed_date"]]
    window = None
    if passed:
        first = min(date.fromisoformat(s["passed_date"]) for s in passed)
        months = window_months(conn)
        y, m = divmod(first.month - 1 + months, 12)
        deadline = date(first.year + y, m + 1, min(first.day, 28))
        window = {"first_pass": first.isoformat(), "deadline": deadline.isoformat(),
                  "days_left": (deadline - today).days, "months": months}
    week_start = today - timedelta(days=today.weekday())
    return {
        "sections": sections,
        "passed": len(passed), "total": len(sections),
        "window": window, "window_months": window_months(conn),
        "habit": {"id": habit["id"], "title": habit["title"]} if habit else None,
        "hours_this_week": _hours(conn, habit, week_start.isoformat(), today.isoformat()),
        "hours_last_30": _hours(conn, habit, (today - timedelta(days=29)).isoformat(), today.isoformat()),
        "disciplines": DISCIPLINES, "statuses": STATUSES,
    }


def update_section(conn, section_id: int, fields: dict) -> dict:
    row = conn.execute("SELECT * FROM cpa_sections WHERE id = ?", (section_id,)).fetchone()
    if not row:
        raise ValidationError("That section doesn't exist")
    data = {}
    for key, value in fields.items():
        if key == "code":
            if value not in CORE + DISCIPLINES:
                raise ValidationError("Unknown CPA section")
        elif key == "status":
            if value not in STATUSES:
                raise ValidationError("Unknown status")
        elif key in ("study_start", "exam_date", "passed_date"):
            if value:
                try:
                    value = date.fromisoformat(str(value)[:10]).isoformat()
                except ValueError:
                    raise ValidationError("Dates must look like 2026-10-02")
            else:
                value = None
        elif key == "target_hours":
            value = max(0.0, float(value or 0))
        elif key == "score":
            value = None if value in (None, "") else max(0, min(99, int(value)))
        elif key == "notes":
            value = (value or "").strip()
        else:
            continue
        data[key] = value
    if data.get("status") == "passed" and not (data.get("passed_date") or row["passed_date"]):
        data["passed_date"] = date.today().isoformat()
    if data.get("status") == "studying" and not (data.get("study_start") or row["study_start"]):
        data["study_start"] = date.today().isoformat()
    if data.get("code") and data["code"] != row["code"]:
        if conn.execute("SELECT 1 FROM cpa_sections WHERE code = ?", (data["code"],)).fetchone():
            raise ValidationError(f"{data['code']} is already in your plan")
        conn.execute("UPDATE cpa_scores SET section = ? WHERE section = ?", (data["code"], row["code"]))
    elif "code" in data:
        del data["code"]
    if data:
        data["updated_at"] = now_iso()
        conn.execute(f"UPDATE cpa_sections SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?",
                     (*data.values(), section_id))
    return dict(conn.execute("SELECT * FROM cpa_sections WHERE id = ?", (section_id,)).fetchone())


def add_score(conn, section: str, score: float, day: str | None = None, kind: str = "practice exam",
              notes: str = "") -> dict:
    _ensure_sections(conn)
    section = (section or "").strip().upper()
    if not conn.execute("SELECT 1 FROM cpa_sections WHERE code = ?", (section,)).fetchone():
        raise ValidationError(f"“{section}” isn't one of your CPA sections")
    try:
        score = float(score)
    except (TypeError, ValueError):
        raise ValidationError("A score is a percent, like 78")
    if not 0 <= score <= 100:
        raise ValidationError("A score is a percent between 0 and 100")
    day = date.fromisoformat(str(day)[:10]).isoformat() if day else date.today().isoformat()
    cur = conn.execute("INSERT INTO cpa_scores (section, date, score, kind, notes) VALUES (?, ?, ?, ?, ?)",
                       (section, day, score, (kind or "practice exam").strip(), (notes or "").strip()))
    return dict(conn.execute("SELECT * FROM cpa_scores WHERE id = ?", (cur.lastrowid,)).fetchone())


def delete_score(conn, score_id: int) -> None:
    conn.execute("DELETE FROM cpa_scores WHERE id = ?", (score_id,))


def save_settings(conn, habit_id: int | None = None, months: int | None = None) -> dict:
    if habit_id is not None:
        set_setting(conn, "cpa_habit_id", str(int(habit_id)))
    if months is not None:
        set_setting(conn, "cpa_window_months", str(max(6, min(60, int(months)))))
    return overview(conn)


def context_line(conn) -> str:
    """One line for the AI bar's context."""
    if not conn.execute("SELECT COUNT(*) FROM cpa_sections").fetchone()[0]:
        return ""
    o = overview(conn)
    parts = []
    for s in o["sections"]:
        bits = [s["code"], s["status"].replace("_", " ")]
        if s["exam_date"]:
            bits.append(f"exam {s['exam_date']}")
        if s["status"] in ("studying", "scheduled"):
            bits.append(f"{s['hours']:g}/{s['target_hours']:g} h")
        if s["last_score"] is not None:
            bits.append(f"last practice {s['last_score']:g}%")
        parts.append(" ".join(bits))
    return "CPA EXAM: " + "; ".join(parts)
