"""Which Claude model each AI feature uses (Settings → AI models).

Each assistant can use a different model: a more capable one where mistakes
matter, a cheaper one for simple high-volume work. Choices are saved in the
database (app_settings) and take effect on the next request.
"""
from .database import get_db, get_setting, set_setting

# Prices are per million tokens (input / output).
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
                "what": "Adds and edits goals, tasks, routines, events, shopping items and follow-ups; answers questions."},
    "email": {"name": "Email assistant", "default": "claude-sonnet-5",
              "what": "Searches and reads your Gmail, answers questions, drafts replies."},
    "finance": {"name": "Finance assistant", "default": "claude-sonnet-5",
                "what": "Answers money questions and writes the Finances reports."},
    "categorize": {"name": "Transaction sorting", "default": "claude-haiku-4-5",
                   "what": "Sorts new bank and card transactions into categories after each sync."},
}


def model_for(role: str) -> str:
    with get_db() as conn:
        chosen = get_setting(conn, f"ai_model_{role}")
    return chosen if chosen in MODEL_IDS else ROLES[role]["default"]


def choices() -> dict:
    with get_db() as conn:
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
    with get_db() as conn:
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
