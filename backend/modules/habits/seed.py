"""Starter routines, added once: the gym, skincare and CPA study.

They're normal routines (not examples), so "Clear example data" won't remove
them. Edit or delete them like any other routine.
"""
from ...database import get_setting, set_setting
from . import service

STARTERS = [
    {"title": "Go to the gym", "area": "health", "frequency": "times_per_week", "times_per_week": 4},
    {"title": "Skincare routine", "area": "health", "frequency": "daily"},
    {"title": "CPA study", "area": "education", "frequency": "daily",
     "target_amount": 2, "unit": "hours"},
]


def seed_starters(conn) -> None:
    if get_setting(conn, "starter_routines_added"):
        return
    # Link CPA study to a CPA goal if one already exists.
    cpa_goal = conn.execute(
        "SELECT id FROM goals WHERE title LIKE '%CPA%' ORDER BY id LIMIT 1").fetchone()
    for starter in STARTERS:
        fields = dict(starter)
        if "CPA" in fields["title"] and cpa_goal:
            fields["goal_id"] = cpa_goal["id"]
        service.create_habit(conn, fields)
    set_setting(conn, "starter_routines_added", "1")
