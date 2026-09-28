"""API endpoints for follow-ups, reminders and desktop notifications."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import notify, push
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
    notify_desktop: bool | None = None


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


# ---------------------------------------------------------------------------
# Phone notifications (Web Push; see backend/push.py)
# ---------------------------------------------------------------------------

class SubscribeIn(BaseModel):
    subscription: dict
    label: str = "Phone"


class EndpointIn(BaseModel):
    endpoint: str | None = None


def _push_run(fn, *args):
    with get_db(real=True) as conn:  # phones and keys always live in your real data
        return fn(conn, *args)


REPAIR = {"running": False}


def _repair_in_background() -> None:
    """If the package phone notifications need is missing, install it (once at a time)."""
    import threading
    if REPAIR["running"]:
        return
    REPAIR["running"] = True

    def run():
        try:
            push.install_missing()
        finally:
            REPAIR["running"] = False
    threading.Thread(target=run, daemon=True).start()


@router.get("/push/status")
def push_status():
    problem = push.ready()
    if problem:
        _repair_in_background()
        with get_db(real=True) as conn:
            return {"key": None, "devices": push.devices(conn), "problem": problem, "repairing": REPAIR["running"],
                    "enabled": service.get_settings(conn)["notify_enabled"] == "1", "background": background_status()}
    def work(conn):
        return {"key": push.public_key(conn), "devices": push.devices(conn), "problem": None,
                "enabled": service.get_settings(conn)["notify_enabled"] == "1"}
    data = _push_run(work)
    data["background"] = background_status()
    return data


@router.post("/push/subscribe")
async def push_subscribe(body: SubscribeIn):
    if push.ready():
        _repair_in_background()
        raise HTTPException(status_code=503, detail="Your PC is still installing a piece it needs for phone notifications. "
                                                    "Wait a minute, then tap Turn on again.")
    try:
        device = _push_run(push.subscribe, body.subscription, body.label)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Reminders are sent by the background check on the PC: make sure it's on.
    _run(service.save_settings, {"notify_enabled": "1"}, real=True)
    try:
        installed = notify.task_installed()  # None: not Windows
        if installed is False:
            await run_in_threadpool(notify.install_task)
        background = None if installed is None else True
    except (RuntimeError, OSError):
        background = False
    report = await run_in_threadpool(_send_test, body.subscription.get("endpoint"))
    return {"device": device, "background": background, "test_sent": report["sent"],
            "test_error": report["errors"][0]["message"] if report["errors"] else None}


def _send_test(endpoint: str | None = None) -> dict:
    msg = [{"title": "🔔 Phone notifications are on", "body": "Reminders will show up here, even when the app is closed.",
            "url": "/#/followups", "tag": "test", "urgent": True}]
    with get_db(real=True) as conn:
        return push.send_report(conn, msg, endpoint=endpoint)


@router.post("/push/test")
async def push_test(body: EndpointIn):
    problem = push.ready()
    if problem:
        _repair_in_background()
        raise HTTPException(status_code=503, detail=problem + " The app is installing it now; try again in a minute.")
    report = await run_in_threadpool(_send_test, body.endpoint)
    if report["phones"] == 0:
        raise HTTPException(status_code=400, detail="Your PC doesn't have this phone on its list. On the phone, tap "
                                                    "Turn off here, then Turn on for this phone.")
    if not report["sent"]:
        raise HTTPException(status_code=400, detail=report["errors"][0]["message"] if report["errors"] else "The test didn't go through.")
    return {"sent": report["sent"]}


@router.post("/push/unsubscribe")
def push_unsubscribe(body: EndpointIn):
    _push_run(push.unsubscribe, body.endpoint)
    return {"ok": True}


@router.delete("/push/devices/{device_id}")
def push_forget(device_id: int):
    _push_run(push.unsubscribe, None, device_id)
    return {"ok": True}
