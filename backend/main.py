"""Life Control Center: the web server.

Start it from the project folder with:
    python -m uvicorn backend.main:app --port 8000
then open http://localhost:8000 in your browser.
"""
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


# Everything that isn't /api/... is the website itself (HTML, CSS, JS).
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
