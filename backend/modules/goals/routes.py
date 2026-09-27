"""Web addresses (API endpoints) the browser calls for goals and tasks."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...database import get_db
from . import dashboard, seed, service

router = APIRouter(prefix="/api", tags=["goals"])

Status = Literal["not_started", "in_progress", "done", "paused"]
Priority = Literal["low", "medium", "high"]


class GoalIn(BaseModel):
    title: str
    area: str
    description: str = ""
    target_date: str | None = None
    status: Status = "not_started"
    progress: int = Field(0, ge=0, le=100)


class GoalPatch(BaseModel):
    title: str | None = None
    area: str | None = None
    description: str | None = None
    target_date: str | None = None
    status: Status | None = None
    progress: int | None = Field(None, ge=0, le=100)


class NoteIn(BaseModel):
    text: str


class TaskIn(BaseModel):
    title: str
    area: str
    goal_id: int | None = None
    due_date: str | None = None
    priority: Priority = "medium"
    done: bool = False


class TaskPatch(BaseModel):
    title: str | None = None
    area: str | None = None
    goal_id: int | None = None
    due_date: str | None = None
    priority: Priority | None = None
    done: bool | None = None


def _run(fn, *args):
    """Run a service call, turning validation problems into a friendly 400."""
    try:
        with get_db() as conn:
            return fn(conn, *args)
    except service.ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _not_found(what: str):
    raise HTTPException(status_code=404, detail=f"{what} not found")


# --- Goals -----------------------------------------------------------------

@router.get("/goals")
def list_goals(area: str | None = None):
    return _run(service.list_goals, area)


@router.get("/goals/{goal_id}")
def get_goal(goal_id: int):
    return _run(service.get_goal, goal_id) or _not_found("Goal")


@router.post("/goals")
def create_goal(body: GoalIn):
    return _run(service.create_goal, body.model_dump())


@router.patch("/goals/{goal_id}")
def update_goal(goal_id: int, body: GoalPatch):
    # exclude_unset: only change the fields the browser actually sent,
    # so sending target_date: null clears the date but leaving it out keeps it.
    return _run(service.update_goal, goal_id, body.model_dump(exclude_unset=True))


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int):
    _run(service.delete_goal, goal_id)
    return {"ok": True}


@router.post("/goals/{goal_id}/notes")
def add_note(goal_id: int, body: NoteIn):
    return _run(service.add_note, goal_id, body.text)


@router.delete("/notes/{note_id}")
def delete_note(note_id: int):
    _run(service.delete_note, note_id)
    return {"ok": True}


# --- Tasks -----------------------------------------------------------------

@router.get("/tasks")
def list_tasks(area: str | None = None, goal_id: int | None = None):
    return _run(service.list_tasks, area, goal_id)


@router.post("/tasks")
def create_task(body: TaskIn):
    return _run(service.create_task, body.model_dump())


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, body: TaskPatch):
    return _run(service.update_task, task_id, body.model_dump(exclude_unset=True))


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    _run(service.delete_task, task_id)
    return {"ok": True}


# --- Dashboard & example data ---------------------------------------------

@router.get("/dashboard")
def get_dashboard():
    return _run(dashboard.build_dashboard)


@router.post("/examples/clear")
def clear_examples():
    return {"removed": _run(seed.clear_examples)}


@router.post("/examples/load")
def load_examples():
    return {"added": _run(seed.load_examples)}
