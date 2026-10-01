"""API endpoints for the Journal."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/journal", tags=["journal"])


class EntryIn(BaseModel):
    body: str | None = None
    mood: int | None = None
    clear_mood: bool = False


class SettingsIn(BaseModel):
    remind_at: str = ""


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview(q: str = "", limit: int = 60):
    return _run(service.overview, q, limit)


@router.put("/settings")
def save_settings(body: SettingsIn):
    return {"remind_at": _run(service.set_remind_time, body.remind_at)}


@router.get("/{day}")
def get_entry(day: str):
    return _run(service.get_entry, day) or {"date": day, "body": "", "mood": None, "words": 0, "new": True}


@router.put("/{day}")
def save_entry(day: str, body: EntryIn):
    return _run(service.save_entry, day, body.body, body.mood, body.clear_mood) or {"date": day, "body": "", "mood": None, "words": 0, "new": True}


@router.delete("/{day}")
def delete_entry(day: str):
    _run(service.delete_entry, day)
    return {"ok": True}
