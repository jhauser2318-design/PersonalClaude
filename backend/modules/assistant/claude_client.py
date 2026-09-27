"""Sends a command-bar sentence to Claude and gets back structured JSON.

How it works:
  1. We describe the app and the allowed actions in SYSTEM_PROMPT.
  2. We send today's date, a compact list of your goals/tasks (with IDs),
     and your sentence.
  3. We ask the API for "structured output": Claude's reply is guaranteed
     to be JSON matching RESPONSE_SCHEMA, so the app can apply it safely.
"""
import json
from datetime import date

import anthropic

from ... import config
from ...areas import AREAS

AREA_ENUM = [a["id"] for a in AREAS]
ACTION_TYPES = ["create_goal", "update_goal", "add_note", "create_task", "update_task", "complete_task"]


def _nullable(schema: dict) -> dict:
    return {"anyOf": [schema, {"type": "null"}]}


ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ACTION_TYPES},
        "goal_id": _nullable({"type": "integer"}),
        "task_id": _nullable({"type": "integer"}),
        "link_to_new_goal": {"type": "boolean"},
        "title": _nullable({"type": "string"}),
        "area": _nullable({"type": "string", "enum": AREA_ENUM}),
        "description": _nullable({"type": "string"}),
        "target_date": _nullable({"type": "string"}),
        "status": _nullable({"type": "string", "enum": ["not_started", "in_progress", "done", "paused"]}),
        "progress": _nullable({"type": "integer"}),
        "note": _nullable({"type": "string"}),
        "due_date": _nullable({"type": "string"}),
        "priority": _nullable({"type": "string", "enum": ["low", "medium", "high"]}),
        "done": _nullable({"type": "boolean"}),
    },
    "required": ["type", "goal_id", "task_id", "link_to_new_goal", "title", "area", "description",
                 "target_date", "status", "progress", "note", "due_date", "priority", "done"],
    "additionalProperties": False,
}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["actions", "answer", "clarify"]},
        "reply": {"type": "string"},
        "actions": {"type": "array", "items": ACTION_SCHEMA},
    },
    "required": ["intent", "reply", "actions"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are the command bar of "Life Control Center", a personal dashboard where the user tracks goals and tasks across four life areas: work, health, social, education.

The user types short natural sentences. Work out what they mean and respond with JSON in one of three forms:

1. intent "actions": the user wants to change their data. Put one or more actions in "actions", and put a short, friendly one-sentence confirmation in "reply" (e.g. "Added a 5K goal for March 31 in Health.").
2. intent "answer": the user asked a question (e.g. "What should I focus on this week?"). Leave "actions" empty and answer in "reply" using their actual goals and tasks. Keep it concise: a short intro and at most 5 bullet points starting with "- ". Mention overdue and high-priority items first.
3. intent "clarify": you are not reasonably sure what they want, or which goal/task they mean (for example two goals match equally well, or none match). Leave "actions" empty and ask ONE short clarifying question in "reply". Never guess when a wrong guess would change the wrong item.

Actions (every field must be present; use null for fields that don't apply to that action, and false for link_to_new_goal unless stated):
- create_goal: title, area (required); description, target_date, status, progress (optional).
- update_goal: goal_id (required) plus only the fields that change (title, area, description, target_date, status, progress). Leave all others null.
- add_note: goal_id (required), note (required). A timestamped progress update on a goal. Use this whenever the user reports something they did toward a goal ("Went to the gym today").
- create_task: title, area (required unless it's linked to a goal); goal_id to link it to an existing goal; due_date, priority (optional, default medium). If the task belongs to a goal created earlier in this SAME response, set goal_id null and link_to_new_goal true.
- update_task: task_id (required) plus only the fields that change (title, area, goal_id, due_date, priority, done).
- complete_task: task_id (required). Marks a task as done.

Rules:
- Use the IDs from the data provided. Match loosely by meaning ("my fitness goal" can match "Run a 5K" in Health; "the Spanish lesson task" matches a task mentioning Spanish lesson). If exactly one item is a clear match, use it.
- When the user reports progress on a goal, add a note describing what they did (in their words, tidied up). Only change "progress" if they give a number or the update clearly moves a measurable goal forward; otherwise leave it null. If the goal's status is not_started, also set status to in_progress with an update_goal action.
- Dates must be YYYY-MM-DD. Resolve relative dates from today's date given below: "Friday" means the next upcoming Friday (today if today is Friday), "next week" means next Monday, "by March" means the last day of the next upcoming March, "end of month" the last day of the current month.
- Pick the area from context: gym/running/diet/sleep/doctor = health; job/colleagues/boss/budget/clients = work; friends/family/parties = social; courses/languages/reading/studying = education. If the user names an area, use it. If the area truly can't be inferred, ask.
- Titles should be short and start with a capital letter, without the date in them ("Email Sarah about the budget").
- Never delete anything. If the user asks to delete, reply that deleting is done by clicking the item, with intent "answer".
- The reply is shown in a small banner: plain text, no markdown headings, no bold."""


class AssistantError(Exception):
    """A problem talking to Claude, with a message safe to show the user."""


def build_context(goals: list[dict], tasks: list[dict]) -> str:
    today = date.today()
    lines = [f"Today is {today.strftime('%A')}, {today.isoformat()}.", "", "GOALS (id | area | title | status | progress | target date | last update):"]
    if not goals:
        lines.append("(none yet)")
    for g in goals:
        desc = f" — {g['description'][:120]}" if g.get("description") else ""
        lines.append(
            f"#{g['id']} | {g['area']} | {g['title']} | {g['status']} | {g['progress']}% | "
            f"{g['target_date'] or 'no date'} | {(g.get('last_note_at') or 'never')[:10]}{desc}"
        )
    lines += ["", "TASKS (id | area | title | goal id | due | priority | done):"]
    if not tasks:
        lines.append("(none yet)")
    for t in tasks:
        lines.append(
            f"#{t['id']} | {t['area']} | {t['title']} | {t['goal_id'] or '-'} | "
            f"{t['due_date'] or 'no date'} | {t['priority']} | {'done' if t['done'] else 'open'}"
        )
    return "\n".join(lines)


def ask_claude(text: str, context: str, history: list[dict]) -> dict:
    """Return Claude's parsed JSON: {"intent", "reply", "actions"}."""
    if not config.api_key_configured():
        raise AssistantError(
            "No Anthropic API key found. Add it to the .env file (see README), then restart the app."
        )

    # Earlier turns (so an answer to a clarifying question has context),
    # then the current data and the new sentence.
    messages = []
    for turn in history[-6:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": str(turn["content"])[:2000]})
    if messages and messages[0]["role"] != "user":
        messages = messages[1:]
    if messages and messages[-1]["role"] == "user":
        messages = messages[:-1]
    messages.append({"role": "user", "content": f"<data>\n{context}\n</data>\n\nUser: {text}"})

    request = dict(
        model=config.CLAUDE_MODEL,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        messages=messages,
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA},
        },
    )
    # On Claude Opus 5, if a safety check declines a request, "fallbacks"
    # lets Anthropic automatically retry it on another model.
    if config.CLAUDE_MODEL == "claude-opus-5":
        request["betas"] = ["server-side-fallback-2026-07-01"]
        request["fallbacks"] = "default"

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        response = client.beta.messages.create(**request)
    except anthropic.AuthenticationError:
        raise AssistantError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env file.")
    except anthropic.PermissionDeniedError:
        raise AssistantError("Your API key doesn't have permission to use this model.")
    except anthropic.NotFoundError:
        raise AssistantError(f"Model '{config.CLAUDE_MODEL}' wasn't found. Check CLAUDE_MODEL in .env.")
    except anthropic.RateLimitError:
        raise AssistantError("Too many requests right now (or your credit ran out). Try again in a minute.")
    except anthropic.BadRequestError as e:
        raise AssistantError(f"Claude couldn't process that request: {e.message}")
    except anthropic.APIStatusError as e:
        raise AssistantError(f"Anthropic's servers returned an error ({e.status_code}). Try again shortly.")
    except anthropic.APIConnectionError:
        raise AssistantError("Couldn't reach Anthropic. Check your internet connection.")

    if response.stop_reason == "refusal":
        raise AssistantError("Claude declined to handle that request.")
    if response.stop_reason == "max_tokens":
        raise AssistantError("Claude's answer was too long. Try a shorter or more specific request.")

    texts = [b.text for b in response.content if b.type == "text"]
    if not texts:
        raise AssistantError("Claude returned an empty response. Please try again.")
    try:
        data = json.loads(texts[-1])
    except json.JSONDecodeError:
        raise AssistantError("Claude's response wasn't in the expected format. Please try again.")
    data.setdefault("actions", [])
    data.setdefault("reply", "")
    return data
