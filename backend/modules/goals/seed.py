"""Example goals and tasks (one per area) so the app isn't empty on day one.

They're marked with is_example = 1, so "Clear examples" removes only these and
never touches anything you created yourself.
"""
from datetime import date, timedelta

from ...database import get_setting, set_setting
from . import service


def _d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


EXAMPLES = [
    {
        "goal": {"title": "Ship the Q4 project plan", "area": "work",
                 "description": "Get the plan written, reviewed and approved by my manager.",
                 "target_date": 30, "status": "in_progress", "progress": 40},
        "note": "Outline done, waiting on budget numbers.",
        "tasks": [
            {"title": "Email Sarah about the budget numbers", "due_date": 0, "priority": "high"},
            {"title": "Draft the timeline section", "due_date": 4, "priority": "medium"},
        ],
    },
    {
        "goal": {"title": "Run a 5K", "area": "health",
                 "description": "Build up from walking to running 5 km without stopping.",
                 "target_date": 60, "status": "in_progress", "progress": 25},
        "note": "Ran 2 km without stopping today!",
        "tasks": [
            {"title": "Go for a 20-minute run", "due_date": 1, "priority": "medium"},
            {"title": "Buy proper running shoes", "due_date": -2, "priority": "low"},
        ],
    },
    {
        "goal": {"title": "Catch up with old friends monthly", "area": "social",
                 "description": "See or call at least one old friend every month.",
                 "target_date": None, "status": "not_started", "progress": 0},
        "note": None,
        "tasks": [
            {"title": "Call Alex to plan dinner", "due_date": 3, "priority": "medium"},
        ],
    },
    {
        "goal": {"title": "Reach conversational Spanish", "area": "education",
                 "description": "Hold a 10-minute conversation in Spanish.",
                 "target_date": 180, "status": "in_progress", "progress": 15},
        "note": "Finished unit 3 of the course.",
        "tasks": [
            {"title": "Spanish lesson: unit 4", "due_date": 0, "priority": "medium"},
        ],
    },
]


def load_examples(conn) -> int:
    count = 0
    for ex in EXAMPLES:
        g = dict(ex["goal"])
        g["target_date"] = _d(g["target_date"]) if g["target_date"] is not None else None
        goal = service.create_goal(conn, g, is_example=True)
        if ex["note"]:
            service.add_note(conn, goal["id"], ex["note"], source="example")
        for t in ex["tasks"]:
            service.create_task(conn, {**t, "due_date": _d(t["due_date"]), "area": g["area"],
                                       "goal_id": goal["id"]}, is_example=True)
            count += 1
        count += 1
    return count


def clear_examples(conn) -> int:
    removed = conn.execute("DELETE FROM tasks WHERE is_example = 1").rowcount
    removed += conn.execute("DELETE FROM goals WHERE is_example = 1").rowcount
    return removed


def seed_if_first_run(conn) -> None:
    """Load examples once, the very first time the app starts."""
    if get_setting(conn, "examples_seeded"):
        return
    load_examples(conn)
    set_setting(conn, "examples_seeded", "1")
