"""All the reading and writing of goals, tasks and notes lives here.

Both the click-to-edit screens (routes.py) and the command bar
(modules/assistant) use these same functions, so the rules are identical
no matter how a change is made.
"""
import sqlite3
from datetime import date, datetime

from ...areas import AREA_IDS
from ...database import register_schema, row_to_dict

GOAL_STATUSES = ["not_started", "in_progress", "done", "paused"]
PRIORITIES = ["low", "medium", "high"]

register_schema(
    """
    CREATE TABLE IF NOT EXISTS goals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT NOT NULL,
        area        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        target_date TEXT,
        status      TEXT NOT NULL DEFAULT 'not_started',
        progress    INTEGER NOT NULL DEFAULT 0,
        is_example  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goal_notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        text       TEXT NOT NULL,
        source     TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        area       TEXT NOT NULL,
        goal_id    INTEGER REFERENCES goals(id) ON DELETE SET NULL,
        due_date   TEXT,
        priority   TEXT NOT NULL DEFAULT 'medium',
        done       INTEGER NOT NULL DEFAULT 0,
        done_at    TEXT,
        is_example INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """
)

GOAL_FIELDS = ["title", "area", "description", "target_date", "status", "progress"]
TASK_FIELDS = ["title", "area", "goal_id", "due_date", "priority", "done"]


class ValidationError(ValueError):
    """Raised when data doesn't make sense (e.g. an unknown area)."""


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _clean_date(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        raise ValidationError(f"'{value}' is not a valid date (use YYYY-MM-DD)")


def _clean_goal_fields(conn, fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key not in GOAL_FIELDS:
            continue
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A goal needs a title")
        elif key == "area":
            if value not in AREA_IDS:
                raise ValidationError(f"Unknown area '{value}'")
        elif key == "description":
            value = (value or "").strip()
        elif key == "target_date":
            value = _clean_date(value)
        elif key == "status":
            if value not in GOAL_STATUSES:
                raise ValidationError(f"Unknown status '{value}'")
        elif key == "progress":
            value = max(0, min(100, int(value or 0)))
        out[key] = value
    return out


def _clean_task_fields(conn, fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key not in TASK_FIELDS:
            continue
        if key == "title":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A task needs a title")
        elif key == "area":
            if value not in AREA_IDS:
                raise ValidationError(f"Unknown area '{value}'")
        elif key == "goal_id":
            if value in (None, "", 0):
                value = None
            elif get_goal_row(conn, int(value)) is None:
                raise ValidationError(f"Goal #{value} doesn't exist")
            else:
                value = int(value)
        elif key == "due_date":
            value = _clean_date(value)
        elif key == "priority":
            if value not in PRIORITIES:
                raise ValidationError(f"Unknown priority '{value}'")
        elif key == "done":
            value = 1 if value else 0
        out[key] = value
    return out


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

def get_goal_row(conn: sqlite3.Connection, goal_id: int) -> dict | None:
    return row_to_dict(conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone())


def list_notes(conn, goal_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM goal_notes WHERE goal_id = ? ORDER BY created_at DESC, id DESC", (goal_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_goal(conn, goal_id: int) -> dict | None:
    goal = get_goal_row(conn, goal_id)
    if goal:
        goal["notes"] = list_notes(conn, goal_id)
        goal["task_count"], goal["tasks_done"] = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(done), 0) FROM tasks WHERE goal_id = ?", (goal_id,)
        ).fetchone()
    return goal


def list_goals(conn, area: str | None = None) -> list[dict]:
    sql = """
        SELECT g.*,
               (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id) AS task_count,
               (SELECT COALESCE(SUM(done), 0) FROM tasks t WHERE t.goal_id = g.id) AS tasks_done,
               (SELECT COUNT(*) FROM goal_notes n WHERE n.goal_id = g.id) AS note_count,
               (SELECT MAX(created_at) FROM goal_notes n WHERE n.goal_id = g.id) AS last_note_at
        FROM goals g
    """
    params: tuple = ()
    if area:
        sql += " WHERE g.area = ?"
        params = (area,)
    sql += """ ORDER BY CASE g.status WHEN 'in_progress' THEN 0 WHEN 'not_started' THEN 1
                                      WHEN 'paused' THEN 2 ELSE 3 END,
                        g.target_date IS NULL, g.target_date, g.id"""
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def create_goal(conn, fields: dict, is_example: bool = False) -> dict:
    data = {"description": "", "target_date": None, "status": "not_started", "progress": 0}
    data.update(_clean_goal_fields(conn, fields))
    if "title" not in data or "area" not in data:
        raise ValidationError("A goal needs a title and an area")
    if data["status"] == "done" and "progress" not in fields:
        data["progress"] = 100
    ts = now_iso()
    cur = conn.execute(
        """INSERT INTO goals (title, area, description, target_date, status, progress,
                              is_example, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data["title"], data["area"], data["description"], data["target_date"],
         data["status"], data["progress"], int(is_example), ts, ts),
    )
    return get_goal(conn, cur.lastrowid)


def update_goal(conn, goal_id: int, fields: dict) -> dict:
    if get_goal_row(conn, goal_id) is None:
        raise ValidationError(f"Goal #{goal_id} doesn't exist")
    data = _clean_goal_fields(conn, fields)
    # Small conveniences: finishing a goal fills the bar; progress starts it.
    if data.get("status") == "done" and "progress" not in data:
        data["progress"] = 100
    if data.get("progress", 0) > 0 and "status" not in data:
        current = get_goal_row(conn, goal_id)["status"]
        if current == "not_started":
            data["status"] = "in_progress"
    if data:
        data["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE goals SET {cols} WHERE id = ?", (*data.values(), goal_id))
    return get_goal(conn, goal_id)


def delete_goal(conn, goal_id: int) -> None:
    conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))


def add_note(conn, goal_id: int, text: str, source: str = "manual") -> dict:
    text = (text or "").strip()
    if not text:
        raise ValidationError("A note can't be empty")
    if get_goal_row(conn, goal_id) is None:
        raise ValidationError(f"Goal #{goal_id} doesn't exist")
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO goal_notes (goal_id, text, source, created_at) VALUES (?, ?, ?, ?)",
        (goal_id, text, source, ts),
    )
    conn.execute("UPDATE goals SET updated_at = ? WHERE id = ?", (ts, goal_id))
    return row_to_dict(conn.execute("SELECT * FROM goal_notes WHERE id = ?", (cur.lastrowid,)).fetchone())


def delete_note(conn, note_id: int) -> None:
    conn.execute("DELETE FROM goal_notes WHERE id = ?", (note_id,))


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

TASK_SELECT = """
    SELECT t.*, g.title AS goal_title
    FROM tasks t LEFT JOIN goals g ON g.id = t.goal_id
"""
TASK_ORDER = """ ORDER BY t.done, t.due_date IS NULL, t.due_date,
                 CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id"""


def get_task(conn, task_id: int) -> dict | None:
    return row_to_dict(conn.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone())


def list_tasks(conn, area: str | None = None, goal_id: int | None = None) -> list[dict]:
    where, params = [], []
    if area:
        where.append("t.area = ?")
        params.append(area)
    if goal_id:
        where.append("t.goal_id = ?")
        params.append(goal_id)
    sql = TASK_SELECT + (" WHERE " + " AND ".join(where) if where else "") + TASK_ORDER
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def create_task(conn, fields: dict, is_example: bool = False) -> dict:
    data = {"goal_id": None, "due_date": None, "priority": "medium", "done": 0}
    data.update(_clean_task_fields(conn, fields))
    # A task linked to a goal inherits that goal's area if none was given.
    if "area" not in data and data["goal_id"]:
        data["area"] = get_goal_row(conn, data["goal_id"])["area"]
    if "title" not in data or "area" not in data:
        raise ValidationError("A task needs a title and an area")
    ts = now_iso()
    cur = conn.execute(
        """INSERT INTO tasks (title, area, goal_id, due_date, priority, done, done_at,
                              is_example, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data["title"], data["area"], data["goal_id"], data["due_date"], data["priority"],
         data["done"], ts if data["done"] else None, int(is_example), ts, ts),
    )
    return get_task(conn, cur.lastrowid)


def update_task(conn, task_id: int, fields: dict) -> dict:
    current = get_task(conn, task_id)
    if current is None:
        raise ValidationError(f"Task #{task_id} doesn't exist")
    data = _clean_task_fields(conn, fields)
    if "done" in data and data["done"] != current["done"]:
        data["done_at"] = now_iso() if data["done"] else None
    if data:
        data["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE tasks SET {cols} WHERE id = ?", (*data.values(), task_id))
    return get_task(conn, task_id)


def delete_task(conn, task_id: int) -> None:
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
