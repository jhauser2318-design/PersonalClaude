"""API endpoints for routines (recurring tasks)."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from ..followups import service as reminders
from . import service

router = APIRouter(prefix="/api/habits", tags=["routines"])

Frequency = Literal["daily", "weekdays", "times_per_week"]


class HabitIn(BaseModel):
    title: str
    area: str
    goal_id: int | None = None
    frequency: Frequency = "daily"
    days: list[int] = []
    times_per_week: int | None = None
    target_amount: float | None = None
    unit: str | None = None
    remind_at: str | None = None


class HabitPatch(BaseModel):
    title: str | None = None
    area: str | None = None
    goal_id: int | None = None
    frequency: Frequency | None = None
    days: list[int] | None = None
    times_per_week: int | None = None
    target_amount: float | None = None
    unit: str | None = None
    active: bool | None = None
    remind_at: str | None = None   # daily reminder "HH:MM"; null removes it


class LogIn(BaseModel):
    date: str | None = None
    amount: float | None = None
    note: str = ""


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_habits(area: str | None = None):
    return _run(service.list_habits, area)


@router.get("/{habit_id}")
def get_habit(habit_id: int):
    habit = _run(service.get_habit, habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Routine not found")
    return habit


@router.post("")
def create_habit(body: HabitIn):
    def work(conn):
        habit = service.create_habit(conn, body.model_dump(exclude={"remind_at"}))
        if body.remind_at:
            reminders.set_reminder(conn, "routine", habit["id"], body.remind_at)
        return service.get_habit(conn, habit["id"])
    return _run(work)


@router.patch("/{habit_id}")
def update_habit(habit_id: int, body: HabitPatch):
    fields = body.model_dump(exclude_unset=True)

    def work(conn):
        service.update_habit(conn, habit_id, {k: v for k, v in fields.items() if k != "remind_at"})
        if "remind_at" in fields:
            reminders.set_reminder(conn, "routine", habit_id, fields["remind_at"])
        return service.get_habit(conn, habit_id)
    return _run(work)


@router.delete("/{habit_id}")
def delete_habit(habit_id: int):
    def work(conn):
        service.delete_habit(conn, habit_id)
        reminders.set_reminder(conn, "routine", habit_id, None)
    _run(work)
    return {"ok": True}


@router.post("/{habit_id}/log")
def log_habit(habit_id: int, body: LogIn):
    _run(service.log_habit, habit_id, body.date, body.amount, body.note)
    return _run(service.get_habit, habit_id)


@router.delete("/{habit_id}/log")
def unlog_habit(habit_id: int, date: str | None = None):
    _run(service.unlog_habit, habit_id, date)
    return _run(service.get_habit, habit_id)
