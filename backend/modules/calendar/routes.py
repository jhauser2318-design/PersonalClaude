"""API endpoints for the calendar (Google Calendar)."""
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from . import google, service
from .google import CalendarError

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


class ClientIn(BaseModel):
    text: str


class EventIn(BaseModel):
    title: str
    start: str
    end: str | None = None
    location: str = ""
    description: str = ""


class EventPatch(BaseModel):
    title: str | None = None
    start: str | None = None
    end: str | None = None
    location: str | None = None
    description: str | None = None


def _run(fn, *args):
    try:
        return fn(*args)
    except google.NotConnected as e:
        raise HTTPException(status_code=409, detail=str(e))
    except CalendarError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
def status():
    return {
        "client_configured": google.load_client() is not None,
        "connected": google.is_connected(),
        "redirect_uri": google.REDIRECT_URI,
        "last_error": google.last_error,
    }


@router.post("/client")
def upload_client(body: ClientIn):
    _run(google.save_client, body.text)
    return status()


@router.get("/connect")
def connect():
    google.last_error = None
    return {"url": _run(google.authorization_url)}


@router.get("/oauth/callback")
def oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Google sends you back here after you approve (or cancel) access."""
    if error:
        google.last_error = "Google sign-in was cancelled." if error == "access_denied" else f"Google said: {error}"
    else:
        try:
            google.finish_sign_in(code or "", state or "")
            google.last_error = None
        except CalendarError as e:
            google.last_error = str(e)
    return RedirectResponse("/#/calendar")


@router.post("/disconnect")
def disconnect():
    google.disconnect()
    return status()


@router.get("/events")
def events(start: str | None = None, days: int = 7):
    if not google.is_connected():
        return {"connected": False, "events": []}
    try:
        first = date.fromisoformat(start) if start else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="start must be YYYY-MM-DD")
    items = _run(service.list_events, first, max(1, min(days, 42)))
    return {"connected": True, "time_zone": service._time_zone, "events": items}


@router.post("/events")
def create(body: EventIn):
    return _run(service.create_event, body.title, body.start, body.end, body.location, body.description)


@router.patch("/events/{event_id}")
def update(event_id: str, body: EventPatch):
    return _run(service.update_event, event_id, body.model_dump(exclude_unset=True))[1]


@router.delete("/events/{event_id}")
def delete(event_id: str):
    _run(service.delete_event, event_id)
    return {"ok": True}
