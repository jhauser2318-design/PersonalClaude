"""People: the people who matter to you, their birthdays, and when you last
talked. Set "reach out every N days" on someone and you get a nudge when it's
been too long.
"""
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso

register_schema(
    """
    CREATE TABLE IF NOT EXISTS people (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        relation     TEXT NOT NULL DEFAULT '',   -- family, friend, work...
        birthday     TEXT,                       -- YYYY-MM-DD (or 0000-MM-DD if the year is unknown)
        phone        TEXT NOT NULL DEFAULT '',
        email        TEXT NOT NULL DEFAULT '',
        notes        TEXT NOT NULL DEFAULT '',   -- kids' names, likes, gift ideas...
        cadence_days INTEGER,                    -- reach out every N days
        created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interactions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        date      TEXT NOT NULL,
        kind      TEXT NOT NULL DEFAULT 'talked',  -- call, text, met, talked
        note      TEXT NOT NULL DEFAULT ''
    );
    """
)

RELATIONS = ["family", "friend", "partner", "work", "mentor", "other"]
KINDS = ["call", "text", "met", "email", "talked"]


def _clean_birthday(value) -> str | None:
    if not value:
        return None
    v = str(value).strip()
    if len(v) == 5 and v[2] == "-":       # "MM-DD"
        v = "0000-" + v
    try:
        y, m, d = int(v[:4]), int(v[5:7]), int(v[8:10])
        date(2000 if y == 0 else y, m, d)
    except (ValueError, IndexError):
        raise ValidationError("A birthday must look like 1990-04-12 (or 04-12 if you don't know the year)")
    return f"{y:04d}-{m:02d}-{d:02d}"


def _clean(fields: dict) -> dict:
    out = {}
    for key, value in fields.items():
        if key == "name":
            value = (value or "").strip()
            if not value:
                raise ValidationError("A person needs a name")
        elif key in ("relation", "phone", "email", "notes"):
            value = (value or "").strip()
        elif key == "birthday":
            value = _clean_birthday(value)
        elif key == "cadence_days":
            value = int(value) if value else None
            if value is not None and value < 1:
                value = None
        else:
            continue
        out[key] = value
    return out


def next_birthday(bday: str | None, today: date | None = None) -> tuple[str, int, int | None] | None:
    """(date of the next birthday, days until it, age they turn or None)."""
    if not bday:
        return None
    today = today or date.today()
    y, m, d = int(bday[:4]), int(bday[5:7]), int(bday[8:10])
    for year in (today.year, today.year + 1):
        try:
            nxt = date(year, m, d)
        except ValueError:            # Feb 29
            nxt = date(year, 3, 1)
        if nxt >= today:
            return nxt.isoformat(), (nxt - today).days, (year - y if y else None)
    return None


def _person(conn, row) -> dict:
    p = dict(row)
    last = conn.execute("SELECT date, kind, note FROM interactions WHERE person_id = ? ORDER BY date DESC, id DESC LIMIT 1",
                        (p["id"],)).fetchone()
    p["last_contact"] = last["date"] if last else None
    p["last_kind"] = last["kind"] if last else None
    today = date.today()
    p["days_since"] = (today - date.fromisoformat(last["date"])).days if last else None
    p["due"] = bool(p["cadence_days"] and (p["days_since"] is None or p["days_since"] >= p["cadence_days"]))
    nb = next_birthday(p["birthday"], today)
    p["next_birthday"], p["birthday_in"], p["turning"] = nb if nb else (None, None, None)
    return p


def get_person(conn, person_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
    return _person(conn, row) if row else None


def list_people(conn) -> list[dict]:
    return [_person(conn, r) for r in conn.execute("SELECT * FROM people ORDER BY name COLLATE NOCASE")]


def find_person(conn, name: str) -> dict | None:
    name = (name or "").strip()
    if not name:
        return None
    row = conn.execute("SELECT * FROM people WHERE name = ? COLLATE NOCASE", (name,)).fetchone() or \
        conn.execute("SELECT * FROM people WHERE name LIKE ? ORDER BY length(name) LIMIT 1", (f"%{name}%",)).fetchone()
    return _person(conn, row) if row else None


def create_person(conn, fields: dict) -> dict:
    data = {"relation": "", "birthday": None, "phone": "", "email": "", "notes": "", "cadence_days": None}
    data.update(_clean(fields))
    if "name" not in data:
        raise ValidationError("A person needs a name")
    cols = list(data)
    cur = conn.execute(f"INSERT INTO people ({', '.join(cols)}, created_at) VALUES ({', '.join('?' for _ in cols)}, ?)",
                       (*data.values(), now_iso()))
    return get_person(conn, cur.lastrowid)


def update_person(conn, person_id: int, fields: dict) -> dict:
    if not conn.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone():
        raise ValidationError("That person doesn't exist")
    data = _clean(fields)
    if data:
        conn.execute(f"UPDATE people SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), person_id))
    return get_person(conn, person_id)


def delete_person(conn, person_id: int) -> None:
    conn.execute("DELETE FROM interactions WHERE person_id = ?", (person_id,))
    conn.execute("DELETE FROM people WHERE id = ?", (person_id,))


def list_interactions(conn, person_id: int) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM interactions WHERE person_id = ? ORDER BY date DESC, id DESC", (person_id,))]


def log_contact(conn, person_id: int, day: str | None = None, kind: str = "talked", note: str = "") -> dict:
    if not conn.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone():
        raise ValidationError("That person doesn't exist")
    try:
        day = date.fromisoformat(str(day)[:10]).isoformat() if day else date.today().isoformat()
    except ValueError:
        raise ValidationError("The date must look like 2026-10-02")
    kind = kind if kind in KINDS else "talked"
    cur = conn.execute("INSERT INTO interactions (person_id, date, kind, note) VALUES (?, ?, ?, ?)",
                       (person_id, day, kind, (note or "").strip()))
    return dict(conn.execute("SELECT * FROM interactions WHERE id = ?", (cur.lastrowid,)).fetchone())


def delete_interaction(conn, interaction_id: int) -> None:
    conn.execute("DELETE FROM interactions WHERE id = ?", (interaction_id,))


def summary(conn) -> dict:
    people = list_people(conn)
    return {
        "due": [p for p in people if p["due"]],
        "birthdays": sorted([p for p in people if p["birthday_in"] is not None and p["birthday_in"] <= 30],
                            key=lambda p: p["birthday_in"]),
    }


def context_lines(conn, limit: int = 60) -> list[str]:
    """For the AI bar: people (id | name | relation | birthday | last contact | cadence)."""
    out = []
    for p in list_people(conn)[:limit]:
        bday = p["birthday"][5:] if p["birthday"] else "-"
        last = f"{p['last_contact']} ({p['last_kind']})" if p["last_contact"] else "never"
        cad = f"every {p['cadence_days']}d{' (DUE)' if p['due'] else ''}" if p["cadence_days"] else "-"
        out.append(f"#{p['id']} | {p['name']} | {p['relation'] or '-'} | {bday} | {last} | {cad}")
    return out
