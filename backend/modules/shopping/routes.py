"""API endpoints for the shopping list."""
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import links, service

router = APIRouter(prefix="/api/shopping", tags=["shopping"])

Category = Literal["need", "want"]


class ItemIn(BaseModel):
    name: str
    description: str = ""
    category: Category = "want"
    price: float | None = None
    url: str = ""


class ItemPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    category: Category | None = None
    price: float | None = None
    url: str | None = None
    bought: bool | None = None


class LinkIn(BaseModel):
    url: str


def _run(fn, *args):
    try:
        with get_db() as conn:
            return fn(conn, *args)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_items():
    return {"items": _run(service.list_items), "totals": _run(service.totals)}


@router.post("")
def create_item(body: ItemIn):
    return _run(service.create_item, body.model_dump())


@router.patch("/{item_id}")
def update_item(item_id: int, body: ItemPatch):
    return _run(service.update_item, item_id, body.model_dump(exclude_unset=True))


@router.delete("/{item_id}")
def delete_item(item_id: int):
    _run(service.delete_item, item_id)
    return {"ok": True}


@router.post("/lookup")
async def lookup(body: LinkIn):
    """Try to read a product's name, description and price from its link."""
    return await run_in_threadpool(links.fetch_details, body.url)
