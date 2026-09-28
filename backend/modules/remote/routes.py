"""API endpoints for phone access: signing in, remembered devices, background
mode and Tailscale setup. Setup changes can only be made on the PC itself."""
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import auth, host

router = APIRouter(prefix="/api", tags=["phone access"])


class PasscodeIn(BaseModel):
    passcode: str


class ToggleIn(BaseModel):
    on: bool


def _pc_only(request: Request):
    if auth.is_remote(request.headers):
        raise HTTPException(status_code=403, detail="This can only be changed on your PC.")


def _run(fn, *args):
    try:
        with get_db() as conn:
            return fn(conn, *args)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Signing in ------------------------------------------------------------------

@router.get("/auth/status")
def auth_status(request: Request):
    remote = auth.is_remote(request.headers)
    with get_db() as conn:
        signed_in = (not remote) or auth.session(conn, request.cookies.get(auth.COOKIE)) is not None
        return {"remote": remote, "signed_in": signed_in, "has_passcode": auth.has_passcode(conn)}


@router.post("/auth/login")
def login(body: PasscodeIn, request: Request, response: Response):
    token = _run(auth.login, body.passcode, request.headers.get("user-agent", ""))
    response.set_cookie(auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
                        secure=auth.is_remote(request.headers), samesite="lax", path="/")
    return {"ok": True}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    _run(auth.logout, request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


# --- Phone & devices (Settings) ---------------------------------------------------

@router.get("/remote/status")
async def remote_status(request: Request):
    remote = auth.is_remote(request.headers)
    with get_db() as conn:
        me = auth.session(conn, request.cookies.get(auth.COOKIE)) if remote else None
        data = {"remote": remote, "this_device": me and me["id"], "has_passcode": auth.has_passcode(conn),
                "devices": auth.list_devices(conn)}
    data["background"] = host.background_status()
    data["tailscale"] = None if remote else await run_in_threadpool(host.tailscale_status)
    return data


@router.post("/remote/passcode")
def set_passcode(body: PasscodeIn, request: Request):
    _pc_only(request)
    _run(auth.set_passcode, body.passcode)
    return {"ok": True}


@router.post("/remote/background")
async def set_background(body: ToggleIn, request: Request):
    _pc_only(request)
    try:
        await run_in_threadpool(host.set_always_on, body.on)
    except host.HostError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return host.background_status()


@router.post("/remote/tailscale/on")
async def tailscale_on(request: Request):
    _pc_only(request)
    with get_db() as conn:
        if not auth.has_passcode(conn):
            raise HTTPException(status_code=400, detail="Set a passcode first (step 3), so only you can open the app.")
    try:
        return await run_in_threadpool(host.start_serving)
    except host.HostError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/remote/tailscale/off")
async def tailscale_off(request: Request):
    _pc_only(request)
    await run_in_threadpool(host.stop_serving)
    return {"ok": True}


@router.delete("/remote/devices/{device_id}")
def forget_device(device_id: int):
    _run(auth.forget_device, device_id)
    return {"ok": True}
