"""Shopping list: things you need or want, with what they are, price and link."""
from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

CATEGORIES = ["need", "want"]

register_schema(
    """
    CREATE TABLE IF NOT EXISTS shopping_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category    TEXT NOT NULL DEFAULT 'want',
        price       REAL,
        url         TEXT NOT NULL DEFAULT '',
        bought      INTEGER NOT NULL DEFAULT 0,
        bought_at   TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    """
)

FIELDS = ["name", "description", "category", "price", "url", "bought"]


def _clean(fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key not in FIELDS:
            continue
        if key == "name":
            value = (value or "").strip()
            if not value:
                raise ValidationError("An item needs a name")
        elif key == "description":
            value = (value or "").strip()
        elif key == "category":
            value = (value or "").strip().lower().rstrip("s")  # "needs" -> "need"
            if value not in CATEGORIES:
                raise ValidationError("Category must be 'need' or 'want'")
        elif key == "price":
            if value in (None, ""):
                value = None
            else:
                try:
                    value = round(float(str(value).replace("$", "").replace(",", "")), 2)
                except ValueError:
                    raise ValidationError(f"'{value}' isn't a valid price")
                if value < 0:
                    raise ValidationError("A price can't be negative")
        elif key == "url":
            value = (value or "").strip()
            if value and not value.lower().startswith(("http://", "https://")):
                value = "https://" + value
        elif key == "bought":
            value = 1 if value else 0
        out[key] = value
    return out


def get_item(conn, item_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM shopping_items WHERE id = ?", (item_id,)).fetchone())


def list_items(conn) -> list[dict]:
    rows = conn.execute(
        """SELECT * FROM shopping_items
           ORDER BY bought, CASE category WHEN 'need' THEN 0 ELSE 1 END,
                    COALESCE(bought_at, ''), created_at DESC, id DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


def totals(conn) -> dict:
    """Sum of prices still to buy, per category (items without a price don't count)."""
    out = {"need": 0.0, "want": 0.0, "unpriced": 0}
    for r in conn.execute("SELECT category, price FROM shopping_items WHERE bought = 0").fetchall():
        if r["price"] is None:
            out["unpriced"] += 1
        else:
            out[r["category"]] += r["price"]
    out["need"], out["want"] = round(out["need"], 2), round(out["want"], 2)
    return out


def create_item(conn, fields: dict) -> dict:
    data = {"description": "", "category": "want", "price": None, "url": "", "bought": 0}
    data.update(_clean(fields))
    if "name" not in data:
        raise ValidationError("An item needs a name")
    ts = now_iso()
    cur = conn.execute(
        """INSERT INTO shopping_items (name, description, category, price, url, bought, bought_at,
                                       created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data["name"], data["description"], data["category"], data["price"], data["url"],
         data["bought"], ts if data["bought"] else None, ts, ts),
    )
    return get_item(conn, cur.lastrowid)


def update_item(conn, item_id: int, fields: dict) -> dict:
    current = get_item(conn, item_id)
    if current is None:
        raise ValidationError(f"Shopping item #{item_id} doesn't exist")
    data = _clean(fields)
    if "bought" in data and data["bought"] != current["bought"]:
        data["bought_at"] = now_iso() if data["bought"] else None
    if data:
        data["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE shopping_items SET {cols} WHERE id = ?", (*data.values(), item_id))
    return get_item(conn, item_id)


def delete_item(conn, item_id: int) -> None:
    conn.execute("DELETE FROM shopping_items WHERE id = ?", (item_id,))


def restore_item(conn, row: dict) -> None:
    """Put a deleted item back exactly as it was (used by Undo)."""
    cols = list(row)
    conn.execute(f"INSERT INTO shopping_items ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                 [row[c] for c in cols])
