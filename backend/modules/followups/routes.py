"""API endpoints for follow-ups, reminders and desktop notifications."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import notify
from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api", tags=["follow-ups"])

Direction = Literal["todo", "waiting"]


class FollowupIn(BaseModel):
    title: str
    person: str = ""
    direction: Direction = "todo"
    notes: str = ""
    due_date: str | None = None
    remind_at: str | None = None


class FollowupPatch(BaseModel):
    title: str | None = None
    person: str | None = None
    direction: Direction | None = None
    notes: str | None = None
    due_date: str | None = None
    done: bool | None = None
    remind_at: str | None = None


class ReminderIn(BaseModel):
    at: str | None = None


class SettingsIn(BaseModel):
    notify_briefing: str | None = None
    notify_budget: bool | None = None


def _run(fn, *args, real: bool = False, **kwargs):
    try:
        with get_db(real=real) as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Follow-ups --------------------------------------------------------------

@router.get("/followups")
def list_followups():
    return {"items": _run(service.list_followups), "summary": _run(service.summary)}


@router.post("/followups")
def create_followup(body: FollowupIn):
    def work(conn):
        item = service.create_followup(conn, body.model_dump(exclude={"remind_at"}))
        if body.remind_at:
            service.set_reminder(conn, "followup", item["id"], body.remind_at)
        return service.get_followup(conn, item["id"])
    return _run(work)


@router.patch("/followups/{fid}")
def update_followup(fid: int, body: FollowupPatch):
    fields = body.model_dump(exclude_unset=True)

    def work(conn):
        service.update_followup(conn, fid, {k: v for k, v in fields.items() if k != "remind_at"})
        if "remind_at" in fields:
            service.set_reminder(conn, "followup", fid, fields["remind_at"])
        return service.get_followup(conn, fid)
    return _run(work)


@router.delete("/followups/{fid}")
def delete_followup(fid: int):
    _run(service.delete_followup, fid)
    return {"ok": True}


# --- Reminders on tasks and routines ------------------------------------------

@router.get("/reminders")
def upcoming():
    return _run(service.upcoming)


@router.put("/reminders/{kind}/{ref_id}")
def set_reminder(kind: str, ref_id: int, body: ReminderIn):
    return {"reminder": _run(service.set_reminder, kind, ref_id, body.at)}


# --- Notifications -------------------------------------------------------------

@router.get("/notifications")
def notifications():
    def work(conn):
        return {"items": service.list_notifications(conn), "unread": service.unread_count(conn)}
    data = _run(work)
    # Notification settings always belong to your real data (the reminder check reads them there).
    data["settings"] = _run(service.get_settings, real=True)
    data["background"] = background_status()
    return data


def background_status() -> dict:
    try:
        installed = notify.task_installed()
    except Exception:  # noqa: BLE001
        installed = False
    return {"supported": installed is not None, "installed": bool(installed)}


@router.post("/notifications/read")
def mark_read():
    _run(service.mark_all_read)
    return {"ok": True}


@router.patch("/notifications/settings")
def save_settings(body: SettingsIn):
    return _run(service.save_settings, body.model_dump(exclude_none=True), real=True)


@router.post("/notifications/enable")
async def enable():
    try:
        await run_in_threadpool(notify.install_task)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _run(service.save_settings, {"notify_enabled": "1"}, real=True)
    return await test()


@router.post("/notifications/disable")
async def disable():
    await run_in_threadpool(notify.remove_task)
    _run(service.save_settings, {"notify_enabled": "0"}, real=True)
    return {"ok": True}


@router.post("/notifications/test")
async def test():
    title, body = "🔔 Notifications are on", "Reminders will show up here, even when the app is closed."
    _run(service.add_notification, "test", title, body, "followups",
         dedupe=f"test:{datetime.now().isoformat(timespec='seconds')}", real=True)

    def show():
        with get_db(real=True) as conn:  # mark it delivered, then show it
            conn.execute("UPDATE notifications SET delivered_at = ? WHERE kind = 'test' AND delivered_at IS NULL",
                         (datetime.now().isoformat(timespec="seconds"),))
        notify.send_toast(title, body, "followups")
    try:
        await run_in_threadpool(show)
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=400, detail=f"The test notification couldn't be shown: {e}")
    return {"ok": True}
