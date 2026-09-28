"""API endpoints for Workouts."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/fitness", tags=["fitness"])


class SetIn(BaseModel):
    exercise: str
    sets: int = 1
    reps: int = 0
    weight: float = 0


class WorkoutIn(BaseModel):
    date: str | None = None
    kind: str = "strength"
    title: str = ""
    minutes: float | None = None
    distance: float | None = None
    notes: str = ""
    sets: list[SetIn] = []


class WeightIn(BaseModel):
    weight: float
    date: str | None = None


class HabitIn(BaseModel):
    habit_id: int | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview():
    return _run(service.overview)


@router.post("/workouts")
def create(body: WorkoutIn):
    return _run(service.save_workout, body.model_dump())


@router.patch("/workouts/{workout_id}")
def update(workout_id: int, body: WorkoutIn):
    return _run(service.save_workout, body.model_dump(), workout_id, False)


@router.delete("/workouts/{workout_id}")
def delete(workout_id: int):
    _run(service.delete_workout, workout_id)
    return {"ok": True}


@router.post("/weight")
def weight(body: WeightIn):
    return _run(service.log_weight, body.weight, body.date)


@router.delete("/weight/{day}")
def delete_weight(day: str):
    _run(service.delete_weight, day)
    return {"ok": True}


@router.put("/habit")
def habit(body: HabitIn):
    _run(service.set_gym_habit, body.habit_id)
    return _run(service.overview)
