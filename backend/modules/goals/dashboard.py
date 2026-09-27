"""Builds the numbers shown on the home screen."""
from datetime import date, timedelta

from ...areas import AREAS
from . import service


def area_summary(conn) -> list[dict]:
    summary = []
    for area in AREAS:
        goals = conn.execute(
            "SELECT status, progress FROM goals WHERE area = ?", (area["id"],)
        ).fetchall()
        active = [g for g in goals if g["status"] != "paused"]
        avg = round(sum(g["progress"] for g in active) / len(active)) if active else 0
        open_tasks, done_tasks = conn.execute(
            "SELECT COALESCE(SUM(done = 0), 0), COALESCE(SUM(done = 1), 0) FROM tasks WHERE area = ?",
            (area["id"],),
        ).fetchone()
        summary.append({
            **area,
            "goal_count": len(goals),
            "goals_done": sum(1 for g in goals if g["status"] == "done"),
            "progress": avg,
            "open_tasks": open_tasks,
            "done_tasks": done_tasks,
        })
    return summary


def build_dashboard(conn) -> dict:
    today = date.today()
    today_s = today.isoformat()
    week_end = (today + timedelta(days=7)).isoformat()

    def tasks_where(clause: str, params: tuple) -> list[dict]:
        sql = service.TASK_SELECT + " WHERE t.done = 0 AND " + clause + service.TASK_ORDER
        return [dict(r) for r in conn.execute(sql, params).fetchall()]

    overdue_goals = [dict(r) for r in conn.execute(
        """SELECT * FROM goals WHERE target_date IS NOT NULL AND target_date < ?
           AND status NOT IN ('done', 'paused') ORDER BY target_date""",
        (today_s,),
    ).fetchall()]

    recent_notes = [dict(r) for r in conn.execute(
        """SELECT n.*, g.title AS goal_title, g.area AS area, g.progress AS goal_progress
           FROM goal_notes n JOIN goals g ON g.id = n.goal_id
           ORDER BY n.created_at DESC, n.id DESC LIMIT 8"""
    ).fetchall()]

    recently_done = [dict(r) for r in conn.execute(
        service.TASK_SELECT + " WHERE t.done = 1 ORDER BY t.done_at DESC LIMIT 5"
    ).fetchall()]

    return {
        "today": today_s,
        "areas": area_summary(conn),
        "overdue_tasks": tasks_where("t.due_date < ?", (today_s,)),
        "overdue_goals": overdue_goals,
        "due_today": tasks_where("t.due_date = ?", (today_s,)),
        "due_this_week": tasks_where("t.due_date > ? AND t.due_date <= ?", (today_s, week_end)),
        "recent_notes": recent_notes,
        "recently_done": recently_done,
    }
