"""API endpoints for the command bar."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import config
from ...database import get_db
from datetime import date, timedelta

from ..calendar import google as calendar_google
from ..calendar import service as calendar
from ..calendar.google import CalendarError
from ..goals import service
from ..habits import service as habits
from ..shopping import service as shopping
from ..goals.service import ValidationError
from . import actions
from .claude_client import AssistantError, ask_claude, build_context

router = APIRouter(prefix="/api/command", tags=["command bar"])


class Turn(BaseModel):
    role: str
    content: str


class CommandIn(BaseModel):
    text: str
    history: list[Turn] = []


@router.get("/status")
def status():
    return {"api_key_configured": config.api_key_configured(), "model": config.CLAUDE_MODEL}


@router.post("")
async def run_command(body: CommandIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Type something first")

    cal = {"connected": calendar_google.is_connected()}
    if cal["connected"]:
        try:
            cal["events"] = await run_in_threadpool(
                calendar.list_events, date.today() - timedelta(days=1), 16)
            cal["time_zone"] = calendar._time_zone
        except CalendarError as e:
            cal["error"] = str(e)

    with get_db() as conn:
        context = build_context(service.list_goals(conn), service.list_tasks(conn),
                                habits.list_habits(conn), cal, shopping.list_items(conn))

    try:
        # Calling Claude takes a few seconds; run it off the main thread so the
        # rest of the app stays responsive.
        result = await run_in_threadpool(
            ask_claude, text, context, [t.model_dump() for t in body.history]
        )
    except AssistantError as e:
        return {"status": "error", "reply": str(e), "changes": [], "log_id": None}

    intent = result.get("intent")
    reply = result.get("reply", "").strip()
    if intent == "email":
        # Hand over to the email assistant (it can search/read Gmail and draft,
        # never send: sending needs the user's click on Send).
        from ..email import assistant as email_assistant
        try:
            answer = await run_in_threadpool(
                email_assistant.ask, text, [t.model_dump() for t in body.history])
        except (AssistantError, CalendarError) as e:
            return {"status": "error", "reply": str(e), "changes": [], "log_id": None}
        return {"status": "email", "reply": answer["answer"], "sources": answer["sources"],
                "draft": answer["draft"], "changes": [], "log_id": None}
    if intent != "actions" or not result["actions"]:
        return {"status": "clarify" if intent == "clarify" else "answer",
                "reply": reply, "changes": [], "log_id": None}

    def apply():
        with get_db() as conn:  # all-or-nothing: any error rolls everything back
            undo, summary = actions.apply_actions(conn, result["actions"])
            log_id = actions.log_command(conn, text, reply, undo) if undo else None
        return summary, log_id

    try:
        # Calendar changes talk to Google, so run this off the main thread too.
        summary, log_id = await run_in_threadpool(apply)
    except (ValidationError, CalendarError, ValueError) as e:
        return {"status": "error", "reply": f"I couldn't apply that: {e}", "changes": [], "log_id": None}

    return {"status": "applied", "reply": reply, "changes": summary, "log_id": log_id}


@router.post("/{log_id}/undo")
def undo(log_id: int):
    try:
        with get_db() as conn:
            return {"reply": actions.undo_command(conn, log_id)}
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
