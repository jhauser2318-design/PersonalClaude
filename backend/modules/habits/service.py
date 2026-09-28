"""Routines: recurring tasks such as going to the gym, skincare or CPA study.

A routine has a schedule:
  - "daily"           every day
  - "weekdays"        on chosen days of the week (0 = Monday ... 6 = Sunday)
  - "times_per_week"  any N days each week (e.g. gym 4x a week)

Each time you do it, a log is saved for that date. A log can carry an amount
(e.g. 2.5 hours of CPA study) if the routine has a daily target.
Streaks, completion rates and the history grid are all calculated from logs.
"""
from datetime import date, timedelta

from ...areas import AREA_IDS
from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, get_goal_row, now_iso

FREQUENCIES = ["daily", "weekdays", "times_per_week"]
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
HISTORY_DAYS = 84  # 12 weeks shown in the history grid

register_schema(
    """
    CREATE TABLE IF NOT EXISTS habits (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT NOT NULL,
        area           TEXT NOT NULL,
        goal_id        INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        frequency      TEXT NOT NULL DEFAULT 'daily',
        days           TEXT NOT NULL DEFAULT '',
        times_per_week INTEGER,
        target_amount  REAL,
        unit           TEXT,
        active         INTEGER NOT NULL DEFAULT 1,
        is_example     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date       TEXT NOT NULL,
        amount     REAL,
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (habit_id, date)
    );
    """
)

HABIT_FIELDS = ["title", "area", "goal_id", "frequency", "days", "times_per_week",
                "target_amount", "unit", "active"]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _clean(conn, fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key not in HABIT_FIELDS:
            continue
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A routine needs a name")
        elif key == "area":
            if value not in AREA_IDS:
                raise ValidationError(f"Unknown area '{value}'")
        elif key == "goal_id":
            if value in (None, "", 0):
                value = None
            elif get_goal_row(conn, int(value)) is None:
                raise ValidationError(f"Goal #{value} doesn't exist")
            else:
                value = int(value)
        elif key == "frequency":
            if value not in FREQUENCIES:
                raise ValidationError(f"Unknown schedule '{value}'")
        elif key == "days":
            if isinstance(value, str):
                value = [int(d) for d in value.split(",") if d.strip() != ""]
            days = sorted({int(d) for d in (value or []) if 0 <= int(d) <= 6})
            value = ",".join(str(d) for d in days)
        elif key == "times_per_week":
            value = None if value in (None, "") else max(1, min(7, int(value)))
        elif key == "target_amount":
            value = None if value in (None, "", 0) else max(0.0, float(value))
        elif key == "unit":
            value = (value or "").strip() or None
        elif key == "active":
            value = 1 if value else 0
        out[key] = value
    return out


def _check_schedule(habit: dict) -> None:
    if habit["frequency"] == "weekdays" and not habit["days"]:
        raise ValidationError("Pick at least one day of the week")
    if habit["frequency"] == "times_per_week" and not habit["times_per_week"]:
        raise ValidationError("Say how many times per week")


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def get_habit_row(conn, habit_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM habits WHERE id = ?", (habit_id,)).fetchone())


def _days(habit: dict) -> set[int]:
    return {int(d) for d in habit["days"].split(",") if d != ""}


def is_scheduled(habit: dict, day: date) -> bool:
    if habit["frequency"] == "weekdays":
        return day.weekday() in _days(habit)
    return True  # daily, and times_per_week (any day counts)


def schedule_text(habit: dict) -> str:
    if habit["frequency"] == "daily":
        text = "Every day"
    elif habit["frequency"] == "weekdays":
        days = sorted(_days(habit))
        if days == [0, 1, 2, 3, 4]:
            text = "Weekdays"
        elif days == [5, 6]:
            text = "Weekends"
        else:
            text = ", ".join(DAY_NAMES[d] for d in days)
    else:
        text = f"{habit['times_per_week']}× a week"
    if habit["target_amount"]:
        amount = f"{habit['target_amount']:g}"
        text += f" · {amount} {habit['unit'] or ''}".rstrip()
    return text


def _is_done(habit: dict, log: dict | None) -> bool:
    if not log:
        return False
    if habit["target_amount"] and log["amount"] is not None:
        return log["amount"] >= habit["target_amount"]
    return True


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def stats(conn, habit: dict, today: date | None = None) -> dict:
    """Everything the screens show about a routine, calculated from its logs."""
    today = today or date.today()
    start = date.fromisoformat(habit["created_at"][:10])
    logs = {r["date"]: dict(r) for r in conn.execute(
        "SELECT * FROM habit_logs WHERE habit_id = ?", (habit["id"],)).fetchall()}
    # Logged days before the routine was created still count (backfilled history).
    if logs:
        start = min(start, date.fromisoformat(min(logs)))

    def done(day: date) -> bool:
        return _is_done(habit, logs.get(day.isoformat()))

    weekly = habit["frequency"] == "times_per_week"
    per_week = habit["times_per_week"] or 1

    def week_count(week: date) -> int:
        return sum(1 for i in range(7) if done(week + timedelta(days=i)))

    # --- Current streak ---
    streak = 0
    if weekly:
        week = _week_start(today)
        if week_count(week) < per_week:
            week -= timedelta(days=7)  # this week isn't over yet, so it doesn't break the streak
        while week >= _week_start(start) and week_count(week) >= per_week:
            streak += 1
            week -= timedelta(days=7)
    else:
        day = today
        if is_scheduled(habit, day) and not done(day):
            day -= timedelta(days=1)  # today isn't over yet
        while day >= start:
            if is_scheduled(habit, day):
                if not done(day):
                    break
                streak += 1
            day -= timedelta(days=1)

    # --- Best streak (scan from the start) ---
    best = run = 0
    if weekly:
        week = _week_start(start)
        while week <= _week_start(today):
            run = run + 1 if week_count(week) >= per_week else 0
            best = max(best, run)
            week += timedelta(days=7)
    else:
        day = start
        while day <= today:
            if is_scheduled(habit, day):
                if done(day):
                    run += 1
                    best = max(best, run)
                elif day != today:
                    run = 0
            day += timedelta(days=1)
    best = max(best, streak)

    # --- Last 30 days completion rate ---
    window_start = max(start, today - timedelta(days=29))
    if weekly:
        n_days = (today - window_start).days + 1
        expected = max(1, round(per_week * n_days / 7))
        got = sum(1 for i in range(n_days) if done(window_start + timedelta(days=i)))
        rate = min(100, round(100 * got / expected))
    else:
        scheduled = [window_start + timedelta(days=i) for i in range((today - window_start).days + 1)]
        scheduled = [d for d in scheduled if is_scheduled(habit, d) and d != today]
        rate = round(100 * sum(1 for d in scheduled if done(d)) / len(scheduled)) if scheduled else None

    # --- History grid (last 12 weeks, ending this Sunday) ---
    grid_end = _week_start(today) + timedelta(days=6)
    grid_start = grid_end - timedelta(days=HISTORY_DAYS - 1)
    history = []
    for i in range(HISTORY_DAYS):
        day = grid_start + timedelta(days=i)
        log = logs.get(day.isoformat())
        if day > today:
            state = "future"
        elif _is_done(habit, log):
            state = "done"
        elif log:
            state = "partial"
        elif day < start or not is_scheduled(habit, day) or weekly:
            state = "off"
        elif day == today:
            state = "pending"
        else:
            state = "missed"
        history.append({"date": day.isoformat(), "state": state,
                        "amount": log["amount"] if log else None})

    week = _week_start(today)
    today_log = logs.get(today.isoformat())
    week_amount = sum((logs[d]["amount"] or 0) for d in logs
                      if week.isoformat() <= d <= today.isoformat())
    done_this_week = week_count(week)
    due_today = (is_scheduled(habit, today) if not weekly
                 else done_this_week < per_week or done(today))

    return {
        "schedule_text": schedule_text(habit),
        "due_today": bool(habit["active"]) and due_today,
        "done_today": done(today),
        "amount_today": today_log["amount"] if today_log else None,
        "logged_today": today_log is not None,
        "streak": streak,
        "best_streak": best,
        "rate_30d": rate,
        "week_done": done_this_week,
        "week_amount": round(week_amount, 2),
        "history": history,
    }


def get_habit(conn, habit_id: int) -> dict | None:
    habit = get_habit_row(conn, habit_id)
    if habit:
        habit.update(stats(conn, habit))
        goal = get_goal_row(conn, habit["goal_id"]) if habit["goal_id"] else None
        habit["goal_title"] = goal["title"] if goal else None
    return habit


def list_habits(conn, area: str | None = None, include_paused: bool = True) -> list[dict]:
    sql, params = "SELECT id FROM habits WHERE 1 = 1", []
    if area:
        sql += " AND area = ?"
        params.append(area)
    if not include_paused:
        sql += " AND active = 1"
    sql += " ORDER BY active DESC, id"
    return [get_habit(conn, r["id"]) for r in conn.execute(sql, params).fetchall()]


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def create_habit(conn, fields: dict, is_example: bool = False) -> dict:
    data = {"goal_id": None, "frequency": "daily", "days": "", "times_per_week": None,
            "target_amount": None, "unit": None, "active": 1}
    data.update(_clean(conn, fields))
    if "area" not in data and data["goal_id"]:
        data["area"] = get_goal_row(conn, data["goal_id"])["area"]
    if "title" not in data or "area" not in data:
        raise ValidationError("A routine needs a name and an area")
    _check_schedule(data)
    ts = now_iso()
    cur = conn.execute(
        """INSERT INTO habits (title, area, goal_id, frequency, days, times_per_week,
                               target_amount, unit, active, is_example, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data["title"], data["area"], data["goal_id"], data["frequency"], data["days"],
         data["times_per_week"], data["target_amount"], data["unit"], data["active"],
         int(is_example), ts, ts),
    )
    return get_habit(conn, cur.lastrowid)


def update_habit(conn, habit_id: int, fields: dict) -> dict:
    current = get_habit_row(conn, habit_id)
    if current is None:
        raise ValidationError(f"Routine #{habit_id} doesn't exist")
    data = _clean(conn, fields)
    _check_schedule({**current, **data})
    if data:
        data["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE habits SET {cols} WHERE id = ?", (*data.values(), habit_id))
    return get_habit(conn, habit_id)


def delete_habit(conn, habit_id: int) -> None:
    conn.execute("DELETE FROM habits WHERE id = ?", (habit_id,))


def get_log(conn, habit_id: int, day: str) -> dict | None:
    return row_to_dict(conn.execute(
        "SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?", (habit_id, day)).fetchone())


def log_habit(conn, habit_id: int, day: str | None = None, amount: float | None = None,
              note: str = "", add: bool = False) -> dict:
    """Mark a routine as done on a day (today by default).

    With a target (e.g. 2 hours), `amount` records how much was done; with
    add=True it's added to what was already logged that day.
    """
    habit = get_habit_row(conn, habit_id)
    if habit is None:
        raise ValidationError(f"Routine #{habit_id} doesn't exist")
    try:
        day = date.fromisoformat(str(day)[:10]).isoformat() if day else date.today().isoformat()
    except ValueError:
        raise ValidationError(f"'{day}' is not a valid date (use YYYY-MM-DD)")
    if day > date.today().isoformat():
        raise ValidationError("You can't log a routine for a future day")

    if amount is None and habit["target_amount"]:
        amount = habit["target_amount"]
    if amount is not None:
        amount = max(0.0, float(amount))
    existing = get_log(conn, habit_id, day)
    if existing:
        if add and amount is not None:
            amount = (existing["amount"] or 0) + amount
        conn.execute("UPDATE habit_logs SET amount = ?, note = ? WHERE id = ?",
                     (amount, (note or existing["note"] or "").strip(), existing["id"]))
    else:
        conn.execute(
            "INSERT INTO habit_logs (habit_id, date, amount, note, created_at) VALUES (?, ?, ?, ?, ?)",
            (habit_id, day, amount, (note or "").strip(), now_iso()),
        )
    return get_log(conn, habit_id, day)


def unlog_habit(conn, habit_id: int, day: str | None = None) -> None:
    day = day or date.today().isoformat()
    conn.execute("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?", (habit_id, day))
