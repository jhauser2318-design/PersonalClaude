"""API endpoints for Workouts."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/fitness", tags=["fitness"])


class SetIn(BaseModel):
    exercise: str
    sets: int = 1
    reps: int = 0
    weight: float = 0


class WorkoutIn(BaseModel):
    date: str | None = None
    kind: str = "strength"
    title: str = ""
    minutes: float | None = None
    distance: float | None = None
    notes: str = ""
    sets: list[SetIn] = []


class WeightIn(BaseModel):
    weight: float
    date: str | None = None


class HabitIn(BaseModel):
    habit_id: int | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def overview():
    return _run(service.overview)


@router.post("/workouts")
def create(body: WorkoutIn):
    return _run(service.save_workout, body.model_dump())


@router.patch("/workouts/{workout_id}")
def update(workout_id: int, body: WorkoutIn):
    return _run(service.save_workout, body.model_dump(), workout_id, False)


@router.delete("/workouts/{workout_id}")
def delete(workout_id: int):
    _run(service.delete_workout, workout_id)
    return {"ok": True}


@router.post("/weight")
def weight(body: WeightIn):
    return _run(service.log_weight, body.weight, body.date)


@router.delete("/weight/{day}")
def delete_weight(day: str):
    _run(service.delete_weight, day)
    return {"ok": True}


@router.put("/habit")
def habit(body: HabitIn):
    _run(service.set_gym_habit, body.habit_id)
    return _run(service.overview)


# ---------------------------------------------------------------------------
# Apple Health (the iPhone sends data here; see health.py)
# ---------------------------------------------------------------------------

@router.get("/health/setup")
async def health_setup():
    """The address and key to put in Health Auto Export / a Shortcut."""
    from fastapi.concurrency import run_in_threadpool
    from ...database import demo_on
    from ..remote import host
    from . import health
    if demo_on():
        return {"demo": True}
    with get_db(real=True) as conn:
        key = health.get_key(conn)
        info = health.summary(conn)
    try:
        ts = await run_in_threadpool(host.tailscale_status)
    except Exception:  # noqa: BLE001 (show the setup steps anyway)
        ts = {}
    base = (ts or {}).get("url")
    return {"key": key, "base": base, "url": f"{base}/api/health/import?key={key}" if base else None,
            "last_import": info["last_import"]}


@router.post("/health/new-key")
def health_new_key():
    from . import health
    with get_db(real=True) as conn:
        health.new_key(conn)
    return {"ok": True}


health_router = APIRouter(prefix="/api/health", tags=["health"])


@health_router.post("/import")
async def health_import(request: Request, key: str | None = None):
    """Called by the iPhone (Health Auto Export or a Shortcut). Needs the key instead of a signed-in device."""
    from . import health
    auth = request.headers.get("authorization", "")
    key = key or request.headers.get("x-api-key") or (auth[7:] if auth.lower().startswith("bearer ") else None)
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Send JSON")
    with get_db(real=True) as conn:  # always your real data, even while demo mode is on
        if not health.key_ok(conn, key):
            raise HTTPException(status_code=403, detail="Wrong or missing key")
        try:
            return health.import_payload(conn, payload)
        except ValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
