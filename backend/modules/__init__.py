"""The list of backend modules.

Each module is a folder with a `router` (its API endpoints) and an optional
`on_startup(conn)` function. To add a future module (Calendar, Finances,
Email...), create its folder and add it to MODULES below.
"""
from . import (assistant, calendar, cpa, email, finances, followups, fun, goals, habits, home, journal, people,
               remote, review, schedule, shopping)

MODULES = [goals, habits, calendar, email, shopping, finances, followups, schedule, cpa, people, fun,
           journal, home, review, remote, assistant]
