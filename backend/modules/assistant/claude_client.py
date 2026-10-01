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

from ... import ai_models, config
from ...areas import AREAS

AREA_ENUM = [a["id"] for a in AREAS]
ACTION_TYPES = ["create_goal", "update_goal", "add_note", "create_task", "update_task", "complete_task",
                "create_habit", "update_habit", "log_habit",
                "create_event", "update_event", "delete_event",
                "add_shopping_item", "update_shopping_item", "remove_shopping_item",
                "create_followup", "update_followup", "set_reminder",
                "add_schedule_block", "update_schedule_block", "remove_schedule_block",
                "log_cpa_score", "add_person", "log_contact", "log_fun", "add_fun_idea",
                "add_home_job", "complete_home_item", "add_bill", "add_to_savings"]


# Every action field is always present, with a "blank" value when it doesn't
# apply ("" for text, 0 for ids and amounts, -1 for progress, [] for days).
# This keeps the schema free of optional and nullable fields, which the API
# limits (max 16 union-type fields) and which make schemas slow to compile.
# normalize_action() turns the blanks back into None.
BLANKS = {
    "goal_id": 0, "task_id": 0, "habit_id": 0, "title": "", "area": "", "description": "",
    "target_date": "", "status": "", "progress": -1, "note": "", "due_date": "", "priority": "",
    "done": "", "frequency": "", "days": [], "times_per_week": 0, "target_amount": 0, "unit": "",
    "amount": 0, "date": "", "active": "",
    "event_id": "", "start": "", "end": "", "location": "",
    "item_id": 0, "category": "", "price": -1, "url": "",
    "followup_id": 0, "person": "", "followup_kind": "", "remind_at": "",
    "block_id": 0,
}
YES_NO = {"yes": True, "no": False}

ACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ACTION_TYPES},
        "goal_id": {"type": "integer"},
        "task_id": {"type": "integer"},
        "habit_id": {"type": "integer"},
        "link_to_new_goal": {"type": "boolean"},
        "title": {"type": "string"},
        "area": {"type": "string", "enum": AREA_ENUM + [""]},
        "description": {"type": "string"},
        "target_date": {"type": "string"},
        "status": {"type": "string", "enum": ["not_started", "in_progress", "done", "paused", ""]},
        "progress": {"type": "integer"},
        "note": {"type": "string"},
        "due_date": {"type": "string"},
        "priority": {"type": "string", "enum": ["low", "medium", "high", ""]},
        "done": {"type": "string", "enum": ["yes", "no", ""]},
        "frequency": {"type": "string", "enum": ["daily", "weekdays", "times_per_week", ""]},
        "days": {"type": "array", "items": {"type": "integer"}},
        "times_per_week": {"type": "integer"},
        "target_amount": {"type": "number"},
        "unit": {"type": "string"},
        "amount": {"type": "number"},
        "date": {"type": "string"},
        "active": {"type": "string", "enum": ["yes", "no", ""]},
        "event_id": {"type": "string"},
        "start": {"type": "string"},
        "end": {"type": "string"},
        "location": {"type": "string"},
        "item_id": {"type": "integer"},
        "category": {"type": "string", "enum": ["need", "want", ""]},
        "price": {"type": "number"},
        "url": {"type": "string"},
        "followup_id": {"type": "integer"},
        "person": {"type": "string"},
        "followup_kind": {"type": "string", "enum": ["todo", "waiting", ""]},
        "remind_at": {"type": "string"},
        "block_id": {"type": "integer"},
    },
    "additionalProperties": False,
}
ACTION_SCHEMA["required"] = list(ACTION_SCHEMA["properties"])


def normalize_action(action: dict) -> dict:
    """Turn the schema's blank values back into None (and yes/no into booleans)."""
    out = {}
    for key, value in action.items():
        if key in ("done", "active"):
            value = YES_NO.get(value)
        elif key in BLANKS and value == BLANKS[key]:
            value = None
        elif key in ("progress", "price") and isinstance(value, (int, float)) and value < 0:
            value = None
        out[key] = value
    return out


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["actions", "answer", "clarify", "email", "finance"]},
        "reply": {"type": "string"},
        "actions": {"type": "array", "items": ACTION_SCHEMA},
    },
    "required": ["intent", "reply", "actions"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are the command bar of "Life Control Center", a personal dashboard where the user tracks goals, tasks, routines, a daily schedule, follow-ups, people, fun things they did and their CPA exam across four life areas (work, health, social, education), next to their Google Calendar.

The user types short natural sentences. Work out what they mean and respond with JSON in one of these forms:

1. intent "actions": the user wants to change their data. Put one or more actions in "actions", and put a short, friendly one-sentence confirmation in "reply" (e.g. "Added a 5K goal for March 31 in Health.").
2. intent "answer": the user asked a question (e.g. "What should I focus on this week?"). Leave "actions" empty and answer in "reply" using their actual goals and tasks. Keep it concise: a short intro and at most 5 bullet points starting with "- ". Mention overdue and high-priority items first.
3. intent "clarify": you are not reasonably sure what they want, or which goal/task they mean (for example two goals match equally well, or none match). Leave "actions" empty and ask ONE short clarifying question in "reply". Never guess when a wrong guess would change the wrong item.

Actions. Every field must be present in every action. For fields that don't apply, use the blank value: "" for text and choice fields, 0 for goal_id/task_id/habit_id/block_id/times_per_week/target_amount/amount, -1 for progress, [] for days, false for link_to_new_goal. done and active take "yes", "no" or "". "Leave X unchanged" always means the blank value.
- create_goal: title, area (required); description, target_date, status, progress (optional).
- update_goal: goal_id (required) plus only the fields that change (title, area, description, target_date, status, progress). Leave all others blank.
- add_note: goal_id (required), note (required). A timestamped progress update on a goal. Use this whenever the user reports something they did toward a goal ("Went to the gym today").
- create_task: title, area (required unless it's linked to a goal); goal_id to link it to an existing goal; due_date, priority (optional, default medium). If the task belongs to a goal created earlier in this SAME response, set goal_id 0 and link_to_new_goal true.
- update_task: task_id (required) plus only the fields that change (title, area, goal_id, due_date, priority, done "yes"/"no").
- complete_task: task_id (required). Marks a task as done.
- create_habit: a ROUTINE, i.e. a recurring task the user wants to do regularly (gym, skincare, studying, meditation...). title, area (required); frequency: "daily", "weekdays" (then days: list of weekday numbers, 0=Monday ... 6=Sunday) or "times_per_week" (then times_per_week: 1-7); optional target_amount + unit for a daily amount (e.g. 2 "hours", 10000 "steps"); optional goal_id to link it to a goal.
- update_habit: habit_id (required) plus only the fields that change (title, area, goal_id, frequency, days, times_per_week, target_amount, unit). To pause a routine set active "no"; to resume it set active "yes".
- log_habit: habit_id (required). Records that the user did a routine. date: "" means today; set it (YYYY-MM-DD) for "yesterday" etc. amount: how much they did if the routine has a unit (e.g. "studied CPA for 3 hours" -> 3); 0 means "fully done". note: optional short detail.
- create_event: a Google Calendar event. ONLY when the user explicitly asks for it to go on their calendar ("put the dentist Thursday 3pm on my calendar", "add Mom's birthday dinner Saturday to Google Calendar", "calendar invite for...", "add to my calendar"). Never create an event just because something sounds important or involves other people. title and start (required); end; location; description (optional notes). start/end are "YYYY-MM-DDTHH:MM" (24-hour clock, the calendar's own time zone) for timed events, or "YYYY-MM-DD" for all-day events (end = last day, inclusive). If no end or duration is given, leave end "" (it defaults to 1 hour).
- update_event: event_id (required, from the CALENDAR list) plus only what changes (title, start, end, location, description). When only the start moves, leave end "" and the event keeps its length.
- delete_event: event_id (required). Only when the user clearly asks to cancel or remove that specific event.

Daily schedule (the user's own time blocks for their day; it NEVER goes to Google Calendar):
- add_schedule_block: a personal time block ("gym 6-7am tomorrow", "block 7-9pm for CPA study", "deep work 9 to 11", "plan my morning: ..."). date (YYYY-MM-DD, "" = today), start and end as "HH:MM" (24-hour), title, area (optional), note (optional). If no end is given, make it 1 hour. Several blocks = several actions. If they want a heads-up ("remind me", "ping me 10 min before"), set remind_at to the minutes before the start as a number in a string ("0" = at the start, "10"); otherwise "".
- update_schedule_block: block_id (required, from SCHEDULE) plus only what changes: date, start, end, title, area, note, or done "yes"/"no" ("finished my study block").
- remove_schedule_block: block_id (required), when the user asks to remove/clear a block.

CPA exam:
- log_cpa_score: a practice exam/quiz score. title = the section code (FAR, AUD, REG, BAR, ISC or TCP), amount = the score in percent, date ("" = today), note (optional, e.g. "Becker practice exam 2"). Study hours are logged on the CPA study routine with log_habit, not here.

People:
- add_person: someone the user wants to keep track of. title = their name; date = birthday (YYYY-MM-DD, or "0000-MM-DD" if the year is unknown), "" if not given; amount = reach out every N days (0 if not given, e.g. "every 2 weeks" = 14); description = relation (family, friend, partner, work, mentor, other) or ""; note = details to remember.
- log_contact: the user talked to / met / texted someone ("called Mom", "had coffee with Jake"). person = the name exactly as in PEOPLE (if they're not in PEOPLE, add them first with add_person in the same response); title = how: "call", "text", "met", "email" or "talked"; date ("" = today); note = what it was about (optional).

Fun & leisure (a log of fun things the user did, and ideas for later):
- log_fun: something fun the user did ("went bowling with Sam last night, so fun", "concert at the Riviera Saturday, 5/5"). title = short name of the activity ("Bowling with Sam"); description = category, one of outdoors, friends, food, travel, games, shows, sports, creative, relax, other; date ("" = today); amount = how fun 1-5 if they say or it's clear ("amazing" = 5, "fine" = 3), else 0; person = who they were with, or ""; location = where, or ""; price = what it cost if said, else -1; note = extra detail (optional). If an idea in FUN ideas matches, still use log_fun (the app keeps both).
- add_fun_idea: something fun they want to do some day ("I want to try axe throwing", "add a Chicago food tour to my fun ideas"). title, description = category, note (optional).

Home maintenance (see HOME MAINTENANCE):
- add_home_job: a one-time job around the house, car or health ("fix the leaky faucet by Friday", "get winter tires put on"). title; due_date (optional); description = category: home, car, health or other; note (optional).
- complete_home_item: the user did a job or a repeating upkeep item ("changed the HVAC filter", "fixed the faucet, cost $12"). item_id (from HOME MAINTENANCE, required); date ("" = today); price = what it cost, else -1; note (optional). For a repeating item this moves its next due date forward.

Bills and savings (see BILLS and SAVINGS GOALS):
- add_bill: a bill that doesn't show up in the bank transactions ("rent is $1,450 on the 1st", "car insurance $600 every year in March"). title; price = amount; date = any date in a month it's due (the day of month is used; "" = the 1st); unit = "monthly", "quarterly" or "yearly" ("" = monthly); note (optional).
- add_to_savings: money put toward a savings goal tracked by hand ("put $200 toward the Lisbon trip"). title = the goal's name as in SAVINGS GOALS; price = amount (negative to take money out). Goals linked to a bank account update by themselves: say so instead.
- Questions about money (spending, budgets, balances, which bills are due, savings progress) are intent "finance"; only adding a bill or putting money toward a savings goal are actions here.

4. intent "email": the request needs the user's email (Gmail): questions about emails ("what did Sarah say about the budget?", "did the electric company email me?", "summarize my unread emails") or writing/replying/sending an email ("reply to Sarah that Thursday works", "email Alex about dinner"). Leave "actions" empty and put a very short note in "reply" ("Checking your email…"); a separate email assistant with Gmail access takes it from there.
5. intent "finance": the request is about the user's money: bank/credit card balances, transactions, spending, income, cash flow, budgets, bills due, subscriptions, loans, savings goals, or a financial report ("how much did I spend on food last month?", "am I on budget?", "what bills are due this week?", "what are my subscriptions?", "how am I doing on my savings goals?", "when will my student loan be paid off?", "set my dining budget to $300", "give me a spending report", "how did yesterday go money-wise?"), or a standing money rule ("always put Venmo to Mike in Housing", "remember that transfers to savings aren't spending"). Leave "actions" empty and put a very short note in "reply" ("Checking your finances…"); a separate finance assistant with access to the user's synced accounts takes it from there. Shopping-list questions are NOT finance: answer those from SHOPPING.

Shopping actions:
- add_shopping_item: something the user needs or wants to buy. title = item name (short, e.g. "AirPods Pro 2"); description = what it is / why, one short line (optional); category "need" (essentials, replacements, things required: a simple checklist, so NEVER set a price for a need, use -1) or "want" (nice-to-haves); price in dollars as a plain number if known, else -1 (wants only); url = product link if given, else "". If the user only gives a link, still add it: leave title "" and the app reads the name and price from the page.
- update_shopping_item: item_id (required, from SHOPPING) plus only what changes: title, description, category, price, url, or done "yes" when they bought it ("I bought the running shoes") / "no" to put it back on the list.
- remove_shopping_item: item_id (required). Only when the user clearly asks to remove/delete an item (not when they bought it; that's update_shopping_item with done "yes").

Follow-ups and reminders:
- create_followup: something the user must follow up on or is waiting on from someone ("follow up with Sarah about the contract next week", "waiting on Mike for the invoice", "remind me to check if Alex replied Friday"). title (required, short, e.g. "Contract with Sarah"); person (who it's with, or ""); followup_kind "todo" (the user needs to do/chase something) or "waiting" (waiting for someone else); due_date (YYYY-MM-DD, optional); remind_at (optional, see below); note (optional detail).
- update_followup: followup_id (required, from FOLLOW-UPS) plus only what changes (title, person, followup_kind, due_date, note, remind_at) or done "yes" when it's resolved ("Sarah got back to me") / "no" to reopen.
- set_reminder: add or change a reminder on an existing item: exactly one of task_id, habit_id or followup_id, plus remind_at. remind_at "off" removes the reminder.
- remind_at formats: for tasks and follow-ups "YYYY-MM-DDTHH:MM" (24-hour clock, local time); for routines a daily time "HH:MM". create_task, create_habit and create_followup also take remind_at directly. If the user gives a day but no time, use 09:00. "Remind me to X at 6pm" (a one-off) = create_task with due_date that day and remind_at that day 18:00. "Remind me every day at 7 to do my skincare" = set_reminder on that routine with remind_at "07:00" (or create_habit with remind_at if it doesn't exist). Reminders show as notifications on the user's computer.

Rules:
- Schedule blocks vs calendar events vs tasks vs routines: time the user plans for THEMSELVES (study, gym, deep work, errands, chores, "block time for X") is a schedule block (add_schedule_block), never a Google event. Google Calendar events are created ONLY when the user explicitly says calendar ("on my calendar", "to my calendar", "Google Calendar", "calendar event/invite"); anything else with a time, including appointments and meetings ("dentist Thursday 3pm"), is a schedule block, and anything without a time is a task. A to-do with a deadline is a task; a repeated habit is a routine. If a calendar event is explicitly requested but the calendar isn't connected, don't create it: reply (intent "answer") that Google Calendar needs to be connected on the Calendar page first, and offer to add it as a task instead.
- For "plan my day" or "when should I do X today", look at SCHEDULE and CALENDAR together and add blocks in the free time.
- For "when am I free" questions, read the CALENDAR and SCHEDULE lists and answer with concrete free slots (intent "answer").
- For shopping questions ("what do I still need to get?", "how much are my wants?"), answer from the SHOPPING list (intent "answer"). Needs are a checklist without prices; only wants have a price total. "Add milk, eggs and paper towels" means three needs.
- Routines vs tasks: something repeated on a schedule ("every day", "3 times a week", "each morning") is a routine (create_habit). A one-off action is a task. When the user says they did something that matches a routine ("went to the gym", "did my skincare", "studied for the CPA 2 hours"), use log_habit, not a task or a goal note. If that routine is also linked to a goal, you may additionally add a short goal note only when the user describes real progress on the goal.
- Use the IDs from the data provided. Match loosely by meaning ("my fitness goal" can match "Run a 5K" in Health; "the Spanish lesson task" matches a task mentioning Spanish lesson). If exactly one item is a clear match, use it.
- When the user reports progress on a goal, add a note describing what they did (in their words, tidied up). Only change "progress" if they give a number or the update clearly moves a measurable goal forward; otherwise leave it -1. If the goal's status is not_started, also set status to in_progress with an update_goal action.
- Dates must be YYYY-MM-DD. Resolve relative dates from today's date given below: "Friday" means the next upcoming Friday (today if today is Friday), "next week" means next Monday, "by March" means the last day of the next upcoming March, "end of month" the last day of the current month.
- Pick the area from context: gym/running/diet/sleep/doctor = health; job/colleagues/boss/budget/clients = work; friends/family/parties = social; courses/languages/reading/studying = education. If the user names an area, use it. If the area truly can't be inferred, ask.
- Titles should be short and start with a capital letter, without the date in them ("Email Sarah about the budget").
- Never delete goals, tasks or routines. If the user asks to delete one, reply that deleting is done by clicking the item, with intent "answer". (Calendar events may be deleted with delete_event.)
- The reply is shown in a small banner: plain text, no markdown headings, no bold."""


class AssistantError(Exception):
    """A problem talking to Claude, with a message safe to show the user."""


def build_context(goals: list[dict], tasks: list[dict], habits: list[dict] | None = None,
                  calendar: dict | None = None, shopping: list[dict] | None = None,
                  followups: list[dict] | None = None, extra: dict | None = None) -> str:
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
    lines += ["", "TASKS (id | area | title | goal id | due | priority | done | reminder):"]
    if not tasks:
        lines.append("(none yet)")
    for t in tasks:
        lines.append(
            f"#{t['id']} | {t['area']} | {t['title']} | {t['goal_id'] or '-'} | "
            f"{t['due_date'] or 'no date'} | {t['priority']} | {'done' if t['done'] else 'open'} | "
            f"{t.get('remind_at') or '-'}"
        )
    lines += ["", "ROUTINES (id | area | title | schedule | today | streak | active | daily reminder):"]
    if not habits:
        lines.append("(none yet)")
    for h in habits or []:
        if h["done_today"]:
            today_s = "done today"
        elif h["logged_today"]:
            today_s = f"partly done today ({h['amount_today']:g} {h['unit'] or ''})".rstrip()
        else:
            today_s = "not done today"
        if h["frequency"] == "times_per_week":
            today_s += f", {h['week_done']}/{h['times_per_week']} this week"
        lines.append(
            f"#{h['id']} | {h['area']} | {h['title']} | {h['schedule_text']} | {today_s} | "
            f"{h['streak']} | {'active' if h['active'] else 'paused'} | {h.get('remind_at') or '-'}"
        )
    lines += [""]
    calendar = calendar or {}
    if calendar.get("error"):
        lines.append(f"CALENDAR: unavailable right now ({calendar['error']})")
    elif not calendar.get("connected"):
        lines.append("CALENDAR: Google Calendar is not connected.")
    else:
        lines.append(f"CALENDAR (Google, time zone {calendar.get('time_zone') or 'unknown'}; "
                     "events from yesterday to 2 weeks ahead; id | start | end | title | location):")
        if not calendar.get("events"):
            lines.append("(no events)")
        for e in calendar.get("events", []):
            lines.append(f"{e['id']} | {e['start']} | {e['end']}{' (all day)' if e['all_day'] else ''} | "
                         f"{e['title']} | {e['location'] or '-'}")
    lines += ["", "SHOPPING (id | need/want | name | price | description | link | status):"]
    if not shopping:
        lines.append("(empty)")
    for it in shopping or []:
        price = f"${it['price']:,.2f}" if it["price"] is not None else "no price"
        lines.append(f"#{it['id']} | {it['category']} | {it['name']} | {price} | {it['description'] or '-'} | "
                     f"{it['url'] or '-'} | {'bought' if it['bought'] else 'to buy'}")
    lines += ["", "FOLLOW-UPS (id | todo/waiting | title | person | due | reminder | status):"]
    if not followups:
        lines.append("(none)")
    for f in followups or []:
        lines.append(f"#{f['id']} | {f['direction']} | {f['title']} | {f['person'] or '-'} | {f['due_date'] or 'no date'} | "
                     f"{f['remind_at'] or '-'} | {'done' if f['done'] else 'open'}")
    extra = extra or {}
    lines += ["", "SCHEDULE (the user's own time blocks, today and the next 2 days; id | date | start-end | title | area | done):"]
    if not extra.get("schedule"):
        lines.append("(nothing planned)")
    for b in extra.get("schedule") or []:
        lines.append(f"#{b['id']} | {b['date']} | {b['start']}-{b['end']} | {b['title']} | {b['area'] or '-'} | "
                     f"{'done' if b['done'] else 'open'}")
    lines += ["", "PEOPLE (id | name | relation | birthday MM-DD | last contact | reach out):"]
    lines += extra.get("people") or ["(none)"]
    for key in ("cpa", "fun", "home", "money"):
        if extra.get(key):
            lines += ["", extra[key]]
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

    # The model is chosen in Settings → AI models (see backend/ai_models.py).
    request = dict(
        max_tokens=8000,
        system=ai_models.cached(SYSTEM_PROMPT),
        messages=messages,
        **ai_models.request_options("command", "medium", {"type": "json_schema", "schema": RESPONSE_SCHEMA}),
    )

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        response = client.beta.messages.create(**request)
        ai_models.record("command", response, request["model"])
    except anthropic.AuthenticationError:
        raise AssistantError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env file.")
    except anthropic.PermissionDeniedError:
        raise AssistantError("Your API key doesn't have permission to use this model.")
    except anthropic.NotFoundError:
        raise AssistantError(f"Model '{request['model']}' isn't available to your API key. Pick another in Settings → AI models.")
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
    data["actions"] = [normalize_action(a) for a in data.get("actions") or []]
    data.setdefault("reply", "")
    return data
