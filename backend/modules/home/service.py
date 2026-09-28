"""Home & admin: recurring upkeep (oil change, HVAC filter, gutters...) and
important dates and documents (passport, license, car registration,
insurance renewals, warranties). Each gets a heads-up notification.
"""
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS maintenance (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'home',   -- home, car, health, other
        every_n     INTEGER NOT NULL DEFAULT 3,
        every_unit  TEXT NOT NULL DEFAULT 'months', -- days, weeks, months, years
        last_done   TEXT,
        notes       TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenance_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES maintenance(id) ON DELETE CASCADE,
        date    TEXT NOT NULL,
        cost    REAL,
        note    TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS important_dates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'document', -- document, insurance, warranty, renewal, other
        date        TEXT NOT NULL,                   -- when it expires / is due
        remind_days INTEGER NOT NULL DEFAULT 30,     -- heads-up this many days before
        location    TEXT NOT NULL DEFAULT '',        -- where the document is kept
        notes       TEXT NOT NULL DEFAULT '',
        done        INTEGER NOT NULL DEFAULT 0,      -- renewed / handled
        created_at  TEXT NOT NULL
    );
    """
)

CATEGORIES = ["home", "car", "health", "other"]
UNITS = ["days", "weeks", "months", "years"]
KINDS = ["document", "insurance", "warranty", "renewal", "other"]


def _date(value, what="date") -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        raise ValidationError(f"The {what} must look like 2026-10-02")


def add_interval(d: date, n: int, unit: str) -> date:
    if unit == "days":
        return d + timedelta(days=n)
    if unit == "weeks":
        return d + timedelta(weeks=n)
    months = n * (12 if unit == "years" else 1)
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, 28)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

def _item(conn, row) -> dict:
    it = dict(row)
    today = date.today()
    if it["last_done"]:
        nxt = add_interval(date.fromisoformat(it["last_done"]), it["every_n"], it["every_unit"])
        it["next_due"] = nxt.isoformat()
        it["due_in"] = (nxt - today).days
    else:
        it["next_due"], it["due_in"] = None, None
    it["status"] = ("never" if it["due_in"] is None else "overdue" if it["due_in"] < 0
                    else "soon" if it["due_in"] <= 14 else "ok")
    it["every_text"] = f"every {it['every_n']} {it['every_unit'][:-1] if it['every_n'] == 1 else it['every_unit']}"
    it["log"] = [dict(r) for r in conn.execute(
        "SELECT * FROM maintenance_log WHERE item_id = ? ORDER BY date DESC, id DESC LIMIT 10", (it["id"],))]
    return it


def list_maintenance(conn) -> list[dict]:
    items = [_item(conn, r) for r in conn.execute("SELECT * FROM maintenance")]
    return sorted(items, key=lambda i: (i["due_in"] is not None, i["due_in"] if i["due_in"] is not None else 0, i["name"]))


def get_item(conn, item_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM maintenance WHERE id = ?", (item_id,)).fetchone()
    return _item(conn, row) if row else None


def save_item(conn, fields: dict, item_id: int | None = None) -> dict:
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValidationError("Give it a name, like “Change HVAC filter”")
    n = int(fields.get("every_n") or 0)
    if n < 1:
        raise ValidationError("How often: a number like 3 (months)")
    data = {"name": name, "category": fields.get("category") if fields.get("category") in CATEGORIES else "home",
            "every_n": n, "every_unit": fields.get("every_unit") if fields.get("every_unit") in UNITS else "months",
            "last_done": _date(fields.get("last_done"), "last-done date"), "notes": (fields.get("notes") or "").strip()}
    if item_id:
        conn.execute(f"UPDATE maintenance SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), item_id))
    else:
        item_id = conn.execute(f"INSERT INTO maintenance ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                               (*data.values(), now_iso())).lastrowid
    return get_item(conn, item_id)


def delete_item(conn, item_id: int) -> None:
    conn.execute("DELETE FROM maintenance_log WHERE item_id = ?", (item_id,))
    conn.execute("DELETE FROM maintenance WHERE id = ?", (item_id,))


def mark_done(conn, item_id: int, day: str | None = None, cost: float | None = None, note: str = "") -> dict:
    if not conn.execute("SELECT 1 FROM maintenance WHERE id = ?", (item_id,)).fetchone():
        raise ValidationError("That item doesn't exist")
    day = _date(day) or date.today().isoformat()
    conn.execute("INSERT INTO maintenance_log (item_id, date, cost, note) VALUES (?, ?, ?, ?)",
                 (item_id, day, cost, (note or "").strip()))
    latest = conn.execute("SELECT MAX(date) FROM maintenance_log WHERE item_id = ?", (item_id,)).fetchone()[0]
    conn.execute("UPDATE maintenance SET last_done = ? WHERE id = ?", (latest, item_id))
    return get_item(conn, item_id)


def delete_log(conn, log_id: int) -> None:
    row = conn.execute("SELECT item_id FROM maintenance_log WHERE id = ?", (log_id,)).fetchone()
    conn.execute("DELETE FROM maintenance_log WHERE id = ?", (log_id,))
    if row:
        latest = conn.execute("SELECT MAX(date) FROM maintenance_log WHERE item_id = ?", (row[0],)).fetchone()[0]
        if latest:
            conn.execute("UPDATE maintenance SET last_done = ? WHERE id = ?", (latest, row[0]))


# ---------------------------------------------------------------------------
# Important dates & documents
# ---------------------------------------------------------------------------

def _dated(row) -> dict:
    d = dict(row)
    d["days_left"] = (date.fromisoformat(d["date"]) - date.today()).days
    d["status"] = ("done" if d["done"] else "expired" if d["days_left"] < 0
                   else "soon" if d["days_left"] <= d["remind_days"] else "ok")
    return d


def list_dates(conn) -> list[dict]:
    return [_dated(r) for r in conn.execute("SELECT * FROM important_dates ORDER BY done, date")]


def get_date(conn, date_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM important_dates WHERE id = ?", (date_id,)).fetchone()
    return _dated(row) if row else None


def save_date(conn, fields: dict, date_id: int | None = None) -> dict:
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValidationError("Give it a name, like “Passport”")
    when = _date(fields.get("date"), "expiry date")
    if not when:
        raise ValidationError("When does it expire or come due?")
    data = {"name": name, "kind": fields.get("kind") if fields.get("kind") in KINDS else "document", "date": when,
            "remind_days": max(0, int(fields.get("remind_days") if fields.get("remind_days") is not None else 30)),
            "location": (fields.get("location") or "").strip(), "notes": (fields.get("notes") or "").strip(),
            "done": 1 if fields.get("done") else 0}
    if date_id:
        conn.execute(f"UPDATE important_dates SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), date_id))
    else:
        date_id = conn.execute(f"INSERT INTO important_dates ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                               (*data.values(), now_iso())).lastrowid
    return get_date(conn, date_id)


def delete_date(conn, date_id: int) -> None:
    conn.execute("DELETE FROM important_dates WHERE id = ?", (date_id,))


def overview(conn) -> dict:
    items = list_maintenance(conn)
    dates = list_dates(conn)
    return {"maintenance": items, "dates": dates, "categories": CATEGORIES, "units": UNITS, "kinds": KINDS,
            "attention": sum(1 for i in items if i["status"] in ("overdue", "soon"))
            + sum(1 for d in dates if d["status"] in ("expired", "soon"))}


def context_line(conn) -> str:
    items = [i for i in list_maintenance(conn) if i["status"] in ("overdue", "soon", "never")][:8]
    dates = [d for d in list_dates(conn) if d["status"] in ("expired", "soon")][:8]
    parts = [f"{i['name']} ({'due ' + i['next_due'] if i['next_due'] else 'never logged'})" for i in items]
    parts += [f"{d['name']} expires {d['date']}" for d in dates]
    return ("HOME & ADMIN coming up: " + "; ".join(parts)) if parts else ""
