"""API endpoints for email (Gmail)."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..assistant.claude_client import AssistantError
from ..calendar import google
from . import assistant, gmail

router = APIRouter(prefix="/api/email", tags=["email"])


class Turn(BaseModel):
    role: str
    content: str


class AskIn(BaseModel):
    question: str
    history: list[Turn] = []


class SendIn(BaseModel):
    to: str
    cc: str = ""
    subject: str = ""
    body: str
    reply_to_id: str | None = None


def _run(fn, *args):
    try:
        return fn(*args)
    except google.NotConnected as e:
        raise HTTPException(status_code=409, detail=str(e))
    except google.CalendarError as e:  # includes EmailError
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
def status():
    return {
        "client_configured": google.load_client() is not None,
        "connected": google.is_connected(),
        "gmail": google.has_gmail(),
    }


@router.get("/messages")
async def messages(q: str = "in:inbox", max: int = 25):
    return await run_in_threadpool(_run, gmail.search, q, max)


@router.get("/messages/{msg_id}")
async def message(msg_id: str):
    return await run_in_threadpool(_run, gmail.get_message, msg_id)


@router.post("/ask")
async def ask(body: AskIn):
    """Ask the email assistant. It may return a draft; it never sends."""
    try:
        return await run_in_threadpool(_run, assistant.ask, body.question.strip(),
                                       [t.model_dump() for t in body.history])
    except AssistantError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/send")
async def send(body: SendIn):
    """Send an email. Only the app's Send button calls this, after you've reviewed it."""
    return await run_in_threadpool(_run, gmail.send, body.to, body.subject, body.body,
                                   body.cc, body.reply_to_id)
