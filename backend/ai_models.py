"""Which Claude model each AI feature uses (Settings → AI models).

Each assistant can use a different model: a more capable one where mistakes
matter, a cheaper one for simple high-volume work. Choices are saved in the
database (app_settings) and take effect on the next request.
"""
from datetime import date, datetime, timedelta

from .database import get_db, get_setting, register_schema, set_setting

# Prices are per million tokens (input / output).
PRICES = {  # dollars per million tokens: input, output (Anthropic list prices)
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
CACHE_WRITE, CACHE_READ = 1.25, 0.10  # prompt-cache writes and reads, as a multiple of the input price

MODELS = [
    {"id": "claude-opus-5", "name": "Claude Opus 5", "price": "$5 / $25",
     "note": "Most capable. Best for tricky requests and long reports. Highest cost."},
    {"id": "claude-sonnet-5", "name": "Claude Sonnet 5", "price": "$2 / $10",
     "note": "Strong all-rounder at about 40% of Opus's cost."},
    {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "price": "$1 / $5",
     "note": "Fastest and cheapest. Fine for simple sorting; more likely to misread complex requests."},
]
MODEL_IDS = {m["id"] for m in MODELS}

ROLES = {
    "command": {"name": "AI bar", "default": "claude-sonnet-5",
                "what": "Adds and edits goals, tasks, routines, your schedule, events, shopping, follow-ups, people and fun things you did; answers questions."},
    "email": {"name": "Email assistant", "default": "claude-sonnet-5",
              "what": "Searches and reads your Gmail, answers questions, drafts replies."},
    "finance": {"name": "Finance assistant", "default": "claude-sonnet-5",
                "what": "Answers money questions and writes the Finances reports."},
    "categorize": {"name": "Transaction sorting", "default": "claude-haiku-4-5",
                   "what": "Sorts new bank and card transactions into categories after each sync."},
    "review": {"name": "Weekly review", "default": "claude-sonnet-5",
               "what": "Writes the summary of your week on the Weekly review page (only when you click it)."},
}


def model_for(role: str) -> str:
    with get_db(real=True) as conn:
        chosen = get_setting(conn, f"ai_model_{role}")
    return chosen if chosen in MODEL_IDS else ROLES[role]["default"]


def choices() -> dict:
    with get_db(real=True) as conn:
        current = {r: get_setting(conn, f"ai_model_{r}") for r in ROLES}
    return {
        "models": MODELS,
        "roles": [{"id": r, **info, "model": current[r] if current[r] in MODEL_IDS else info["default"]}
                  for r, info in ROLES.items()],
    }


def set_model(role: str, model: str) -> None:
    if role not in ROLES:
        raise ValueError(f"Unknown AI feature '{role}'")
    if model not in MODEL_IDS:
        raise ValueError(f"Unknown model '{model}'")
    with get_db(real=True) as conn:
        set_setting(conn, f"ai_model_{role}", model)


def request_options(role: str, effort: str = "medium", output_format: dict | None = None) -> dict:
    """The model-specific parts of a request, so every assistant can switch models safely:
    - effort is sent to models that support it (Haiku 4.5 rejects it),
    - Opus 5 also gets Anthropic's automatic fallback when a safety check declines a request."""
    model = model_for(role)
    output_config = {}
    if model != "claude-haiku-4-5":
        output_config["effort"] = effort
    if output_format:
        output_config["format"] = output_format
    options = {"model": model}
    if output_config:
        options["output_config"] = output_config
    if model == "claude-opus-5":
        options["betas"] = ["server-side-fallback-2026-07-01"]
        options["fallbacks"] = "default"
    return options


# ---------------------------------------------------------------------------
# Usage and cost (Settings → AI usage)
# ---------------------------------------------------------------------------
# Every AI reply says how many tokens it used; each request is saved with its
# estimated cost at list prices. Always in your real database: the money is
# real even in demo mode.

register_schema(
    """
    CREATE TABLE IF NOT EXISTS ai_usage (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ts            TEXT NOT NULL,
        role          TEXT NOT NULL,          -- command | email | finance | categorize
        model         TEXT NOT NULL,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write   INTEGER NOT NULL DEFAULT 0,
        cache_read    INTEGER NOT NULL DEFAULT 0,
        cost          REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ai_usage_ts ON ai_usage(ts);
    """
)


def cost_of(model: str, input_tokens: int, output_tokens: int, cache_write: int = 0, cache_read: int = 0) -> float:
    price_in, price_out = PRICES.get(model, PRICES["claude-opus-5"])  # unknown model: assume the dearest
    return (input_tokens * price_in + cache_write * price_in * CACHE_WRITE + cache_read * price_in * CACHE_READ
            + output_tokens * price_out) / 1_000_000


def record(role: str, response, requested_model: str) -> None:
    """Save one AI request's token use and cost. Never raises: counting must not break the app."""
    try:
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        n = lambda k: int(getattr(usage, k, 0) or 0)  # noqa: E731
        served = getattr(response, "model", None)
        model = served if served in PRICES else requested_model
        tokens = (n("input_tokens"), n("output_tokens"), n("cache_creation_input_tokens"), n("cache_read_input_tokens"))
        cost = cost_of(model, tokens[0], tokens[1], tokens[2], tokens[3])
        with get_db(real=True) as conn:
            conn.execute("INSERT INTO ai_usage (ts, role, model, input_tokens, output_tokens, cache_write, cache_read, cost) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                         (datetime.now().isoformat(timespec="seconds"), role, model, *tokens, round(cost, 6)))
    except Exception:  # noqa: BLE001
        pass


def _sum(conn, since: str, until: str | None = None) -> dict:
    sql = "SELECT COUNT(*) AS n, COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(input_tokens + cache_write + cache_read), 0) AS tin, " \
          "COALESCE(SUM(output_tokens), 0) AS tout FROM ai_usage WHERE ts >= ?"
    args = [since]
    if until:
        sql += " AND ts < ?"
        args.append(until)
    r = conn.execute(sql, args).fetchone()
    return {"requests": r["n"], "cost": round(r["cost"], 4), "input_tokens": r["tin"], "output_tokens": r["tout"]}


def usage_summary() -> dict:
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    last_month_start = (today.replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
    since30 = (today - timedelta(days=29)).isoformat()
    with get_db(real=True) as conn:
        roles = []
        for r in conn.execute(
                "SELECT role, COUNT(*) AS n, SUM(cost) AS cost, SUM(input_tokens + cache_write + cache_read) AS tin, "
                "SUM(output_tokens) AS tout FROM ai_usage WHERE ts >= ? GROUP BY role ORDER BY cost DESC", (month_start,)):
            roles.append({"role": r["role"], "name": ROLES.get(r["role"], {}).get("name", r["role"]), "requests": r["n"],
                          "cost": round(r["cost"], 4), "avg_cost": round(r["cost"] / r["n"], 4) if r["n"] else 0,
                          "input_tokens": r["tin"], "output_tokens": r["tout"]})
        models = [{"model": r["model"], "requests": r["n"], "cost": round(r["cost"], 4)} for r in conn.execute(
            "SELECT model, COUNT(*) AS n, SUM(cost) AS cost FROM ai_usage WHERE ts >= ? GROUP BY model ORDER BY cost DESC",
            (month_start,))]
        by_day = {r["d"]: (r["n"], r["cost"]) for r in conn.execute(
            "SELECT substr(ts, 1, 10) AS d, COUNT(*) AS n, SUM(cost) AS cost FROM ai_usage WHERE ts >= ? GROUP BY d",
            (since30,))}
        daily = [{"date": (today - timedelta(days=29 - i)).isoformat(),
                  "requests": by_day.get((today - timedelta(days=29 - i)).isoformat(), (0, 0))[0],
                  "cost": round(by_day.get((today - timedelta(days=29 - i)).isoformat(), (0, 0))[1] or 0, 4)}
                 for i in range(30)]
        month = _sum(conn, month_start)
        last30 = _sum(conn, since30)
        out = {
            "today": _sum(conn, today.isoformat()),
            "month": month,
            "last_month": _sum(conn, last_month_start, month_start),
            "last_30_days": last30,
            "roles": roles, "models": models, "daily": daily,
            "first_recorded": conn.execute("SELECT MIN(ts) AS t FROM ai_usage").fetchone()["t"],
        }
        # Average per day over the days since counting started (up to 30), for "how long will it last".
        first = out["first_recorded"]
        days = min(30, (today - date.fromisoformat(first[:10])).days + 1) if first else 0
        per_day = last30["cost"] / days if days else 0.0
        out["per_day"] = round(per_day, 4)
        out["month_projection"] = round(month["cost"] / today.day * 30.44, 2) if month["cost"] else 0.0

        credits = get_setting(conn, "ai_credits_amount")
        since = get_setting(conn, "ai_credits_since")
        if credits:
            used = _sum(conn, since or "0000")["cost"]
            left = float(credits) - used
            out["credits"] = {"amount": float(credits), "since": since, "used": round(used, 4), "left": round(left, 4),
                              "days_left": round(left / per_day) if per_day > 0 and left > 0 else None}
        else:
            out["credits"] = None
    return out


def set_credits(amount: float | None, since: str | None = None) -> None:
    """Remember credits you bought (to estimate what's left); amount None/0 clears it."""
    with get_db(real=True) as conn:
        if not amount or amount <= 0:
            conn.execute("DELETE FROM app_settings WHERE key IN ('ai_credits_amount', 'ai_credits_since')")
            return
        set_setting(conn, "ai_credits_amount", str(round(float(amount), 2)))
        set_setting(conn, "ai_credits_since", since or date.today().isoformat())
