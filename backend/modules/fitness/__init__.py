"""Workouts: sessions, sets, personal records, body weight, and Apple Health imports."""
from fastapi import APIRouter

from . import health  # noqa: F401 (registers its tables)
from .routes import health_router
from .routes import router as _workouts

router = APIRouter()
router.include_router(_workouts)
router.include_router(health_router)

on_startup = None
