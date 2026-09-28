"""API endpoints for People."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/people", tags=["people"])


class PersonIn(BaseModel):
    name: str | None = None
    relation: str | None = None
    birthday: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    cadence_days: int | None = None


class ContactIn(BaseModel):
    date: str | None = None
    kind: str = "talked"
    note: str = ""


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def everyone():
    def work(conn):
        return {"people": service.list_people(conn), **service.summary(conn), "relations": service.RELATIONS,
                "kinds": service.KINDS}
    return _run(work)


@router.post("")
def create(body: PersonIn):
    return _run(service.create_person, body.model_dump(exclude_unset=True))


@router.get("/{person_id}")
def one(person_id: int):
    def work(conn):
        p = service.get_person(conn, person_id)
        if p is None:
            raise ValidationError("That person doesn't exist")
        p["interactions"] = service.list_interactions(conn, person_id)
        return p
    return _run(work)


@router.patch("/{person_id}")
def update(person_id: int, body: PersonIn):
    return _run(service.update_person, person_id, body.model_dump(exclude_unset=True))


@router.delete("/{person_id}")
def delete(person_id: int):
    _run(service.delete_person, person_id)
    return {"ok": True}


@router.post("/{person_id}/contact")
def contact(person_id: int, body: ContactIn):
    return _run(service.log_contact, person_id, body.date, body.kind, body.note)


@router.delete("/contact/{interaction_id}")
def delete_contact(interaction_id: int):
    _run(service.delete_interaction, interaction_id)
    return {"ok": True}
