"""API endpoints for Meals."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api/meals", tags=["meals"])


class MealIn(BaseModel):
    date: str
    slot: str = "dinner"
    title: str = ""
    recipe_id: int | None = None
    notes: str = ""


class RecipeIn(BaseModel):
    name: str
    ingredients: list[str] | str = []
    steps: str = ""
    url: str = ""
    minutes: int | None = None


class ShopIn(BaseModel):
    start: str
    items: list[str] | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def week(start: str | None = None):
    return _run(service.week, start)


@router.post("")
def create(body: MealIn):
    return _run(service.save_meal, body.model_dump())


@router.patch("/{meal_id}")
def update(meal_id: int, body: MealIn):
    return _run(service.save_meal, body.model_dump(), meal_id)


@router.delete("/{meal_id}")
def delete(meal_id: int):
    _run(service.delete_meal, meal_id)
    return {"ok": True}


@router.post("/recipes")
def create_recipe(body: RecipeIn):
    return _run(service.save_recipe, body.model_dump())


@router.patch("/recipes/{recipe_id}")
def update_recipe(recipe_id: int, body: RecipeIn):
    return _run(service.save_recipe, body.model_dump(), recipe_id)


@router.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int):
    _run(service.delete_recipe, recipe_id)
    return {"ok": True}


@router.post("/shopping")
def to_shopping(body: ShopIn):
    return _run(service.to_shopping, body.start, body.items)
