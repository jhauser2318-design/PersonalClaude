"""Meal planning: a week of meals, a small recipe box, and one click to put
the week's ingredients on the shopping list (as needs, skipping anything
that's already on it).
"""
import json
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS recipes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        ingredients TEXT NOT NULL DEFAULT '[]',   -- ["2 chicken breasts", "rice", ...]
        steps       TEXT NOT NULL DEFAULT '',
        url         TEXT NOT NULL DEFAULT '',
        minutes     INTEGER,
        created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meals (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        date      TEXT NOT NULL,
        slot      TEXT NOT NULL DEFAULT 'dinner',  -- breakfast, lunch, dinner, snack
        title     TEXT NOT NULL,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        notes     TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS meals_date ON meals(date);
    """
)

SLOTS = ["breakfast", "lunch", "dinner", "snack"]


def _day(value) -> str:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except (TypeError, ValueError):
        raise ValidationError("The date must look like 2026-10-02")


def week_start(day: str | None = None) -> date:
    d = date.fromisoformat(day[:10]) if day else date.today()
    return d - timedelta(days=d.weekday())


def _ingredients(value) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    return [" ".join(str(i).split()) for i in value or [] if str(i).strip()]


def _recipe(row) -> dict:
    r = dict(row)
    r["ingredients"] = json.loads(r["ingredients"] or "[]")
    return r


def list_recipes(conn) -> list[dict]:
    return [_recipe(r) for r in conn.execute("SELECT * FROM recipes ORDER BY name COLLATE NOCASE")]


def get_recipe(conn, recipe_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    return _recipe(row) if row else None


def save_recipe(conn, fields: dict, recipe_id: int | None = None) -> dict:
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValidationError("A recipe needs a name")
    data = {"name": name, "ingredients": json.dumps(_ingredients(fields.get("ingredients"))),
            "steps": (fields.get("steps") or "").strip(), "url": (fields.get("url") or "").strip(),
            "minutes": int(fields["minutes"]) if fields.get("minutes") else None}
    if recipe_id:
        conn.execute(f"UPDATE recipes SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), recipe_id))
    else:
        recipe_id = conn.execute(f"INSERT INTO recipes ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                                 (*data.values(), now_iso())).lastrowid
    return get_recipe(conn, recipe_id)


def delete_recipe(conn, recipe_id: int) -> None:
    conn.execute("UPDATE meals SET recipe_id = NULL WHERE recipe_id = ?", (recipe_id,))
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))


def get_meal(conn, meal_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone())


def save_meal(conn, fields: dict, meal_id: int | None = None) -> dict:
    recipe_id = int(fields["recipe_id"]) if fields.get("recipe_id") else None
    title = (fields.get("title") or "").strip()
    if recipe_id:
        recipe = get_recipe(conn, recipe_id)
        if not recipe:
            raise ValidationError("That recipe doesn't exist")
        title = title or recipe["name"]
    if not title:
        raise ValidationError("A meal needs a name")
    data = {"date": _day(fields.get("date")), "slot": fields.get("slot") if fields.get("slot") in SLOTS else "dinner",
            "title": title, "recipe_id": recipe_id, "notes": (fields.get("notes") or "").strip()}
    if meal_id:
        conn.execute(f"UPDATE meals SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), meal_id))
    else:
        meal_id = conn.execute(f"INSERT INTO meals ({', '.join(data)}) VALUES ({', '.join('?' for _ in data)})",
                               tuple(data.values())).lastrowid
    return get_meal(conn, meal_id)


def delete_meal(conn, meal_id: int) -> None:
    conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))


def week(conn, day: str | None = None) -> dict:
    start = week_start(day)
    end = start + timedelta(days=6)
    meals = [dict(r) for r in conn.execute("SELECT * FROM meals WHERE date BETWEEN ? AND ? ORDER BY date, id",
                                           (start.isoformat(), end.isoformat()))]
    return {"start": start.isoformat(), "end": end.isoformat(), "meals": meals,
            "days": [(start + timedelta(days=i)).isoformat() for i in range(7)],
            "recipes": list_recipes(conn), "slots": SLOTS,
            "ingredients": week_ingredients(conn, start.isoformat())}


def week_ingredients(conn, start: str) -> list[str]:
    end = (date.fromisoformat(start) + timedelta(days=6)).isoformat()
    out: list[str] = []
    for r in conn.execute("""SELECT r.ingredients FROM meals m JOIN recipes r ON r.id = m.recipe_id
                             WHERE m.date BETWEEN ? AND ?""", (start, end)):
        for i in json.loads(r["ingredients"] or "[]"):
            if i.lower() not in (x.lower() for x in out):
                out.append(i)
    return out


def to_shopping(conn, start: str, items: list[str] | None = None) -> dict:
    """Add ingredients to shopping needs, skipping ones already on the list (not yet bought)."""
    from ..shopping import service as shopping
    items = _ingredients(items) if items is not None else week_ingredients(conn, week_start(start).isoformat())
    have = {r[0].lower() for r in conn.execute("SELECT name FROM shopping_items WHERE bought = 0")}
    added, skipped = [], []
    for name in items:
        if name.lower() in have:
            skipped.append(name)
            continue
        shopping.create_item(conn, {"name": name, "category": "need", "description": "For this week's meals"})
        have.add(name.lower())
        added.append(name)
    return {"added": added, "skipped": skipped}


def context_line(conn) -> str:
    today = date.today().isoformat()
    rows = conn.execute("SELECT date, slot, title FROM meals WHERE date BETWEEN ? AND ? ORDER BY date",
                        (today, (date.today() + timedelta(days=6)).isoformat())).fetchall()
    recipes = [r[0] for r in conn.execute("SELECT name FROM recipes ORDER BY name LIMIT 30")]
    if not rows and not recipes:
        return ""
    return ("MEALS planned: " + ("; ".join(f"{r['date']} {r['slot']}: {r['title']}" for r in rows) or "none")
            + (". Recipes: " + ", ".join(recipes) if recipes else ""))
