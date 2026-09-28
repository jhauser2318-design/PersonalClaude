"""API endpoints for routines (recurring tasks)."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
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
    return _run(service.create_habit, body.model_dump())


@router.patch("/{habit_id}")
def update_habit(habit_id: int, body: HabitPatch):
    return _run(service.update_habit, habit_id, body.model_dump(exclude_unset=True))


@router.delete("/{habit_id}")
def delete_habit(habit_id: int):
    _run(service.delete_habit, habit_id)
    return {"ok": True}


@router.post("/{habit_id}/log")
def log_habit(habit_id: int, body: LogIn):
    _run(service.log_habit, habit_id, body.date, body.amount, body.note)
    return _run(service.get_habit, habit_id)


@router.delete("/{habit_id}/log")
def unlog_habit(habit_id: int, date: str | None = None):
    _run(service.unlog_habit, habit_id, date)
    return _run(service.get_habit, habit_id)
