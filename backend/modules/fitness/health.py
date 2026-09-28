"""Apple Health → Workouts.

Apple Health has no web connection of its own, so the iPhone sends the data
here: the "Health Auto Export" app (REST API automation) or an Apple Shortcut
POSTs JSON to /api/health/import?key=<your key> over Tailscale.

What's kept:
  - workouts from the Apple Watch (type, time, minutes, distance, calories),
    which also check off your gym routine for that day,
  - body weight,
  - a daily summary: steps, active calories, exercise minutes, resting heart rate.

Imports always go to your real data (never the demo), and sending the same
workout twice doesn't duplicate it.
"""
import hmac
import secrets
from datetime import date, datetime, timedelta

from ...database import get_setting, register_schema, set_setting

register_schema(
    """
    CREATE TABLE IF NOT EXISTS health_daily (
        date          TEXT PRIMARY KEY,
        steps         REAL,
        active_kcal   REAL,
        exercise_min  REAL,
        resting_hr    REAL,
        updated_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS health_workouts (
        external_id TEXT PRIMARY KEY,          -- so re-sending doesn't duplicate
        workout_id  INTEGER NOT NULL
    );
    """
)

# Apple's metric names (Health Auto Export spells them in snake_case) → our columns.
DAILY = {
    "step_count": "steps", "steps": "steps",
    "active_energy": "active_kcal", "active_energy_burned": "active_kcal", "active_calories": "active_kcal",
    "apple_exercise_time": "exercise_min", "exercise_time": "exercise_min", "exercise_minutes": "exercise_min",
    "resting_heart_rate": "resting_hr",
}
WEIGHT = {"weight_body_mass", "body_mass", "weight"}
SUMMED = {"steps", "active_kcal", "exercise_min"}  # added up over the day; heart rate is averaged

STRENGTH = ("strength", "weight", "functional", "core", "cross training")
SPORT = ("soccer", "basketball", "tennis", "golf", "pickleball", "volleyball", "hockey", "baseball", "football",
         "racquetball", "squash", "badminton", "climbing", "boxing", "martial")


def get_key(conn, create: bool = True) -> str | None:
    key = get_setting(conn, "health_key")
    if not key and create:
        key = secrets.token_urlsafe(24)
        set_setting(conn, "health_key", key)
    return key


def new_key(conn) -> str:
    key = secrets.token_urlsafe(24)
    set_setting(conn, "health_key", key)
    return key


def key_ok(conn, key: str | None) -> bool:
    real = get_setting(conn, "health_key")
    return bool(real and key and hmac.compare_digest(real, key))


def _when(value) -> datetime | None:
    """Accepts "2026-09-28 06:30:00 -0500", ISO strings, or a date."""
    if not value:
        return None
    v = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M %z", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(v, fmt).replace(tzinfo=None)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _qty(value, want: str | None = None) -> float | None:
    """A number, or {"qty": n, "units": "..."}; converts km→mi, kJ→kcal, kg→lb when told the units."""
    units = ""
    if isinstance(value, dict):
        units = str(value.get("units") or value.get("unit") or "").lower()
        value = value.get("qty", value.get("value"))
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if want == "mi" and units in ("km", "kilometers"):
        n /= 1.609344
    elif want == "mi" and units in ("m", "meters"):
        n /= 1609.344
    elif want == "kcal" and units in ("kj", "kilojoules"):
        n /= 4.184
    elif want == "lb" and units in ("kg", "kilograms"):
        n *= 2.20462
    return n


def _kind(name: str) -> str:
    n = name.lower()
    if any(s in n for s in STRENGTH):
        return "strength"
    if any(s in n for s in SPORT):
        return "sport"
    return "cardio"


def import_payload(conn, payload: dict) -> dict:
    """Save what the phone sent. Returns counts."""
    from . import service
    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    out = {"workouts": 0, "duplicates": 0, "weights": 0, "days": 0}

    # --- Workouts ---
    for w in data.get("workouts") or []:
        if not isinstance(w, dict):
            continue
        name = str(w.get("name") or w.get("type") or w.get("workoutActivityType") or "Workout").strip()
        name = name.replace("HKWorkoutActivityType", "")
        start = _when(w.get("start") or w.get("startDate") or w.get("date"))
        end = _when(w.get("end") or w.get("endDate"))
        if not start:
            continue
        minutes = _qty(w.get("minutes"))
        if minutes is None and w.get("duration") is not None:
            d = _qty(w.get("duration"))
            units = str((w.get("duration") or {}).get("units", "") if isinstance(w.get("duration"), dict) else "").lower()
            minutes = d if units.startswith("min") else (d / 60 if d is not None else None)  # seconds by default
        if minutes is None and end:
            minutes = (end - start).total_seconds() / 60
        distance = _qty(w.get("distance"), "mi")
        kcal = _qty(w.get("activeEnergyBurned") or w.get("activeEnergy") or w.get("calories") or w.get("active_kcal"), "kcal")
        ext = str(w.get("id") or w.get("uuid") or f"{name}|{start.isoformat(timespec='minutes')}")
        if conn.execute("SELECT 1 FROM health_workouts WHERE external_id = ?", (ext,)).fetchone():
            out["duplicates"] += 1
            continue
        notes = " · ".join(x for x in (f"{kcal:.0f} kcal" if kcal else "", f"started {start.strftime('%H:%M')}",
                                       "from Apple Health") if x)
        saved = service.save_workout(conn, {
            "date": start.date().isoformat(), "kind": _kind(name), "title": name,
            "minutes": round(minutes) if minutes else None,
            "distance": round(distance, 2) if distance else None, "notes": notes, "sets": []})
        conn.execute("UPDATE workouts SET source = 'apple', calories = ? WHERE id = ?",
                     (round(kcal) if kcal else None, saved["id"]))
        conn.execute("INSERT INTO health_workouts (external_id, workout_id) VALUES (?, ?)", (ext, saved["id"]))
        out["workouts"] += 1

    # --- Metrics (Health Auto Export: [{"name", "units", "data": [{"date", "qty"}]}]) ---
    metrics = data.get("metrics") or []
    daily: dict[str, dict[str, list[float]]] = {}
    for m in metrics:
        if not isinstance(m, dict):
            continue
        name = str(m.get("name") or "").lower()
        units = m.get("units")
        for point in m.get("data") or []:
            when = _when(point.get("date"))
            qty = _qty({"qty": point.get("qty", point.get("Avg")), "units": units},
                       "lb" if name in WEIGHT else "kcal" if "energy" in name else None)
            if not when or qty is None:
                continue
            if name in WEIGHT:
                service.log_weight(conn, qty, when.date().isoformat())
                out["weights"] += 1
            elif name in DAILY:
                daily.setdefault(when.date().isoformat(), {}).setdefault(DAILY[name], []).append(qty)

    # --- Simple format (from an Apple Shortcut): {"date", "steps", "active_kcal", "weight", ...} ---
    if any(k in data for k in ("steps", "active_kcal", "exercise_min", "resting_hr", "weight")):
        day = (_when(data.get("date")) or datetime.now()).date().isoformat()
        for k in ("steps", "active_kcal", "exercise_min", "resting_hr"):
            if _qty(data.get(k)) is not None:
                daily.setdefault(day, {})[k] = [_qty(data.get(k))]
        if _qty(data.get("weight")) is not None:
            service.log_weight(conn, _qty(data.get("weight")), day)
            out["weights"] += 1

    now = datetime.now().isoformat(timespec="seconds")
    for day, vals in daily.items():
        row = {k: round(sum(v) if k in SUMMED else sum(v) / len(v), 1) for k, v in vals.items()}
        conn.execute("INSERT OR IGNORE INTO health_daily (date, updated_at) VALUES (?, ?)", (day, now))
        conn.execute(f"UPDATE health_daily SET {', '.join(f'{k} = ?' for k in row)}, updated_at = ? WHERE date = ?",
                     (*row.values(), now, day))
        out["days"] += 1
    if any(out[k] for k in ("workouts", "weights", "days")):
        set_setting(conn, "health_last_import", now)
    return out


def summary(conn) -> dict:
    today = date.today()
    rows = [dict(r) for r in conn.execute("SELECT * FROM health_daily WHERE date >= ? ORDER BY date",
                                          ((today - timedelta(days=13)).isoformat(),))]
    return {"last_import": get_setting(conn, "health_last_import"), "days": rows,
            "today": next((r for r in rows if r["date"] == today.isoformat()), None)}
