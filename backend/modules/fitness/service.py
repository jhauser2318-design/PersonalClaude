"""Workouts: what you lifted/ran, personal records, estimated 1-rep max, and
body weight. Logging a workout also checks off your gym routine (if you have
one with "gym" or "workout" in its name, or the one picked on the page).
"""
from datetime import date, timedelta

from ...database import add_column, get_setting, register_schema, row_to_dict, set_setting
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS workouts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        kind       TEXT NOT NULL DEFAULT 'strength',  -- strength, cardio, sport, other
        title      TEXT NOT NULL DEFAULT '',          -- "Push day", "5K run"
        minutes    REAL,
        distance   REAL,                              -- miles
        notes      TEXT NOT NULL DEFAULT '',
        source     TEXT NOT NULL DEFAULT 'manual',    -- manual or apple (Apple Health)
        calories   REAL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        exercise   TEXT NOT NULL,
        sets       INTEGER NOT NULL DEFAULT 1,
        reps       INTEGER NOT NULL DEFAULT 0,
        weight     REAL NOT NULL DEFAULT 0          -- lb
    );
    CREATE TABLE IF NOT EXISTS body_weight (
        date   TEXT PRIMARY KEY,
        weight REAL NOT NULL
    );
    """
)

add_column("workouts", "source", "TEXT NOT NULL DEFAULT 'manual'")
add_column("workouts", "calories", "REAL")

KINDS = ["strength", "cardio", "sport", "other"]


def _day(value) -> str:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat() if value else date.today().isoformat()
    except ValueError:
        raise ValidationError("The date must look like 2026-10-02")


def e1rm(weight: float, reps: int) -> float:
    """Estimated one-rep max (Epley)."""
    if not weight or not reps:
        return 0.0
    return round(weight if reps == 1 else weight * (1 + reps / 30), 1)


def _exercise_name(name: str) -> str:
    name = " ".join((name or "").split())
    if not name:
        raise ValidationError("Each exercise needs a name")
    return name[:1].upper() + name[1:]


def _clean_set(s: dict) -> dict:
    return {"exercise": _exercise_name(s.get("exercise")),
            "sets": max(1, int(s.get("sets") or 1)), "reps": max(0, int(s.get("reps") or 0)),
            "weight": max(0.0, float(s.get("weight") or 0))}


def gym_habit(conn) -> dict | None:
    chosen = get_setting(conn, "fitness_habit_id")
    if chosen == "0":
        return None
    if chosen:
        row = conn.execute("SELECT * FROM habits WHERE id = ?", (int(chosen),)).fetchone()
        if row:
            return dict(row)
    row = conn.execute("SELECT * FROM habits WHERE active = 1 AND (title LIKE '%gym%' OR title LIKE '%workout%' "
                       "OR title LIKE '%exercise%' OR title LIKE '%lift%') ORDER BY id LIMIT 1").fetchone()
    return row_to_dict(row)


def set_gym_habit(conn, habit_id: int | None) -> None:
    set_setting(conn, "fitness_habit_id", str(int(habit_id or 0)))


def get_workout(conn, workout_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM workouts WHERE id = ?", (workout_id,)).fetchone()
    if not row:
        return None
    w = dict(row)
    w["sets"] = [dict(r) for r in conn.execute("SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY id", (workout_id,))]
    w["volume"] = round(sum(s["sets"] * s["reps"] * s["weight"] for s in w["sets"]))
    return w


def list_workouts(conn, days: int = 90) -> list[dict]:
    since = (date.today() - timedelta(days=days)).isoformat()
    ids = [r[0] for r in conn.execute("SELECT id FROM workouts WHERE date >= ? ORDER BY date DESC, id DESC", (since,))]
    return [get_workout(conn, i) for i in ids]


def save_workout(conn, fields: dict, workout_id: int | None = None, log_routine: bool = True) -> dict:
    data = {
        "date": _day(fields.get("date")),
        "kind": fields.get("kind") if fields.get("kind") in KINDS else "strength",
        "title": (fields.get("title") or "").strip(),
        "minutes": float(fields["minutes"]) if fields.get("minutes") else None,
        "distance": float(fields["distance"]) if fields.get("distance") else None,
        "notes": (fields.get("notes") or "").strip(),
    }
    sets = [_clean_set(s) for s in fields.get("sets") or [] if (s.get("exercise") or "").strip()]
    if not data["title"]:
        data["title"] = ", ".join(dict.fromkeys(s["exercise"] for s in sets))[:60] or data["kind"].title()
    if workout_id:
        if not conn.execute("SELECT 1 FROM workouts WHERE id = ?", (workout_id,)).fetchone():
            raise ValidationError("That workout doesn't exist")
        conn.execute(f"UPDATE workouts SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), workout_id))
        conn.execute("DELETE FROM workout_sets WHERE workout_id = ?", (workout_id,))
    else:
        workout_id = conn.execute(
            f"INSERT INTO workouts ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
            (*data.values(), now_iso())).lastrowid
    for s in sets:
        conn.execute("INSERT INTO workout_sets (workout_id, exercise, sets, reps, weight) VALUES (?, ?, ?, ?, ?)",
                     (workout_id, s["exercise"], s["sets"], s["reps"], s["weight"]))
    if log_routine and data["date"] <= date.today().isoformat():
        habit = gym_habit(conn)
        if habit and not conn.execute("SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?",
                                      (habit["id"], data["date"])).fetchone():
            from ..habits import service as habits
            habits.log_habit(conn, habit["id"], data["date"], None, data["title"])
    return get_workout(conn, workout_id)


def delete_workout(conn, workout_id: int) -> None:
    conn.execute("DELETE FROM workout_sets WHERE workout_id = ?", (workout_id,))
    conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))


def records(conn) -> list[dict]:
    """Best set per exercise (by estimated 1RM), plus the heaviest weight lifted."""
    best: dict[str, dict] = {}
    for r in conn.execute("""SELECT s.*, w.date FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
                             WHERE s.weight > 0 ORDER BY w.date"""):
        key = r["exercise"].lower()
        est = e1rm(r["weight"], r["reps"])
        b = best.setdefault(key, {"exercise": r["exercise"], "e1rm": 0, "heaviest": 0, "sessions": 0, "history": []})
        b["sessions"] += 1
        b["history"].append({"date": r["date"], "e1rm": est})
        if r["weight"] > b["heaviest"]:
            b["heaviest"] = r["weight"]
        if est >= b["e1rm"]:
            b.update(e1rm=est, weight=r["weight"], reps=r["reps"], date=r["date"])
    out = sorted(best.values(), key=lambda b: (-b["sessions"], b["exercise"]))
    for b in out:  # one point per day (the best), for the chart
        per_day: dict[str, float] = {}
        for h in b["history"]:
            per_day[h["date"]] = max(per_day.get(h["date"], 0), h["e1rm"])
        b["history"] = [{"date": d, "e1rm": v} for d, v in sorted(per_day.items())]
    return out


def log_weight(conn, weight: float, day: str | None = None) -> dict:
    try:
        weight = float(weight)
    except (TypeError, ValueError):
        raise ValidationError("Weight must be a number, like 182.4")
    if not 40 <= weight <= 800:
        raise ValidationError("That weight doesn't look right (pounds)")
    day = _day(day)
    before = row_to_dict(conn.execute("SELECT * FROM body_weight WHERE date = ?", (day,)).fetchone())
    conn.execute("INSERT OR REPLACE INTO body_weight (date, weight) VALUES (?, ?)", (day, round(weight, 1)))
    return {"date": day, "weight": round(weight, 1), "before": before}


def delete_weight(conn, day: str) -> None:
    conn.execute("DELETE FROM body_weight WHERE date = ?", (day,))


def overview(conn) -> dict:
    today = date.today()
    workouts = list_workouts(conn, 120)
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    weights = [dict(r) for r in conn.execute("SELECT * FROM body_weight WHERE date >= ? ORDER BY date",
                                             ((today - timedelta(days=180)).isoformat(),))]
    weeks = []
    for i in range(11, -1, -1):
        start = today - timedelta(days=today.weekday() + 7 * i)
        end = start + timedelta(days=6)
        weeks.append({"week": start.isoformat(),
                      "count": sum(1 for w in workouts if start.isoformat() <= w["date"] <= end.isoformat())})
    habit = gym_habit(conn)
    return {
        "workouts": workouts,
        "this_week": sum(1 for w in workouts if w["date"] >= week_start),
        "last_30": sum(1 for w in workouts if w["date"] >= (today - timedelta(days=29)).isoformat()),
        "weeks": weeks, "records": records(conn), "weights": weights,
        "latest_weight": weights[-1] if weights else None,
        "habit": {"id": habit["id"], "title": habit["title"]} if habit else None,
        "exercises": sorted({r[0] for r in conn.execute("SELECT DISTINCT exercise FROM workout_sets")}),
        "kinds": KINDS,
        "health": _health(conn),
    }


def _health(conn) -> dict:
    from . import health
    return health.summary(conn)


def context_line(conn) -> str:
    rows = conn.execute("SELECT date, title FROM workouts ORDER BY date DESC, id DESC LIMIT 5").fetchall()
    w = conn.execute("SELECT date, weight FROM body_weight ORDER BY date DESC LIMIT 1").fetchone()
    if not rows and not w:
        return ""
    bits = [f"{r['date']} {r['title']}" for r in rows]
    return ("WORKOUTS (latest): " + ("; ".join(bits) or "none")
            + (f". Body weight {w['weight']:g} lb on {w['date']}" if w else ""))
