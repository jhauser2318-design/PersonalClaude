"""Weekly review: every Sunday, look back at the week across the whole app
(tasks, routines, goals, schedule, focus, workouts, money, CPA, people),
write down what went well and what to change, and pick next week's top
priorities (which can become tasks with one click).
"""
import json
import sqlite3
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS weekly_reviews (
        week_start   TEXT PRIMARY KEY,          -- Monday of the reviewed week
        priorities   TEXT NOT NULL DEFAULT '[]',
        went_well    TEXT NOT NULL DEFAULT '',
        improve      TEXT NOT NULL DEFAULT '',
        notes        TEXT NOT NULL DEFAULT '',
        ai_summary   TEXT NOT NULL DEFAULT '',
        completed_at TEXT,
        updated_at   TEXT NOT NULL
    );
    """
)


def monday(day: str | None = None) -> date:
    d = date.fromisoformat(day[:10]) if day else date.today()
    return d - timedelta(days=d.weekday())


def current_week() -> date:
    """The week to review: this week from Friday on, otherwise last week."""
    today = date.today()
    return monday() if today.weekday() >= 4 else monday() - timedelta(days=7)


def _safe(fn, default=None):
    try:
        return fn()
    except (sqlite3.OperationalError, ImportError, KeyError, ValueError):
        return default


def stats(conn, start: date) -> dict:
    end = start + timedelta(days=6)
    s, e = start.isoformat(), end.isoformat()
    e_ts = (end + timedelta(days=1)).isoformat()
    out: dict = {"start": s, "end": e}

    out["tasks_done"] = [dict(r) for r in conn.execute(
        "SELECT id, title, area FROM tasks WHERE done = 1 AND done_at >= ? AND done_at < ? ORDER BY done_at", (s, e_ts))]
    out["tasks_overdue"] = [dict(r) for r in conn.execute(
        "SELECT id, title, area, due_date FROM tasks WHERE done = 0 AND due_date <= ? AND due_date < ? ORDER BY due_date",
        (e, date.today().isoformat()))]
    out["tasks_next_week"] = [dict(r) for r in conn.execute(
        "SELECT id, title, area, due_date FROM tasks WHERE done = 0 AND due_date > ? AND due_date <= ? ORDER BY due_date",
        (e, (end + timedelta(days=7)).isoformat()))]

    from ..habits import service as habits
    routines = []
    for h in conn.execute("SELECT * FROM habits WHERE active = 1").fetchall():
        h = dict(h)
        scheduled = sum(1 for i in range(7) if habits.is_scheduled(h, start + timedelta(days=i))
                        and start + timedelta(days=i) <= date.today())
        done = conn.execute("SELECT COUNT(*) FROM habit_logs WHERE habit_id = ? AND date BETWEEN ? AND ?",
                            (h["id"], s, e)).fetchone()[0]
        if h["frequency"] == "times_per_week":
            scheduled = h["times_per_week"] or 1
        routines.append({"title": h["title"], "done": done, "planned": scheduled})
    out["routines"] = routines

    out["goal_notes"] = [dict(r) for r in conn.execute(
        """SELECT g.title, g.area, n.text FROM goal_notes n JOIN goals g ON g.id = n.goal_id
           WHERE n.created_at >= ? AND n.created_at < ? ORDER BY n.created_at""", (s, e_ts))]
    out["schedule"] = _safe(lambda: dict(conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM schedule_blocks WHERE date BETWEEN ? AND ?",
        (s, e)).fetchone()), {"total": 0, "done": 0})
    out["focus_minutes"] = _safe(lambda: round(conn.execute(
        "SELECT COALESCE(SUM(minutes), 0) FROM focus_sessions WHERE started_at >= ? AND started_at < ?",
        (s, e_ts)).fetchone()[0]), 0)
    out["workouts"] = _safe(lambda: [dict(r) for r in conn.execute(
        "SELECT date, title FROM workouts WHERE date BETWEEN ? AND ? ORDER BY date", (s, e))], [])
    out["people"] = _safe(lambda: [dict(r) for r in conn.execute(
        """SELECT p.name, i.kind, i.date FROM interactions i JOIN people p ON p.id = i.person_id
           WHERE i.date BETWEEN ? AND ? ORDER BY i.date""", (s, e))], [])

    def money():
        from ..finances import service as fin
        if not conn.execute("SELECT COUNT(*) FROM fin_accounts").fetchone()[0]:
            return None
        t = fin.totals(conn, s, e)
        cats = fin.spending_by_category(conn, s, e)[:4]
        return {"income": t["income"], "spending": t["spending"], "top": cats}
    out["money"] = _safe(money)

    def cpa():
        from ..cpa import service as cpa_service
        if not conn.execute("SELECT COUNT(*) FROM cpa_sections").fetchone()[0]:
            return None
        return {"hours": cpa_service._hours(conn, cpa_service.study_habit(conn), s, e),
                "scores": [dict(r) for r in conn.execute(
                    "SELECT section, score, date FROM cpa_scores WHERE date BETWEEN ? AND ?", (s, e))]}
    out["cpa"] = _safe(cpa)
    return out


def get_review(conn, week: str | None = None) -> dict:
    start = monday(week) if week else current_week()
    row = row_to_dict(conn.execute("SELECT * FROM weekly_reviews WHERE week_start = ?", (start.isoformat(),)).fetchone())
    review = row or {"week_start": start.isoformat(), "priorities": "[]", "went_well": "", "improve": "", "notes": "",
                     "ai_summary": "", "completed_at": None}
    review["priorities"] = json.loads(review["priorities"] or "[]")
    past = [dict(r) for r in conn.execute(
        "SELECT week_start, completed_at FROM weekly_reviews ORDER BY week_start DESC LIMIT 12")]
    prev = row_to_dict(conn.execute("SELECT priorities FROM weekly_reviews WHERE week_start = ?",
                                    ((start - timedelta(days=7)).isoformat(),)).fetchone())
    return {"review": review, "stats": stats(conn, start), "past": past,
            "last_priorities": json.loads(prev["priorities"]) if prev else [],
            "is_current": start == current_week()}


def save_review(conn, week: str, fields: dict) -> dict:
    start = monday(week).isoformat()
    existing = conn.execute("SELECT 1 FROM weekly_reviews WHERE week_start = ?", (start,)).fetchone()
    if not existing:
        conn.execute("INSERT INTO weekly_reviews (week_start, updated_at) VALUES (?, ?)", (start, now_iso()))
    data = {}
    for key in ("went_well", "improve", "notes", "ai_summary"):
        if fields.get(key) is not None:
            data[key] = str(fields[key]).strip()
    if fields.get("priorities") is not None:
        data["priorities"] = json.dumps([p.strip() for p in fields["priorities"] if p and p.strip()][:5])
    if fields.get("completed") is not None:
        data["completed_at"] = now_iso() if fields["completed"] else None
    if data:
        data["updated_at"] = now_iso()
        conn.execute(f"UPDATE weekly_reviews SET {', '.join(f'{k} = ?' for k in data)} WHERE week_start = ?",
                     (*data.values(), start))
    return get_review(conn, start)


def priorities_to_tasks(conn, week: str, area: str = "work") -> list[dict]:
    """Make next week's priorities into tasks due next Friday."""
    from ..goals import service as goals
    start = monday(week)
    row = conn.execute("SELECT priorities FROM weekly_reviews WHERE week_start = ?", (start.isoformat(),)).fetchone()
    if not row:
        raise ValidationError("Save some priorities first")
    due = (start + timedelta(days=11)).isoformat()  # Friday of the next week
    existing = {r[0].lower() for r in conn.execute("SELECT title FROM tasks WHERE done = 0")}
    made = []
    for p in json.loads(row["priorities"] or "[]"):
        if p.lower() in existing:
            continue
        made.append(goals.create_task(conn, {"title": p, "area": area, "due_date": due, "priority": "high"}))
    return made


def stats_text(s: dict) -> str:
    lines = [f"Week {s['start']} to {s['end']}."]
    lines.append(f"Tasks completed ({len(s['tasks_done'])}): " + "; ".join(t["title"] for t in s["tasks_done"][:20]))
    if s["tasks_overdue"]:
        lines.append("Still overdue: " + "; ".join(f"{t['title']} (due {t['due_date']})" for t in s["tasks_overdue"][:10]))
    lines.append("Routines: " + "; ".join(f"{r['title']} {r['done']}/{r['planned']}" for r in s["routines"]))
    if s["goal_notes"]:
        lines.append("Goal progress notes: " + "; ".join(f"{n['title']}: {n['text'][:100]}" for n in s["goal_notes"][:12]))
    sch = s["schedule"] or {}
    if sch.get("total"):
        lines.append(f"Schedule blocks done: {sch['done']}/{sch['total']}")
    if s["focus_minutes"]:
        lines.append(f"Focus time: {s['focus_minutes']} minutes")
    if s["workouts"]:
        lines.append(f"Workouts ({len(s['workouts'])}): " + "; ".join(f"{w['date']} {w['title']}" for w in s["workouts"]))
    if s["money"]:
        m = s["money"]
        lines.append(f"Money: income ${m['income']:,.0f}, spending ${m['spending']:,.0f}; top: "
                     + ", ".join(f"{c['category']} ${c['spent']:,.0f}" for c in m["top"]))
    if s["cpa"]:
        lines.append(f"CPA study: {s['cpa']['hours']} hours"
                     + ("; practice scores " + ", ".join(f"{x['section']} {x['score']:g}%" for x in s["cpa"]["scores"]) if s["cpa"]["scores"] else ""))
    if s["people"]:
        lines.append("Stayed in touch with: " + ", ".join(sorted({p["name"] for p in s["people"]})))
    return "\n".join(lines)
