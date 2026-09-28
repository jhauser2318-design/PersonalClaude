"""Life Control Center: the web server.

Start it from the project folder with:
    python -m uvicorn backend.main:app --port 8000
then open http://localhost:8000 in your browser.
"""
import json
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config
from .areas import AREAS
from .database import get_db, init_db
from .modules import MODULES


@asynccontextmanager
async def lifespan(app: FastAPI):
    RUNNING["version"] = _read_version().get("sha")
    RUNNING["last_ping"] = time.time()
    init_db()
    with get_db() as conn:
        for module in MODULES:
            if module.on_startup:
                module.on_startup(conn)
    print("\n  Life Control Center is running!  Open  http://localhost:8000  in your browser.")
    if not config.api_key_configured():
        print("  (No API key found in .env yet - the command bar won't work until you add one.)")
    print("  Press Ctrl+C in this window to stop it.\n")
    yield


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
    return response

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
    return {"ok": True}


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


# Everything that isn't /api/... is the website itself (HTML, CSS, JS).
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
