"""Fun & leisure: a log of the fun things you did (how fun, who with, where),
plus a list of ideas for things you want to do. Checking off an idea logs it.
"""
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS fun_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        title      TEXT NOT NULL,
        category   TEXT NOT NULL DEFAULT 'other',
        rating     INTEGER,                 -- how fun, 1-5
        with_whom  TEXT NOT NULL DEFAULT '',
        place      TEXT NOT NULL DEFAULT '',
        cost       REAL,
        notes      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fun_ideas (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        category   TEXT NOT NULL DEFAULT 'other',
        notes      TEXT NOT NULL DEFAULT '',
        done_at    TEXT,
        created_at TEXT NOT NULL
    );
    """
)

CATEGORIES = {
    "outdoors": ("Outdoors", "🌲"), "friends": ("Friends & social", "🍻"), "food": ("Food & drink", "🍜"),
    "travel": ("Travel & trips", "✈️"), "games": ("Games", "🎮"), "shows": ("Music, movies & shows", "🎬"),
    "sports": ("Sports", "⚽"), "creative": ("Creative & hobbies", "🎨"), "relax": ("Relaxing", "🛋"),
    "other": ("Other", "✨"),
}


def _clean(fields: dict, partial: bool = False) -> dict:
    out = {}
    for key, value in fields.items():
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("What did you do?")
        elif key == "date":
            try:
                value = date.fromisoformat(str(value)[:10]).isoformat() if value else date.today().isoformat()
            except ValueError:
                raise ValidationError("The date must look like 2026-10-02")
        elif key == "category":
            value = (value or "other").lower()
            value = next((k for k, (name, _) in CATEGORIES.items() if value in (k, name.lower())), "other")
        elif key == "rating":
            value = None if value in (None, "", 0) else max(1, min(5, int(round(float(value)))))
        elif key == "cost":
            value = None if value in (None, "") else max(0.0, round(float(value), 2))
        elif key in ("with_whom", "place", "notes"):
            value = (value or "").strip()
        else:
            continue
        out[key] = value
    return out


def get_entry(conn, entry_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM fun_log WHERE id = ?", (entry_id,)).fetchone())


def add_entry(conn, fields: dict) -> dict:
    data = {"date": date.today().isoformat(), "category": "other", "rating": None, "with_whom": "", "place": "",
            "cost": None, "notes": ""}
    data.update(_clean(fields))
    if not data.get("title"):
        raise ValidationError("What did you do?")
    cur = conn.execute(f"INSERT INTO fun_log ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                       (*data.values(), now_iso()))
    return get_entry(conn, cur.lastrowid)


def update_entry(conn, entry_id: int, fields: dict) -> dict:
    if not get_entry(conn, entry_id):
        raise ValidationError("That entry doesn't exist")
    data = _clean(fields)
    if data:
        conn.execute(f"UPDATE fun_log SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), entry_id))
    return get_entry(conn, entry_id)


def delete_entry(conn, entry_id: int) -> None:
    conn.execute("DELETE FROM fun_log WHERE id = ?", (entry_id,))


def add_idea(conn, title: str, category: str = "other", notes: str = "") -> dict:
    data = _clean({"title": title, "category": category, "notes": notes})
    cur = conn.execute("INSERT INTO fun_ideas (title, category, notes, created_at) VALUES (?, ?, ?, ?)",
                       (data["title"], data["category"], data["notes"], now_iso()))
    return dict(conn.execute("SELECT * FROM fun_ideas WHERE id = ?", (cur.lastrowid,)).fetchone())


def update_idea(conn, idea_id: int, fields: dict) -> dict:
    data = _clean({k: v for k, v in fields.items() if k in ("title", "category", "notes")})
    if data:
        conn.execute(f"UPDATE fun_ideas SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), idea_id))
    return dict(conn.execute("SELECT * FROM fun_ideas WHERE id = ?", (idea_id,)).fetchone())


def delete_idea(conn, idea_id: int) -> None:
    conn.execute("DELETE FROM fun_ideas WHERE id = ?", (idea_id,))


def do_idea(conn, idea_id: int, fields: dict) -> dict:
    """Check off an idea: it moves to the log."""
    idea = row_to_dict(conn.execute("SELECT * FROM fun_ideas WHERE id = ?", (idea_id,)).fetchone())
    if not idea:
        raise ValidationError("That idea doesn't exist")
    entry = add_entry(conn, {"title": idea["title"], "category": idea["category"], **fields})
    conn.execute("UPDATE fun_ideas SET done_at = ? WHERE id = ?", (now_iso(), idea_id))
    return entry


def overview(conn) -> dict:
    today = date.today()
    log = [dict(r) for r in conn.execute("SELECT * FROM fun_log ORDER BY date DESC, id DESC LIMIT 300")]
    month_start = today.replace(day=1).isoformat()
    this_month = [e for e in log if e["date"] >= month_start]
    year = [e for e in log if e["date"] >= (today - timedelta(days=365)).isoformat()]
    rated = [e["rating"] for e in this_month if e["rating"]]
    counts: dict[str, int] = {}
    for e in year:
        counts[e["category"]] = counts.get(e["category"], 0) + 1
    months = []
    for i in range(11, -1, -1):
        y, m = divmod(today.year * 12 + today.month - 1 - i, 12)
        key = f"{y:04d}-{m + 1:02d}"
        months.append({"month": key, "count": sum(1 for e in log if e["date"].startswith(key))})
    return {
        "log": log,
        "ideas": [dict(r) for r in conn.execute("SELECT * FROM fun_ideas WHERE done_at IS NULL ORDER BY id DESC")],
        "this_month": len(this_month),
        "avg_rating": round(sum(rated) / len(rated), 1) if rated else None,
        "spent_this_month": round(sum(e["cost"] or 0 for e in this_month), 2),
        "days_since": (today - date.fromisoformat(log[0]["date"])).days if log else None,
        "favorites": sorted([e for e in year if e["rating"]], key=lambda e: (e["rating"], e["date"]), reverse=True)[:5],
        "by_category": sorted(({"category": k, "count": v} for k, v in counts.items()), key=lambda x: -x["count"]),
        "months": months,
        "categories": [{"id": k, "name": n, "icon": i} for k, (n, i) in CATEGORIES.items()],
    }


def context_line(conn) -> str:
    rows = conn.execute("SELECT date, title, rating FROM fun_log ORDER BY date DESC, id DESC LIMIT 6").fetchall()
    ideas = [r[0] for r in conn.execute("SELECT title FROM fun_ideas WHERE done_at IS NULL ORDER BY id DESC LIMIT 10")]
    if not rows and not ideas:
        return ""
    parts = ["FUN (recent): " + ("; ".join(f"{r['date']} {r['title']}" + (f" ({r['rating']}/5)" if r["rating"] else "")
                                          for r in rows) or "none")]
    if ideas:
        parts.append("Fun ideas to do: " + "; ".join(ideas))
    return ". ".join(parts)
