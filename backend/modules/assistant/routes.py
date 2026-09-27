"""API endpoints for the command bar."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import config
from ...database import get_db
from ..goals import service
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

    with get_db() as conn:
        context = build_context(service.list_goals(conn), service.list_tasks(conn))

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
    if intent != "actions" or not result["actions"]:
        return {"status": "clarify" if intent == "clarify" else "answer",
                "reply": reply, "changes": [], "log_id": None}

    try:
        with get_db() as conn:  # all-or-nothing: any error rolls everything back
            undo, summary = actions.apply_actions(conn, result["actions"])
            log_id = actions.log_command(conn, text, reply, undo) if undo else None
    except (ValidationError, ValueError) as e:
        return {"status": "error", "reply": f"I couldn't apply that: {e}", "changes": [], "log_id": None}

    return {"status": "applied", "reply": reply, "changes": summary, "log_id": log_id}


@router.post("/{log_id}/undo")
def undo(log_id: int):
    try:
        with get_db() as conn:
            return {"reply": actions.undo_command(conn, log_id)}
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
