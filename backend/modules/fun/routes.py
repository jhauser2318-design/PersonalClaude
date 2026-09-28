"""API endpoints for Fun & leisure."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/fun", tags=["fun"])


class EntryIn(BaseModel):
    title: str | None = None
    date: str | None = None
    category: str | None = None
    rating: int | None = None
    with_whom: str | None = None
    place: str | None = None
    cost: float | None = None
    notes: str | None = None


class IdeaIn(BaseModel):
    title: str | None = None
    category: str | None = None
    notes: str | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview():
    return _run(service.overview)


@router.post("")
def add(body: EntryIn):
    return _run(service.add_entry, body.model_dump(exclude_unset=True))


@router.patch("/{entry_id}")
def update(entry_id: int, body: EntryIn):
    return _run(service.update_entry, entry_id, body.model_dump(exclude_unset=True))


@router.delete("/{entry_id}")
def delete(entry_id: int):
    _run(service.delete_entry, entry_id)
    return {"ok": True}


@router.post("/ideas")
def add_idea(body: IdeaIn):
    return _run(service.add_idea, body.title, body.category or "other", body.notes or "")


@router.patch("/ideas/{idea_id}")
def update_idea(idea_id: int, body: IdeaIn):
    return _run(service.update_idea, idea_id, body.model_dump(exclude_unset=True))


@router.delete("/ideas/{idea_id}")
def delete_idea(idea_id: int):
    _run(service.delete_idea, idea_id)
    return {"ok": True}


@router.post("/ideas/{idea_id}/done")
def do_idea(idea_id: int, body: EntryIn):
    return _run(service.do_idea, idea_id, body.model_dump(exclude_unset=True, exclude={"title", "category"}))
