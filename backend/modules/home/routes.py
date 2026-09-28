"""API endpoints for Home maintenance."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/home", tags=["home"])


class ItemIn(BaseModel):
    name: str
    category: str = "home"
    one_time: bool = False
    due_date: str | None = None
    every_n: int = 3
    every_unit: str = "months"
    last_done: str | None = None
    notes: str = ""


class DoneIn(BaseModel):
    date: str | None = None
    cost: float | None = None
    note: str = ""


class DateIn(BaseModel):
    name: str
    kind: str = "document"
    date: str
    remind_days: int = 30
    location: str = ""
    notes: str = ""
    done: bool = False


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview():
    return _run(service.overview)


@router.post("/maintenance")
def create_item(body: ItemIn):
    return _run(service.save_item, body.model_dump())


@router.patch("/maintenance/{item_id}")
def update_item(item_id: int, body: ItemIn):
    return _run(service.save_item, body.model_dump(), item_id)


@router.delete("/maintenance/{item_id}")
def delete_item(item_id: int):
    _run(service.delete_item, item_id)
    return {"ok": True}


@router.post("/maintenance/{item_id}/done")
def done(item_id: int, body: DoneIn):
    return _run(service.mark_done, item_id, body.date, body.cost, body.note)


@router.post("/maintenance/{item_id}/reopen")
def reopen(item_id: int):
    return _run(service.undo_done, item_id)


@router.delete("/maintenance/log/{log_id}")
def delete_log(log_id: int):
    _run(service.delete_log, log_id)
    return {"ok": True}


@router.post("/dates")
def create_date(body: DateIn):
    return _run(service.save_date, body.model_dump())


@router.patch("/dates/{date_id}")
def update_date(date_id: int, body: DateIn):
    return _run(service.save_date, body.model_dump(), date_id)


@router.delete("/dates/{date_id}")
def delete_date(date_id: int):
    _run(service.delete_date, date_id)
    return {"ok": True}
