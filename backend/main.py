"""Life Control Center: the web server.

Start it from the project folder with:
    python -m uvicorn backend.main:app --port 8000
then open http://localhost:8000 in your browser.
"""
import importlib.util
import json
import mimetypes
import os
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import threading

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles

from . import backup, config, search as search_
from .areas import AREAS
from .database import DEMO_PATH, data_version, demo_on, get_db, init_db
from .modules import MODULES
from .modules.remote import auth as remote_auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    RUNNING["version"] = _read_version().get("sha")
    RUNNING["last_ping"] = time.time()
    init_db()
    if demo_on():
        init_db(DEMO_PATH)
    with get_db(real=True) as conn:
        for module in MODULES:
            if module.on_startup:
                module.on_startup(conn)
    threading.Thread(target=_daily_upkeep, daemon=True).start()
    print("\n  Life Control Center is running!  Open  http://localhost:8000  in your browser.")
    if not config.api_key_configured():
        print("  (No API key found in .env yet - the command bar won't work until you add one.)")
    print("  Press Ctrl+C in this window to stop it.\n")
    yield


def _daily_upkeep():
    """Back up and tidy once a day while the app runs (the reminder check does it too)."""
    while True:
        try:
            backup.daily()
        except Exception:  # noqa: BLE001 (logged inside)
            pass
        time.sleep(3600)


app = FastAPI(title="Life Control Center", lifespan=lifespan)


@app.middleware("http")
async def always_fresh(request, call_next):
    """Make the app window check for new page files every time.

    Without this, the browser may keep showing a saved (cached) copy of the
    old screens after an update. Files that haven't changed still load
    instantly, because the browser just confirms its copy is current.
    """
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    else:
        response.headers["X-Data-Version"] = str(data_version())
    return response


PC_ONLY_PAGES = ("/api/calendar/connect", "/api/calendar/oauth")


@app.middleware("http")
async def phone_sign_in(request, call_next):
    """Requests from other devices (through Tailscale) need a signed-in device.
    The app's own window on the PC never does."""
    path = request.url.path
    if remote_auth.is_remote(request.headers) and path.startswith("/api/") and not path.startswith("/api/auth/"):
        if path.startswith(PC_ONLY_PAGES):
            return HTMLResponse("<p style='font:16px system-ui;padding:24px'>Connecting Google only works on your PC: "
                                "open the app there and click Connect.</p>", status_code=400)
        with get_db(real=True) as conn:
            signed_in = remote_auth.session(conn, request.cookies.get(remote_auth.COOKIE)) is not None
        if not signed_in:
            return JSONResponse({"detail": "Sign in with your passcode.", "code": "login"}, status_code=401)
    return await call_next(request)

for module in MODULES:
    app.include_router(module.router)


@app.get("/api/areas")
def list_areas():
    return AREAS


# Which version this running copy of the app started with, and when an open
# app window last checked in. The desktop launcher uses both: to spot an old
# copy still running after an update, and to shut down once the window closes.
RUNNING = {"version": None, "last_ping": 0.0}


def seconds_since_ping() -> float:
    return time.time() - RUNNING["last_ping"]


@app.get("/api/app/info")
def app_info():
    return {"version": RUNNING["version"], "pid": os.getpid()}


@app.post("/api/app/ping")
def app_ping():
    RUNNING["last_ping"] = time.time()
    # Windows compare this with the version they loaded, and refresh if it changed.
    return {"ok": True, "version": RUNNING["version"], "data_version": data_version(), "demo": demo_on()}


def _load_updater():
    spec = importlib.util.spec_from_file_location("updater", config.PROJECT_ROOT / "updater.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _restart_app():
    """Start the desktop launcher again; it replaces this (now out-of-date) copy."""
    time.sleep(0.5)  # let the "update installed" reply reach the window first
    exe = Path(sys.executable)
    windowless = exe.with_name("pythonw.exe")
    cmd = [str(windowless if windowless.is_file() else exe), str(config.PROJECT_ROOT / "launcher.pyw")]
    flags = 0x00000008 | 0x00000200 if os.name == "nt" else 0  # detached, so it outlives this process
    subprocess.Popen(cmd, cwd=config.PROJECT_ROOT, env={**os.environ, "LCC_AFTER_UPDATE": "1"},
                     creationflags=flags, start_new_session=os.name != "nt")


@app.post("/api/app/update")
async def app_update(background: BackgroundTasks):
    """The "Check for updates" button: install the newest version, then restart."""
    result = await run_in_threadpool(_load_updater().update)
    v = _read_version()
    if result.get("updated"):
        background.add_task(_restart_app)
    return {
        "updated": bool(result.get("updated")),
        "error": result.get("error"),
        "version": (v.get("sha") or "")[:7] or None,
        "summary": v.get("summary"),
    }


# --- Demo mode (Settings → Demo mode) ---------------------------------------------

@app.get("/api/search")
def search(q: str = ""):
    with get_db() as conn:
        return search_.search(conn, q)


# --- Backups (Settings) -------------------------------------------------------------

@app.get("/api/backups")
def backups():
    return backup.status()


@app.post("/api/backups")
async def backup_now():
    result = await run_in_threadpool(backup.backup_now)
    return {**backup.status(), "result": result}


@app.put("/api/backups/folder")
def backup_folder(body: dict, request: Request):
    if remote_auth.is_remote(request.headers):
        raise HTTPException(status_code=403, detail="Change the backup folder on your PC.")
    folder = str(body.get("folder") or "").strip().strip('"')
    if folder and not Path(folder).is_dir():
        raise HTTPException(status_code=400, detail="That folder doesn't exist on this PC. Paste the full path, e.g. C:\\Users\\Jack\\OneDrive")
    with get_db(real=True) as conn:
        from .database import set_setting
        set_setting(conn, "backup_folder", folder)
    return backup.status()


@app.post("/api/backups/restore")
async def backup_restore(body: dict, request: Request):
    if remote_auth.is_remote(request.headers):
        raise HTTPException(status_code=403, detail="Restoring a backup can only be done on your PC.")
    try:
        return await run_in_threadpool(backup.restore, str(body.get("name") or ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/demo")
def demo_status():
    from . import demo
    return demo.status()


@app.post("/api/demo/{action}")
async def demo_switch(action: str):
    from fastapi import HTTPException
    from . import demo
    fn = {"on": demo.enable, "off": demo.disable, "reset": demo.reset}.get(action)
    if not fn:
        raise HTTPException(status_code=404, detail="Unknown demo action")
    try:
        return await run_in_threadpool(fn)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _read_version() -> dict:
    try:
        return json.loads(config.VERSION_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


@app.get("/api/version")
def get_version():
    """Which version is installed, and whether to show "just updated"."""
    v = _read_version()
    return {
        "version": (v.get("sha") or "")[:7] or None,
        "summary": v.get("summary"),
        "updated_at": v.get("updated_at"),
        "just_updated": bool(v.get("show_notice")),
    }


@app.post("/api/version/seen")
def version_seen():
    v = _read_version()
    if v.get("show_notice"):
        v["show_notice"] = False
        config.VERSION_FILE.write_text(json.dumps(v, indent=2), encoding="utf-8")
    return {"ok": True}


# Windows doesn't always know these file types; without them the phone
# app's manifest and the QR-code script wouldn't load.
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")

# Everything that isn't /api/... is the website itself (HTML, CSS, JS).
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
