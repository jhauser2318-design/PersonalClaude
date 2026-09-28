"""Life Control Center: the web server.

Start it from the project folder with:
    python -m uvicorn backend.main:app --port 8000
then open http://localhost:8000 in your browser.
"""
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config
from .areas import AREAS
from .database import get_db, init_db
from .modules import MODULES


@asynccontextmanager
async def lifespan(app: FastAPI):
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

for module in MODULES:
    app.include_router(module.router)


@app.get("/api/areas")
def list_areas():
    return AREAS


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
