"""API endpoints for the CPA exam planner."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/cpa", tags=["cpa"])


class SectionPatch(BaseModel):
    code: str | None = None
    status: str | None = None
    study_start: str | None = None
    exam_date: str | None = None
    target_hours: float | None = None
    score: int | None = None
    passed_date: str | None = None
    notes: str | None = None


class ScoreIn(BaseModel):
    section: str
    score: float
    date: str | None = None
    kind: str = "practice exam"
    notes: str = ""


class SettingsIn(BaseModel):
    habit_id: int | None = None
    window_months: int | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview():
    return _run(service.overview)


@router.patch("/sections/{section_id}")
def update_section(section_id: int, body: SectionPatch):
    _run(service.update_section, section_id, body.model_dump(exclude_unset=True))
    return _run(service.overview)


@router.post("/scores")
def add_score(body: ScoreIn):
    _run(service.add_score, body.section, body.score, body.date, body.kind, body.notes)
    return _run(service.overview)


@router.delete("/scores/{score_id}")
def delete_score(score_id: int):
    _run(service.delete_score, score_id)
    return _run(service.overview)


@router.put("/settings")
def settings(body: SettingsIn):
    return _run(service.save_settings, body.habit_id, body.window_months)
