"""API endpoints for the Weekly review."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ...database import get_db
from ..assistant.claude_client import AssistantError
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/review", tags=["review"])


class ReviewIn(BaseModel):
    went_well: str | None = None
    improve: str | None = None
    notes: str | None = None
    priorities: list[str] | None = None
    completed: bool | None = None


class TasksIn(BaseModel):
    area: str = "work"


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def review(week: str | None = None):
    return _run(service.get_review, week)


@router.put("/{week}")
def save(week: str, body: ReviewIn):
    return _run(service.save_review, week, body.model_dump())


@router.post("/{week}/summary")
async def summary(week: str):
    from . import assistant
    data = _run(service.get_review, week)
    r = data["review"]
    reflections = "\n".join(x for x in (f"Went well: {r['went_well']}" if r["went_well"] else "",
                                        f"To improve: {r['improve']}" if r["improve"] else "") if x)
    try:
        text = await run_in_threadpool(assistant.summarize, service.stats_text(data["stats"]), reflections)
    except AssistantError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _run(service.save_review, week, {"ai_summary": text})


@router.post("/{week}/tasks")
def tasks(week: str, body: TasksIn):
    made = _run(service.priorities_to_tasks, week, body.area)
    return {"created": made}
