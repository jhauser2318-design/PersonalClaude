"""Tiny helper around SQLite (a database that is just one file on disk).

Each module registers its own table definitions with `register_schema`, and
`init_db()` creates any tables that don't exist yet. That way a future
Calendar or Finances module can add its tables without touching this file.
"""
import sqlite3
from contextlib import contextmanager

from .config import DATABASE_PATH

_schemas: list[str] = []

# Goes up by one every time anything is saved. Open windows (PC and phone)
# compare it every few seconds and redraw when it changes, so every device
# shows the same thing.
_changes = {"n": 0}


def data_version() -> int:
    return _changes["n"]


def register_schema(sql: str) -> None:
    _schemas.append(sql)


# Demo mode (Settings → Demo mode) swaps in a separate database full of sample
# data, so you can show the app without showing your own information. Your
# real database is never touched while it's on. A few things always use the
# real database: phone sign-in, notification settings and AI model choices.
DEMO_PATH = DATABASE_PATH.parent / "demo.db"
DEMO_FLAG = DATABASE_PATH.parent / "demo.json"


def demo_on() -> bool:
    return DEMO_FLAG.exists()


def active_path():
    return DEMO_PATH if demo_on() else DATABASE_PATH


def connect(real: bool = False, path=None) -> sqlite3.Connection:
    path = path or (DATABASE_PATH if real else active_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db(real: bool = False, path=None):
    """Open a connection, commit if everything worked, roll back if not.
    real=True always uses your real database, even in demo mode."""
    conn = connect(real, path)
    try:
        yield conn
        changed = conn.total_changes
        conn.commit()
        if changed:
            _changes["n"] += 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


_columns: list[tuple[str, str, str]] = []


def add_column(table: str, column: str, ddl: str) -> None:
    """A column added to an existing table in a later version (added on startup if missing)."""
    _columns.append((table, column, ddl))


def init_db(path=None) -> None:
    """Create any missing tables (in the real database unless `path` is given)."""
    with get_db(real=path is None, path=path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
            """
        )
        for sql in _schemas:
            conn.executescript(sql)
        for table, column, ddl in _columns:
            have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if have and column not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
