"""Finances: accounts, transactions, categories, budgets and the numbers behind the charts.

Sign convention (same as SimpleFIN): a negative amount is money leaving you
(a purchase, a bill), a positive amount is money coming in (pay, a refund).
Credit card balances are negative when you owe money.

Moving money between your own accounts (like paying a credit card from
checking) is a "Transfer": it isn't income or spending, so it's left out of
the totals. Otherwise every card payment would count your purchases twice.
"""
import calendar as cal
import json
import re
from datetime import date, datetime, timedelta

from ...database import get_setting, register_schema, set_setting
from ..goals.service import ValidationError, now_iso

CATEGORIES = [
    "Income", "Housing", "Utilities & Phone", "Groceries", "Dining & Coffee", "Transportation", "Gas",
    "Shopping", "Entertainment", "Subscriptions", "Health & Fitness", "Personal Care", "Travel",
    "Education", "Insurance", "Fees & Interest", "Gifts & Donations", "Other", "Transfer",
]
SPENDING_CATEGORIES = [c for c in CATEGORIES if c not in ("Income", "Transfer")]
UNCATEGORIZED = "Uncategorized"
KINDS = ["checking", "savings", "credit", "other"]

register_schema(
    """
    CREATE TABLE IF NOT EXISTS fin_accounts (
        id           TEXT PRIMARY KEY,           -- SimpleFIN's account id
        org          TEXT NOT NULL DEFAULT '',   -- the bank, e.g. "Capital One"
        name         TEXT NOT NULL DEFAULT '',
        nickname     TEXT NOT NULL DEFAULT '',
        kind         TEXT NOT NULL DEFAULT 'checking',
        currency     TEXT NOT NULL DEFAULT 'USD',
        balance      REAL NOT NULL DEFAULT 0,
        available    REAL,
        balance_date TEXT,
        hidden       INTEGER NOT NULL DEFAULT 0,
        updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fin_transactions (
        id            TEXT PRIMARY KEY,          -- account id + ":" + SimpleFIN's transaction id
        account_id    TEXT NOT NULL REFERENCES fin_accounts(id) ON DELETE CASCADE,
        posted        TEXT NOT NULL,             -- YYYY-MM-DD
        amount        REAL NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        payee         TEXT NOT NULL DEFAULT '',
        memo          TEXT NOT NULL DEFAULT '',
        pending       INTEGER NOT NULL DEFAULT 0,
        merchant_key  TEXT NOT NULL DEFAULT '',
        category      TEXT,                      -- your own choice for this one transaction
        transfer_with TEXT,                      -- the matching transaction in another account
        note          TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS fin_tx_posted ON fin_transactions(posted);
    CREATE INDEX IF NOT EXISTS fin_tx_merchant ON fin_transactions(merchant_key);
    CREATE TABLE IF NOT EXISTS fin_merchants (
        key        TEXT PRIMARY KEY,             -- "out:starbucks", "in:acme payroll"
        name       TEXT NOT NULL DEFAULT '',     -- tidy display name, e.g. "Starbucks"
        category   TEXT,
        source     TEXT NOT NULL DEFAULT 'ai',   -- ai | user
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fin_budgets (
        category TEXT PRIMARY KEY,
        amount   REAL NOT NULL                   -- per month
    );
    CREATE TABLE IF NOT EXISTS fin_rules (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        text       TEXT NOT NULL,                -- plain English, e.g. "Zelle to Mike is my rent: Housing"
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fin_balance_history (
        date       TEXT NOT NULL,                -- YYYY-MM-DD
        account_id TEXT NOT NULL,
        balance    REAL NOT NULL,
        PRIMARY KEY (date, account_id)
    );
    """
)

# The category that counts for a transaction: your own choice, then "Transfer"
# for matched pairs, then the merchant's category.
EFFECTIVE = ("CASE WHEN t.category IS NOT NULL THEN t.category "
             "WHEN t.transfer_with IS NOT NULL THEN 'Transfer' "
             f"ELSE COALESCE(m.category, '{UNCATEGORIZED}') END")
TX_SELECT = f"""
    SELECT t.*, {EFFECTIVE} AS eff_category,
           COALESCE(NULLIF(m.name, ''), NULLIF(t.payee, ''), t.description) AS merchant,
           COALESCE(NULLIF(a.nickname, ''), a.name) AS account_name, a.org AS account_org, a.kind AS account_kind
    FROM fin_transactions t
    LEFT JOIN fin_merchants m ON m.key = t.merchant_key
    JOIN fin_accounts a ON a.id = t.account_id
    WHERE a.hidden = 0"""

NOISE = {"pos", "purchase", "debit", "card", "recurring", "ach", "web", "ppd", "ccd", "id", "checkcard",
         "check", "visa", "mastercard", "withdrawal", "deposit", "online", "transfer", "payment", "pmt",
         "sq", "tst", "pp", "paypal", "inst", "xfer", "des", "indn", "co", "entry", "trn", "pos", "the"}


def merchant_key(description: str, payee: str, amount: float) -> str:
    """A rough merchant name used to group similar transactions.

    "SQ *BLUE BOTTLE #123 OAKLAND CA" and "SQ *BLUE BOTTLE #456" both become
    "out:blue bottle oakland". Money in and out are kept apart, so a refund
    from a store isn't mixed up with your paycheck.
    """
    text = (payee or description or "").lower()
    words = [w for w in re.split(r"[^a-z0-9&']+", text) if w and not re.search(r"\d", w)]
    kept = [w for w in words if w not in NOISE] or words
    return ("in:" if amount > 0 else "out:") + " ".join(kept[:3])


def _guess_kind(org: str, name: str, balance: float) -> str:
    text = f"{org} {name}".lower()
    if re.search(r"credit|card|visa|mastercard|amex|quicksilver|savor|venture|platinum|discover it", text):
        return "credit"
    if "saving" in text or "money market" in text:
        return "savings"
    if "checking" in text:
        return "checking"
    if "discover" in text and balance <= 0:
        return "credit"
    return "checking"


def _to_date(ts) -> str:
    try:
        ts = int(ts)
    except (TypeError, ValueError):
        ts = 0
    return (datetime.fromtimestamp(ts).date() if ts > 0 else date.today()).isoformat()


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Saving what SimpleFIN sent
# ---------------------------------------------------------------------------

def store_sync(conn, accounts: list[dict]) -> dict:
    """Save accounts and transactions. Returns {"accounts": n, "new": n}."""
    now = now_iso()
    new = 0
    for acc in accounts:
        acc_id = str(acc.get("id") or "")
        if not acc_id:
            continue
        org = acc.get("org") or {}
        org_name = (org.get("name") or org.get("domain") or "") if isinstance(org, dict) else str(org)
        balance = _num(acc.get("balance"))
        available = acc.get("available-balance")
        existing = conn.execute("SELECT id FROM fin_accounts WHERE id = ?", (acc_id,)).fetchone()
        if existing:
            conn.execute(
                "UPDATE fin_accounts SET org=?, name=?, currency=?, balance=?, available=?, balance_date=?, "
                "updated_at=? WHERE id=?",
                (org_name, acc.get("name") or "", acc.get("currency") or "USD", balance,
                 _num(available, None) if available not in (None, "") else None,
                 _to_date(acc.get("balance-date")), now, acc_id))
        else:
            conn.execute(
                "INSERT INTO fin_accounts (id, org, name, kind, currency, balance, available, balance_date, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (acc_id, org_name, acc.get("name") or "", _guess_kind(org_name, acc.get("name") or "", balance),
                 acc.get("currency") or "USD", balance,
                 _num(available, None) if available not in (None, "") else None,
                 _to_date(acc.get("balance-date")), now))

        # Remember each day's balance, for the Daily view's cash change.
        conn.execute("INSERT OR REPLACE INTO fin_balance_history (date, account_id, balance) VALUES (?, ?, ?)",
                     (_to_date(acc.get("balance-date")), acc_id, balance))

        # Pending transactions often get a new id once they post, so replace
        # this account's pending ones with the fresh list each time.
        conn.execute("DELETE FROM fin_transactions WHERE account_id = ? AND pending = 1", (acc_id,))
        for tx in acc.get("transactions") or []:
            tx_id = f"{acc_id}:{tx.get('id')}"
            amount = round(_num(tx.get("amount")), 2)
            description = str(tx.get("description") or "").strip()
            payee = str(tx.get("payee") or "").strip()
            posted_ts = tx.get("posted") or tx.get("transacted_at")
            pending = 1 if tx.get("pending") or not tx.get("posted") else 0
            key = merchant_key(description, payee, amount)
            if not conn.execute("SELECT 1 FROM fin_transactions WHERE id = ?", (tx_id,)).fetchone():
                new += 1
            conn.execute(
                "INSERT INTO fin_transactions (id, account_id, posted, amount, description, payee, memo, pending, "
                "merchant_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET posted=excluded.posted, amount=excluded.amount, "
                "description=excluded.description, payee=excluded.payee, memo=excluded.memo, "
                "pending=excluded.pending, merchant_key=excluded.merchant_key",
                (tx_id, acc_id, _to_date(posted_ts), amount, description, payee,
                 str(tx.get("memo") or "").strip(), pending, key, now))
            conn.execute("INSERT OR IGNORE INTO fin_merchants (key, name, updated_at) VALUES (?, '', ?)", (key, now))
    match_transfers(conn)
    return {"accounts": len(accounts), "new": new}


def match_transfers(conn) -> int:
    """Pair up money moving between your own accounts (e.g. a card payment
    leaving checking and arriving at the card within a few days)."""
    rows = conn.execute(
        "SELECT id, account_id, posted, amount FROM fin_transactions "
        "WHERE transfer_with IS NULL AND category IS NULL AND pending = 0 AND posted >= ? ORDER BY posted",
        ((date.today() - timedelta(days=120)).isoformat(),)).fetchall()
    outs = [r for r in rows if r["amount"] < 0]
    ins = [r for r in rows if r["amount"] > 0]
    used, pairs = set(), 0
    for o in outs:
        o_day = date.fromisoformat(o["posted"])
        best = None
        for i in ins:
            if i["id"] in used or i["account_id"] == o["account_id"] or abs(i["amount"] + o["amount"]) > 0.005:
                continue
            gap = abs((date.fromisoformat(i["posted"]) - o_day).days)
            if gap <= 4 and (best is None or gap < best[0]):
                best = (gap, i)
        if best:
            i = best[1]
            used.add(i["id"])
            conn.execute("UPDATE fin_transactions SET transfer_with = ? WHERE id = ?", (i["id"], o["id"]))
            conn.execute("UPDATE fin_transactions SET transfer_with = ? WHERE id = ?", (o["id"], i["id"]))
            pairs += 1
    return pairs


# ---------------------------------------------------------------------------
# Sync status (kept in app_settings)
# ---------------------------------------------------------------------------

def sync_status(conn) -> dict:
    return {
        "last_sync": get_setting(conn, "fin_last_sync"),
        "last_error": get_setting(conn, "fin_last_error") or None,
        "messages": json.loads(get_setting(conn, "fin_messages") or "[]"),
    }


def save_sync_status(conn, *, ok: bool, error: str | None = None, messages: list[str] | None = None):
    if ok:
        set_setting(conn, "fin_last_sync", now_iso())
    set_setting(conn, "fin_last_error", error or "")
    set_setting(conn, "fin_messages", json.dumps(messages or []))


def latest_posted(conn) -> str | None:
    row = conn.execute("SELECT MAX(posted) AS d FROM fin_transactions WHERE pending = 0").fetchone()
    return row["d"]


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def list_accounts(conn, include_hidden: bool = True) -> list[dict]:
    rows = conn.execute("SELECT * FROM fin_accounts ORDER BY kind = 'credit', org, name").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["display_name"] = d["nickname"] or d["name"]
        if include_hidden or not d["hidden"]:
            out.append(d)
    return out


def update_account(conn, account_id: str, fields: dict) -> dict:
    if not conn.execute("SELECT 1 FROM fin_accounts WHERE id = ?", (account_id,)).fetchone():
        raise ValidationError("That account doesn't exist.")
    if "kind" in fields and fields["kind"] not in KINDS:
        raise ValidationError("Unknown account type.")
    for key in ("nickname", "kind", "hidden"):
        if key in fields and fields[key] is not None:
            value = int(bool(fields[key])) if key == "hidden" else str(fields[key]).strip()
            conn.execute(f"UPDATE fin_accounts SET {key} = ? WHERE id = ?", (value, account_id))
    return dict(conn.execute("SELECT * FROM fin_accounts WHERE id = ?", (account_id,)).fetchone())


def balances(conn) -> dict:
    cash = debt = 0.0
    for a in list_accounts(conn, include_hidden=False):
        if a["kind"] == "credit":
            debt += -a["balance"]  # what you owe (negative balance = owed)
        else:
            cash += a["balance"]
    return {"cash": round(cash, 2), "debt": round(debt, 2), "net": round(cash - debt, 2)}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def list_transactions(conn, *, start: str | None = None, end: str | None = None, category: str | None = None,
                      account_id: str | None = None, search: str | None = None, min_amount: float | None = None,
                      max_amount: float | None = None, limit: int = 500) -> list[dict]:
    sql, args = TX_SELECT, []
    if start:
        sql += " AND t.posted >= ?"; args.append(start)
    if end:
        sql += " AND t.posted <= ?"; args.append(end)
    if category:
        sql += f" AND {EFFECTIVE} = ?"; args.append(category)
    if account_id:
        sql += " AND t.account_id = ?"; args.append(account_id)
    if search:
        like = f"%{search.lower()}%"
        sql += (" AND (LOWER(t.description) LIKE ? OR LOWER(t.payee) LIKE ? OR LOWER(COALESCE(m.name, '')) LIKE ? "
                "OR LOWER(t.note) LIKE ?)")
        args += [like] * 4
    if min_amount is not None:
        sql += " AND ABS(t.amount) >= ?"; args.append(min_amount)
    if max_amount is not None:
        sql += " AND ABS(t.amount) <= ?"; args.append(max_amount)
    sql += " ORDER BY t.posted DESC, t.amount LIMIT ?"
    args.append(int(limit))
    return [_tx(r) for r in conn.execute(sql, args).fetchall()]


def _tx(row) -> dict:
    d = dict(row)
    d["category_source"] = "you" if d["category"] else ("transfer" if d["transfer_with"] else "auto")
    d["category"] = d.pop("eff_category")
    d["pending"] = bool(d["pending"])
    return d


def get_transaction(conn, tx_id: str) -> dict:
    row = conn.execute(TX_SELECT + " AND t.id = ?", (tx_id,)).fetchone()
    if not row:
        raise ValidationError("That transaction doesn't exist.")
    return _tx(row)


def _check_category(category: str) -> str:
    if category not in CATEGORIES:
        raise ValidationError(f"Unknown category “{category}”.")
    return category


def set_transaction_category(conn, tx_id: str, category: str | None, apply_to_similar: bool = False,
                             note: str | None = None) -> dict:
    """Change one transaction's category, or every transaction from the same merchant."""
    tx = get_transaction(conn, tx_id)
    if note is not None:
        conn.execute("UPDATE fin_transactions SET note = ? WHERE id = ?", (note.strip(), tx_id))
    if category is None:
        return get_transaction(conn, tx_id)
    _check_category(category)
    if apply_to_similar:
        set_merchant_category(conn, tx["merchant_key"], category)
        # Your own one-off choices on this merchant give way to the new rule.
        conn.execute("UPDATE fin_transactions SET category = NULL WHERE merchant_key = ? AND transfer_with IS NULL",
                     (tx["merchant_key"],))
        if tx["transfer_with"] and category != "Transfer":
            _unpair(conn, tx_id)
    else:
        if tx["transfer_with"] and category != "Transfer":
            _unpair(conn, tx_id)
        conn.execute("UPDATE fin_transactions SET category = ? WHERE id = ?", (category, tx_id))
    return get_transaction(conn, tx_id)


def _unpair(conn, tx_id: str):
    other = conn.execute("SELECT transfer_with FROM fin_transactions WHERE id = ?", (tx_id,)).fetchone()
    conn.execute("UPDATE fin_transactions SET transfer_with = NULL WHERE id = ?", (tx_id,))
    if other and other["transfer_with"]:
        # Keep the other side a transfer by choice, so it doesn't get re-paired.
        conn.execute("UPDATE fin_transactions SET transfer_with = NULL, category = COALESCE(category, 'Transfer') "
                     "WHERE id = ?", (other["transfer_with"],))


def set_merchant_category(conn, key: str, category: str, name: str | None = None):
    _check_category(category)
    conn.execute(
        "INSERT INTO fin_merchants (key, name, category, source, updated_at) VALUES (?, COALESCE(?, ''), ?, 'user', ?) "
        "ON CONFLICT(key) DO UPDATE SET category = excluded.category, source = 'user', "
        "name = COALESCE(?, fin_merchants.name), updated_at = excluded.updated_at",
        (key, name, category, now_iso(), name))


def uncategorized_merchants(conn, limit: int = 400, everything: bool = False, offset: int = 0) -> list[dict]:
    """Merchants the AI hasn't sorted yet (or with everything=True, every merchant
    the AI sorted, to re-sort them after your rules change), with an example each.
    Merchants you categorized yourself are never included."""
    where = "m.source != 'user'" if everything else "m.category IS NULL"
    rows = conn.execute(
        f"""SELECT m.key, MIN(t.description) AS example, MIN(t.payee) AS payee, ROUND(AVG(t.amount), 2) AS amount,
                   COUNT(*) AS n, MIN(a.kind) AS account_kind
            FROM fin_merchants m JOIN fin_transactions t ON t.merchant_key = m.key
            JOIN fin_accounts a ON a.id = t.account_id
            WHERE {where} GROUP BY m.key ORDER BY n DESC, m.key LIMIT ? OFFSET ?""", (limit, offset)).fetchall()
    return [dict(r) for r in rows]


def save_ai_categories(conn, results: list[dict]):
    for r in results:
        if r.get("category") in CATEGORIES:
            conn.execute(
                "UPDATE fin_merchants SET category = ?, name = ?, source = 'ai', updated_at = ? "
                "WHERE key = ? AND source != 'user'",
                (r["category"], (r.get("name") or "")[:60], now_iso(), r["key"]))


# ---------------------------------------------------------------------------
# Your rules (plain English, followed by the AI)
# ---------------------------------------------------------------------------

def list_rules(conn) -> list[dict]:
    return [dict(r) for r in conn.execute("SELECT * FROM fin_rules ORDER BY id")]


def rules_text(conn) -> str:
    """The enabled rules as a numbered list for the AI ("" if none)."""
    rules = [r["text"] for r in list_rules(conn) if r["enabled"]]
    return "\n".join(f"{i + 1}. {t}" for i, t in enumerate(rules))


def _clean_rule(text: str) -> str:
    text = " ".join((text or "").split())
    if len(text) < 3:
        raise ValidationError("Write the rule in a few words, e.g. “Zelle payments to Mike are my rent (Housing)”.")
    if len(text) > 500:
        raise ValidationError("Keep a rule under 500 characters. Split long ones into several rules.")
    return text


def add_rule(conn, text: str) -> dict:
    ts = now_iso()
    cur = conn.execute("INSERT INTO fin_rules (text, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)",
                       (_clean_rule(text), ts, ts))
    return dict(conn.execute("SELECT * FROM fin_rules WHERE id = ?", (cur.lastrowid,)).fetchone())


def update_rule(conn, rule_id: int, text: str | None = None, enabled: bool | None = None) -> dict:
    if not conn.execute("SELECT 1 FROM fin_rules WHERE id = ?", (rule_id,)).fetchone():
        raise ValidationError("That rule doesn't exist.")
    if text is not None:
        conn.execute("UPDATE fin_rules SET text = ?, updated_at = ? WHERE id = ?", (_clean_rule(text), now_iso(), rule_id))
    if enabled is not None:
        conn.execute("UPDATE fin_rules SET enabled = ?, updated_at = ? WHERE id = ?", (int(enabled), now_iso(), rule_id))
    return dict(conn.execute("SELECT * FROM fin_rules WHERE id = ?", (rule_id,)).fetchone())


def delete_rule(conn, rule_id: int) -> None:
    conn.execute("DELETE FROM fin_rules WHERE id = ?", (rule_id,))


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

def list_budgets(conn) -> dict:
    return {r["category"]: r["amount"] for r in conn.execute("SELECT * FROM fin_budgets")}


def set_budget(conn, category: str, amount: float | None) -> dict:
    if category not in SPENDING_CATEGORIES:
        raise ValidationError(f"“{category}” can't have a budget. Pick a spending category.")
    if amount is None or amount <= 0:
        conn.execute("DELETE FROM fin_budgets WHERE category = ?", (category,))
    else:
        conn.execute("INSERT INTO fin_budgets (category, amount) VALUES (?, ?) "
                     "ON CONFLICT(category) DO UPDATE SET amount = excluded.amount", (category, round(amount, 2)))
    return list_budgets(conn)


def suggest_budgets(conn) -> dict:
    """A starting budget per category: the average of your last full months, rounded up to $10."""
    first = conn.execute("SELECT MIN(posted) AS d FROM fin_transactions").fetchone()["d"]
    if not first:
        return {}
    # Full months only, and only months your history fully covers (the first
    # sync usually starts mid-month).
    covered = (date.fromisoformat(first) - timedelta(days=4)).strftime("%Y-%m-%d")
    months = last_months(4)[:-1]
    have = [m for m in months if f"{m}-01" >= covered] or [m for m in months if _has_data(conn, m)] or last_months(1)
    totals: dict[str, float] = {}
    for m in have:
        for row in spending_by_category(conn, *month_bounds(m)):
            totals[row["category"]] = totals.get(row["category"], 0) + row["spent"]
    return {c: max(10, -(-v / len(have) // 10) * 10) for c, v in totals.items()
            if c in SPENDING_CATEGORIES and v > 0}


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def month_bounds(month: str) -> tuple[str, str]:
    y, m = map(int, month.split("-"))
    return f"{month}-01", f"{month}-{cal.monthrange(y, m)[1]:02d}"


def last_months(n: int, until: date | None = None) -> list[str]:
    """The last n months as "YYYY-MM", oldest first, ending with the current month."""
    d = until or date.today()
    out = []
    y, m = d.year, d.month
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def _has_data(conn, month: str) -> bool:
    start, end = month_bounds(month)
    return bool(conn.execute("SELECT 1 FROM fin_transactions WHERE posted BETWEEN ? AND ? LIMIT 1",
                             (start, end)).fetchone())


def totals(conn, start: str, end: str) -> dict:
    """Income, spending and net for a date range. Transfers are left out;
    refunds reduce spending."""
    row = conn.execute(
        f"""SELECT
              COALESCE(SUM(CASE WHEN c = 'Income' THEN amount END), 0) AS income,
              COALESCE(-SUM(CASE WHEN c NOT IN ('Income', 'Transfer') THEN amount END), 0) AS spending,
              COUNT(*) AS n
            FROM (SELECT t.amount, {EFFECTIVE} AS c FROM fin_transactions t
                  LEFT JOIN fin_merchants m ON m.key = t.merchant_key
                  JOIN fin_accounts a ON a.id = t.account_id
                  WHERE a.hidden = 0 AND t.posted BETWEEN ? AND ?)""", (start, end)).fetchone()
    income, spending = round(row["income"], 2), round(row["spending"], 2)
    return {"income": income, "spending": spending, "net": round(income - spending, 2), "count": row["n"]}


def spending_by_category(conn, start: str, end: str) -> list[dict]:
    rows = conn.execute(
        f"""SELECT {EFFECTIVE} AS category, -SUM(t.amount) AS spent, COUNT(*) AS n
            FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key
            JOIN fin_accounts a ON a.id = t.account_id
            WHERE a.hidden = 0 AND t.posted BETWEEN ? AND ? GROUP BY 1""", (start, end)).fetchall()
    out = [{"category": r["category"], "spent": round(r["spent"], 2), "count": r["n"]}
           for r in rows if r["category"] not in ("Income", "Transfer")]
    return sorted(out, key=lambda r: -r["spent"])


def spending_by_merchant(conn, start: str, end: str, limit: int = 15) -> list[dict]:
    rows = conn.execute(
        f"""SELECT COALESCE(NULLIF(m.name, ''), NULLIF(t.payee, ''), t.description) AS merchant,
                   {EFFECTIVE} AS category, -SUM(t.amount) AS spent, COUNT(*) AS n
            FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key
            JOIN fin_accounts a ON a.id = t.account_id
            WHERE a.hidden = 0 AND t.posted BETWEEN ? AND ? AND {EFFECTIVE} NOT IN ('Income', 'Transfer')
            GROUP BY t.merchant_key ORDER BY spent DESC LIMIT ?""", (start, end, limit)).fetchall()
    return [{"merchant": r["merchant"], "category": r["category"], "spent": round(r["spent"], 2),
             "count": r["n"]} for r in rows]


def cashflow(conn, months: int = 4) -> list[dict]:
    out = []
    for m in last_months(months):
        t = totals(conn, *month_bounds(m))
        out.append({"month": m, **t})
    return out


def month_summary(conn, month: str | None = None) -> dict:
    """Everything the Overview needs for one month: totals, category spending vs budget, pace."""
    today = date.today()
    month = month or today.strftime("%Y-%m")
    start, end = month_bounds(month)
    y, mo = map(int, month.split("-"))
    days = cal.monthrange(y, mo)[1]
    current = month == today.strftime("%Y-%m")
    elapsed = today.day / days if current else 1.0
    budgets = list_budgets(conn)
    spent = {r["category"]: r for r in spending_by_category(conn, start, end)}
    rows = []
    for category in list(dict.fromkeys(list(spent) + list(budgets))):
        s = spent.get(category, {"spent": 0.0, "count": 0})
        budget = budgets.get(category)
        row = {"category": category, "spent": s["spent"], "count": s["count"], "budget": budget}
        if budget:
            row["pct"] = round(100 * s["spent"] / budget)
            row["status"] = ("over" if s["spent"] > budget else
                             "ahead" if current and s["spent"] > budget * elapsed * 1.1 else "ok")
        rows.append(row)
    rows.sort(key=lambda r: (-(r["spent"]), r["category"]))
    budget_total = round(sum(budgets.values()), 2)
    budgeted_spent = round(sum(spent[c]["spent"] for c in budgets if c in spent), 2)
    return {
        "month": month, "start": start, "end": end, "is_current": current,
        "day": today.day if current else days, "days": days,
        **totals(conn, start, end),
        "categories": rows, "budget_total": budget_total, "budgeted_spent": budgeted_spent,
        "top_merchants": spending_by_merchant(conn, start, end, 8),
    }


def recurring(conn) -> list[dict]:
    """Charges that repeat about monthly (subscriptions, bills), from the last ~4 months."""
    since = (date.today() - timedelta(days=125)).isoformat()
    rows = conn.execute(
        f"""SELECT t.merchant_key, t.posted, t.amount, {EFFECTIVE} AS category,
                   COALESCE(NULLIF(m.name, ''), NULLIF(t.payee, ''), t.description) AS merchant
            FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key
            JOIN fin_accounts a ON a.id = t.account_id
            WHERE a.hidden = 0 AND t.amount < 0 AND t.posted >= ? AND t.pending = 0
            ORDER BY t.posted""", (since,)).fetchall()
    groups: dict[str, list] = {}
    for r in rows:
        if r["category"] in ("Transfer", "Income"):
            continue
        groups.setdefault(r["merchant_key"], []).append(r)
    out = []
    for key, txs in groups.items():
        if len(txs) < 2:
            continue
        # Keep the charges that look like the same bill (within 15% of the latest amount).
        latest = txs[-1]
        similar = [t for t in txs if abs(t["amount"] - latest["amount"]) <= abs(latest["amount"]) * 0.15 + 1]
        months = {t["posted"][:7] for t in similar}
        if len(similar) < 2 or len(months) < 2 or len(similar) > len(months) + 1:
            continue
        days = [(date.fromisoformat(b["posted"]) - date.fromisoformat(a["posted"])).days
                for a, b in zip(similar, similar[1:])]
        avg_gap = sum(days) / len(days)
        if not 25 <= avg_gap <= 37:
            continue
        next_date = date.fromisoformat(latest["posted"]) + timedelta(days=round(avg_gap))
        out.append({
            "merchant": latest["merchant"], "category": latest["category"], "amount": round(-latest["amount"], 2),
            "last_date": latest["posted"], "next_date": next_date.isoformat(), "times": len(similar),
        })
    return sorted(out, key=lambda r: -r["amount"])


def daily_series(conn, end: str, days: int = 30) -> list[dict]:
    """Income, spending and net for each of the `days` days ending on `end`."""
    last = date.fromisoformat(end)
    first = last - timedelta(days=days - 1)
    rows = conn.execute(
        f"""SELECT t.posted AS d,
                   COALESCE(SUM(CASE WHEN {EFFECTIVE} = 'Income' THEN t.amount END), 0) AS income,
                   COALESCE(-SUM(CASE WHEN {EFFECTIVE} NOT IN ('Income', 'Transfer') THEN t.amount END), 0) AS spending,
                   COUNT(*) AS n
            FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key
            JOIN fin_accounts a ON a.id = t.account_id
            WHERE a.hidden = 0 AND t.posted BETWEEN ? AND ? GROUP BY t.posted""",
        (first.isoformat(), last.isoformat())).fetchall()
    by_day = {r["d"]: r for r in rows}
    out = []
    for i in range(days):
        d = (first + timedelta(days=i)).isoformat()
        r = by_day.get(d)
        income, spending = (round(r["income"], 2), round(r["spending"], 2)) if r else (0.0, 0.0)
        out.append({"date": d, "income": income, "spending": spending, "net": round(income - spending, 2),
                    "count": r["n"] if r else 0})
    return out


def cash_change(conn, day: str) -> dict | None:
    """How your cash (checking + savings) moved on a day, from the saved daily balances."""
    def cash_on(d):
        rows = conn.execute(
            """SELECT h.account_id, h.balance FROM fin_balance_history h JOIN fin_accounts a ON a.id = h.account_id
               WHERE a.hidden = 0 AND a.kind != 'credit' AND h.date = (
                 SELECT MAX(h2.date) FROM fin_balance_history h2 WHERE h2.account_id = h.account_id AND h2.date <= ?)""",
            (d,)).fetchall()
        return round(sum(r["balance"] for r in rows), 2) if rows else None
    end = cash_on(day)
    start = cash_on((date.fromisoformat(day) - timedelta(days=1)).isoformat())
    if end is None or start is None:
        return None
    return {"start": start, "end": end, "change": round(end - start, 2)}


def day_summary(conn, day: str | None = None) -> dict:
    """Everything for the Daily view: the day's money in and out, what it went on,
    how it compares with a normal day, and the month so far."""
    day = day or (date.today() - timedelta(days=1)).isoformat()
    try:
        d = date.fromisoformat(day)
    except ValueError:
        raise ValidationError("Pick a date like 2026-09-27.")
    series = daily_series(conn, day, 30)
    before = [r for r in series if r["date"] < day]
    avg_spend = round(sum(r["spending"] for r in before) / len(before), 2) if before else 0.0
    month_start = d.replace(day=1).isoformat()
    txs = list_transactions(conn, start=day, end=day, limit=500)
    return {
        "date": day,
        **totals(conn, day, day),
        "avg_daily_spending": avg_spend,
        "categories": spending_by_category(conn, day, day),
        "income_items": [t for t in txs if t["category"] == "Income"],
        "transactions": txs,
        "month_to_date": {**totals(conn, month_start, day), "days": d.day},
        "cash": cash_change(conn, day),
        "series": series,
        "first_date": conn.execute("SELECT MIN(posted) AS d FROM fin_transactions").fetchone()["d"],
    }


def overview(conn) -> dict:
    return {
        "balances": balances(conn),
        "accounts": list_accounts(conn),
        "month": month_summary(conn),
        "cashflow": cashflow(conn, 4),
        "recurring": recurring(conn),
        "uncategorized": conn.execute(
            f"SELECT COUNT(*) AS n FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key "
            f"WHERE {EFFECTIVE} = '{UNCATEGORIZED}'").fetchone()["n"],
        "first_date": conn.execute("SELECT MIN(posted) AS d FROM fin_transactions").fetchone()["d"],
    }
