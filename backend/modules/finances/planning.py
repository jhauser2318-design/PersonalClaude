"""Bills & subscriptions calendar and savings goals (Finances tabs).

Bills come from three places:
  - repeating charges found in your transactions (subscriptions, utilities),
  - your loans (payment and due day),
  - bills you add yourself (rent paid by check, yearly insurance...).
Mark a subscription "cancel" to keep a to-do list of ones to get rid of.
"""
import calendar as cal
from datetime import date, timedelta

from ...database import register_schema, row_to_dict
from ..goals.service import ValidationError, now_iso
from . import service

register_schema(
    """
    CREATE TABLE IF NOT EXISTS fin_bills (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        amount     REAL NOT NULL DEFAULT 0,
        due_day    INTEGER NOT NULL,              -- day of the month (1-31)
        frequency  TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, yearly
        start_month INTEGER,                      -- for quarterly/yearly: a month it's due (1-12)
        category   TEXT NOT NULL DEFAULT 'Utilities & Phone',
        autopay    INTEGER NOT NULL DEFAULT 0,
        subscription INTEGER NOT NULL DEFAULT 0,
        notes      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fin_sub_flags (
        merchant TEXT PRIMARY KEY,               -- a detected repeating charge, by name
        status   TEXT NOT NULL DEFAULT 'keep',   -- keep, cancel, cancelled, ignore
        note     TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS fin_savings_goals (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        target      REAL NOT NULL,
        saved       REAL NOT NULL DEFAULT 0,     -- used when no account is linked
        account_id  TEXT,                        -- a savings account whose balance counts
        target_date TEXT,
        goal_id     INTEGER,                     -- optional link to a goal in Goals
        created_at  TEXT NOT NULL
    );
    """
)

FREQUENCIES = ["monthly", "quarterly", "yearly"]
# Repeating charges in these categories count as subscriptions (rent, loans and utilities are bills).
SUB_CATEGORIES = {"Subscriptions", "Entertainment", "Health & Fitness", "Education", "Shopping", "Personal Care"}
SUB_STATUSES = ["keep", "cancel", "cancelled", "ignore"]


def _day_in(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, cal.monthrange(year, month)[1]))


# ---------------------------------------------------------------------------
# Manual bills
# ---------------------------------------------------------------------------

def list_bills(conn) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM fin_bills ORDER BY due_day, name")]


def save_bill(conn, fields: dict, bill_id: int | None = None) -> dict:
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValidationError("A bill needs a name")
    try:
        due = int(fields.get("due_day") or 0)
        amount = abs(float(fields.get("amount") or 0))
    except (TypeError, ValueError):
        raise ValidationError("Amount and due day must be numbers")
    if not 1 <= due <= 31:
        raise ValidationError("The due day is a day of the month, 1 to 31")
    freq = fields.get("frequency") if fields.get("frequency") in FREQUENCIES else "monthly"
    start = int(fields["start_month"]) if fields.get("start_month") else None
    if freq != "monthly" and not start:
        start = date.today().month
    cat = fields.get("category") if fields.get("category") in service.CATEGORIES else "Utilities & Phone"
    data = {"name": name, "amount": round(amount, 2), "due_day": due, "frequency": freq, "start_month": start,
            "category": cat, "autopay": 1 if fields.get("autopay") else 0,
            "subscription": 1 if fields.get("subscription") else 0, "notes": (fields.get("notes") or "").strip()}
    if bill_id:
        conn.execute(f"UPDATE fin_bills SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), bill_id))
    else:
        bill_id = conn.execute(f"INSERT INTO fin_bills ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                               (*data.values(), now_iso())).lastrowid
    return dict(conn.execute("SELECT * FROM fin_bills WHERE id = ?", (bill_id,)).fetchone())


def delete_bill(conn, bill_id: int) -> None:
    conn.execute("DELETE FROM fin_bills WHERE id = ?", (bill_id,))


def _bill_due_in_month(b: dict, year: int, month: int) -> bool:
    if b["frequency"] == "monthly":
        return True
    step = 3 if b["frequency"] == "quarterly" else 12
    return (month - (b["start_month"] or 1)) % step == 0


def set_sub_flag(conn, merchant: str, status: str, note: str = "") -> dict:
    if status not in SUB_STATUSES:
        raise ValidationError("Unknown status")
    conn.execute("INSERT OR REPLACE INTO fin_sub_flags (merchant, status, note) VALUES (?, ?, ?)",
                 (merchant, status, (note or "").strip()))
    return {"merchant": merchant, "status": status}


# ---------------------------------------------------------------------------
# The calendar
# ---------------------------------------------------------------------------

def bills_for_month(conn, month: str | None = None) -> dict:
    today = date.today()
    year, mon = (int(month[:4]), int(month[5:7])) if month else (today.year, today.month)
    flags = {r["merchant"]: dict(r) for r in conn.execute("SELECT * FROM fin_sub_flags")}
    items = []

    detected = service.recurring(conn)
    loans = service.list_loans(conn)
    loan_days = any(l.get("due_day") and l.get("payment") for l in loans)
    for r in detected:
        flag = flags.get(r["merchant"], {})
        if flag.get("status") in ("ignore", "cancelled"):
            continue
        if loan_days and r["category"] == "Debt Payments":
            continue  # already on the calendar from Loans
        day = date.fromisoformat(r["next_date"]).day
        items.append({"source": "detected", "name": r["merchant"], "amount": r["amount"], "category": r["category"],
                      "date": _day_in(year, mon, day).isoformat(), "autopay": True,
                      "status": flag.get("status", "keep"), "ref": r["merchant"]})
    for l in loans:
        if l.get("due_day") and l.get("payment"):
            items.append({"source": "loan", "name": l["name"], "amount": l["payment"], "category": "Debt Payments",
                          "date": _day_in(year, mon, int(l["due_day"])).isoformat(), "autopay": False,
                          "status": "keep", "ref": l["id"]})
    for b in list_bills(conn):
        if _bill_due_in_month(b, year, mon):
            items.append({"source": "manual", "name": b["name"], "amount": b["amount"], "category": b["category"],
                          "date": _day_in(year, mon, b["due_day"]).isoformat(), "autopay": bool(b["autopay"]),
                          "status": "keep", "ref": b["id"], "frequency": b["frequency"]})
    items.sort(key=lambda i: (i["date"], -i["amount"]))
    t = today.isoformat()
    first = date(year, mon, 1)
    return {
        "month": f"{year:04d}-{mon:02d}", "first_weekday": first.weekday(),
        "days": cal.monthrange(year, mon)[1], "items": items,
        "total": round(sum(i["amount"] for i in items), 2),
        "remaining": round(sum(i["amount"] for i in items if i["date"] >= t), 2),
        "subscriptions": subscriptions(conn, detected, flags),
        "bills": list_bills(conn), "categories": service.CATEGORIES, "frequencies": FREQUENCIES,
    }


def subscriptions(conn, detected=None, flags=None) -> dict:
    detected = detected if detected is not None else service.recurring(conn)
    flags = flags if flags is not None else {r["merchant"]: dict(r) for r in conn.execute("SELECT * FROM fin_sub_flags")}
    subs = []
    for r in detected:
        f = flags.get(r["merchant"], {})
        if r["category"] not in SUB_CATEGORIES and not f:
            continue
        subs.append({"name": r["merchant"], "amount": r["amount"], "yearly": round(r["amount"] * 12, 2),
                     "category": r["category"], "next_date": r["next_date"], "source": "detected",
                     "status": f.get("status", "keep"), "note": f.get("note", "")})
    for b in list_bills(conn):
        if b["subscription"]:
            per_year = {"monthly": 12, "quarterly": 4, "yearly": 1}[b["frequency"]]
            subs.append({"name": b["name"], "amount": b["amount"], "yearly": round(b["amount"] * per_year, 2),
                         "category": b["category"], "next_date": None, "source": "manual", "status": "keep",
                         "note": b["notes"], "id": b["id"]})
    active = [s for s in subs if s["status"] not in ("cancelled", "ignore")]
    return {"items": sorted(subs, key=lambda s: -s["yearly"]),
            "monthly": round(sum(s["yearly"] for s in active) / 12, 2),
            "yearly": round(sum(s["yearly"] for s in active), 2),
            "to_cancel": [s for s in subs if s["status"] == "cancel"],
            "cancel_savings": round(sum(s["yearly"] for s in subs if s["status"] == "cancel"), 2)}


def bills_due(conn, on: date) -> list[dict]:
    """Bills due on a given day (for the 'due in 2 days' reminder)."""
    month = bills_for_month(conn, on.strftime("%Y-%m"))
    return [i for i in month["items"] if i["date"] == on.isoformat()]


# ---------------------------------------------------------------------------
# Savings goals
# ---------------------------------------------------------------------------

def _goal(conn, row) -> dict:
    g = dict(row)
    g["linked"] = False
    if g["account_id"]:
        acc = conn.execute("SELECT * FROM fin_accounts WHERE id = ?", (g["account_id"],)).fetchone()
        if acc:
            g["saved"] = round(acc["balance"], 2)
            g["linked"] = True
            g["account_name"] = acc["nickname"] or acc["name"]
    g["left"] = round(max(0.0, g["target"] - g["saved"]), 2)
    g["pct"] = round(min(100, 100 * g["saved"] / g["target"])) if g["target"] else 0
    g["monthly_needed"] = None
    if g["target_date"] and g["left"] > 0:
        td = date.fromisoformat(g["target_date"])
        months = max(1, (td.year - date.today().year) * 12 + td.month - date.today().month)
        g["months_left"] = months
        g["monthly_needed"] = round(g["left"] / months, 2)
    return g


def list_savings(conn) -> list[dict]:
    return [_goal(conn, r) for r in conn.execute("SELECT * FROM fin_savings_goals ORDER BY target_date IS NULL, target_date, id")]


def save_savings(conn, fields: dict, goal_id: int | None = None) -> dict:
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValidationError("Name the goal, like “Emergency fund”")
    try:
        target = float(fields.get("target") or 0)
        saved = float(fields.get("saved") or 0)
    except (TypeError, ValueError):
        raise ValidationError("Amounts must be numbers")
    if target <= 0:
        raise ValidationError("The target has to be more than $0")
    td = fields.get("target_date") or None
    if td:
        try:
            td = date.fromisoformat(str(td)[:10]).isoformat()
        except ValueError:
            raise ValidationError("The target date must look like 2027-06-01")
    data = {"name": name, "target": round(target, 2), "saved": round(saved, 2),
            "account_id": fields.get("account_id") or None, "target_date": td,
            "goal_id": int(fields["goal_id"]) if fields.get("goal_id") else None}
    if goal_id:
        conn.execute(f"UPDATE fin_savings_goals SET {', '.join(f'{k} = ?' for k in data)} WHERE id = ?", (*data.values(), goal_id))
    else:
        goal_id = conn.execute(f"INSERT INTO fin_savings_goals ({', '.join(data)}, created_at) VALUES ({', '.join('?' for _ in data)}, ?)",
                               (*data.values(), now_iso())).lastrowid
    g = _goal(conn, conn.execute("SELECT * FROM fin_savings_goals WHERE id = ?", (goal_id,)).fetchone())
    if g["goal_id"]:  # keep the linked goal's progress in step
        conn.execute("UPDATE goals SET progress = ?, updated_at = ? WHERE id = ?", (g["pct"], now_iso(), g["goal_id"]))
    return g


def delete_savings(conn, goal_id: int) -> None:
    conn.execute("DELETE FROM fin_savings_goals WHERE id = ?", (goal_id,))


def sync_goal_progress(conn) -> None:
    """After a bank sync: move linked goals' progress to match their savings account."""
    for g in list_savings(conn):
        if g["goal_id"] and g["linked"]:
            conn.execute("UPDATE goals SET progress = ? WHERE id = ?", (g["pct"], g["goal_id"]))


def savings_overview(conn) -> dict:
    goals = list_savings(conn)
    accounts = [a for a in service.list_accounts(conn) if a["kind"] in ("savings", "checking", "other") and not a["hidden"]]
    return {"goals": goals, "accounts": [{"id": a["id"], "name": a["nickname"] or a["name"], "balance": a["balance"]} for a in accounts],
            "total_target": round(sum(g["target"] for g in goals), 2),
            "total_saved": round(sum(g["saved"] for g in goals), 2),
            "monthly_needed": round(sum(g["monthly_needed"] or 0 for g in goals), 2)}
