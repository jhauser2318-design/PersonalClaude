"""Applies the actions Claude returned, and can undo them.

Before changing anything we save a copy of the item's "before" state in the
command_log table. Undo simply puts those copies back (or deletes items the
command created).
"""
import json

from ...database import register_schema, row_to_dict
from ..goals import service
from ..goals.service import ValidationError
from ..calendar import service as calendar
from ..calendar.google import CalendarError
from ..habits import service as habits
from ..shopping import links as shopping_links
from ..shopping import service as shopping

register_schema(
    """
    CREATE TABLE IF NOT EXISTS command_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        text       TEXT NOT NULL,
        reply      TEXT NOT NULL,
        changes    TEXT NOT NULL,
        undone     INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """
)

GOAL_UPDATE_FIELDS = ["title", "area", "description", "target_date", "status", "progress"]
TASK_UPDATE_FIELDS = ["title", "area", "goal_id", "due_date", "priority", "done"]
HABIT_UPDATE_FIELDS = ["title", "area", "goal_id", "frequency", "days", "times_per_week",
                       "target_amount", "unit", "active"]


def _pick(action: dict, fields: list[str]) -> dict:
    """Keep only the fields Claude actually filled in (null means 'no change')."""
    return {f: action[f] for f in fields if action.get(f) is not None}


def _require(action: dict, key: str, what: str):
    if action.get(key) is None:
        raise ValidationError(f"Claude didn't say which {what} to change")
    return int(action[key])


def _when(event: dict) -> str:
    """ "Tue 29 Sep, 19:00–21:00" or "Tue 29 Sep (all day)". """
    from datetime import date as _date
    day = _date.fromisoformat(event["date"]).strftime("%a %d %b")
    if event["all_day"]:
        last = event["end"][:10]
        if last != event["date"]:
            return f"{day} – {_date.fromisoformat(last).strftime('%a %d %b')} (all day)"
        return f"{day} (all day)"
    return f"{day}, {event['start'][11:16]}–{event['end'][11:16]}"


def _undo_event(change: dict) -> None:
    """Reverse one calendar change (in Google Calendar)."""
    if change["op"] == "created":
        calendar.google.api("DELETE", f"/events/{change['id']}")
    elif change["op"] == "updated":
        calendar.restore_fields(change["id"], change["before"])
    elif change["op"] == "deleted":
        calendar.recreate(change["before"])


def apply_actions(conn, actions: list[dict]) -> tuple[list[dict], list[str]]:
    """Apply every action. Returns (undo records, human-readable summaries).

    Raises ValidationError (or CalendarError) if anything is invalid; the
    caller rolls back the database, and calendar changes already made in this
    command are reversed here, so it's all-or-nothing.
    """
    undo: list[dict] = []
    try:
        return _apply(conn, actions, undo)
    except Exception:
        for change in reversed(undo):
            if change["kind"] == "event":
                try:
                    _undo_event(change)
                except Exception:
                    pass
        raise


def _apply(conn, actions: list[dict], undo: list[dict]) -> tuple[list[dict], list[str]]:
    summary: list[str] = []
    last_new_goal_id = None

    for action in actions:
        kind = action.get("type")

        if kind == "create_goal":
            fields = _pick(action, GOAL_UPDATE_FIELDS)
            goal = service.create_goal(conn, fields)
            last_new_goal_id = goal["id"]
            undo.append({"kind": "goal", "id": goal["id"], "before": None})
            due = f" (target {goal['target_date']})" if goal["target_date"] else ""
            summary.append(f"Created {goal['area']} goal “{goal['title']}”{due}")

        elif kind == "update_goal":
            goal_id = _require(action, "goal_id", "goal")
            before = service.get_goal_row(conn, goal_id)
            if before is None:
                raise ValidationError(f"Goal #{goal_id} doesn't exist")
            fields = _pick(action, GOAL_UPDATE_FIELDS)
            if not fields:
                continue
            after = service.update_goal(conn, goal_id, fields)
            undo.append({"kind": "goal", "id": goal_id, "before": before})
            changed = []
            if after["progress"] != before["progress"]:
                changed.append(f"progress {before['progress']}% → {after['progress']}%")
            if after["status"] != before["status"]:
                changed.append(f"status → {after['status'].replace('_', ' ')}")
            for f in ("title", "area", "target_date", "description"):
                if after[f] != before[f]:
                    changed.append(f"{f.replace('_', ' ')} updated")
            summary.append(f"Updated goal “{after['title']}”: " + ", ".join(changed or ["no changes"]))

        elif kind == "add_note":
            goal_id = _require(action, "goal_id", "goal")
            note = service.add_note(conn, goal_id, action.get("note") or "", source="command")
            undo.append({"kind": "note", "id": note["id"], "before": None})
            title = service.get_goal_row(conn, goal_id)["title"]
            summary.append(f"Added note to “{title}”: {note['text']}")

        elif kind == "create_task":
            fields = _pick(action, TASK_UPDATE_FIELDS)
            if action.get("link_to_new_goal") and last_new_goal_id:
                fields["goal_id"] = last_new_goal_id
            task = service.create_task(conn, fields)
            undo.append({"kind": "task", "id": task["id"], "before": None})
            due = f", due {task['due_date']}" if task["due_date"] else ""
            summary.append(f"Added {task['area']} task “{task['title']}” ({task['priority']} priority{due})")

        elif kind in ("update_task", "complete_task"):
            task_id = _require(action, "task_id", "task")
            before = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            if before is None:
                raise ValidationError(f"Task #{task_id} doesn't exist")
            fields = {"done": True} if kind == "complete_task" else _pick(action, TASK_UPDATE_FIELDS)
            if not fields:
                continue
            after = service.update_task(conn, task_id, fields)
            undo.append({"kind": "task", "id": task_id, "before": before})
            if kind == "complete_task" or (after["done"] and not before["done"]):
                summary.append(f"Marked “{after['title']}” as done")
            else:
                summary.append(f"Updated task “{after['title']}”")

        elif kind == "create_habit":
            fields = _pick(action, HABIT_UPDATE_FIELDS)
            if action.get("link_to_new_goal") and last_new_goal_id:
                fields["goal_id"] = last_new_goal_id
            habit = habits.create_habit(conn, fields)
            undo.append({"kind": "habit", "id": habit["id"], "before": None})
            summary.append(f"Added routine “{habit['title']}” ({habit['schedule_text']})")

        elif kind == "update_habit":
            habit_id = _require(action, "habit_id", "routine")
            before = habits.get_habit_row(conn, habit_id)
            if before is None:
                raise ValidationError(f"Routine #{habit_id} doesn't exist")
            fields = _pick(action, HABIT_UPDATE_FIELDS)
            if not fields:
                continue
            after = habits.update_habit(conn, habit_id, fields)
            undo.append({"kind": "habit", "id": habit_id, "before": before})
            if "active" in fields and len(fields) == 1:
                summary.append(f"{'Resumed' if after['active'] else 'Paused'} routine “{after['title']}”")
            else:
                summary.append(f"Updated routine “{after['title']}” ({after['schedule_text']})")

        elif kind == "log_habit":
            habit_id = _require(action, "habit_id", "routine")
            day = action.get("date")
            if habits.get_habit_row(conn, habit_id) is None:
                raise ValidationError(f"Routine #{habit_id} doesn't exist")
            before = habits.get_log(conn, habit_id, (day or service.now_iso())[:10])
            log = habits.log_habit(conn, habit_id, day, action.get("amount"), action.get("note") or "")
            undo.append({"kind": "habit_log", "id": log["id"], "before": before})
            h = habits.get_habit(conn, habit_id)
            amount = ""
            if h["target_amount"] and log["amount"] is not None:
                amount = f" ({log['amount']:g} {h['unit'] or ''}".rstrip() + ")"
            when = "" if log["date"] == service.now_iso()[:10] else f" on {log['date']}"
            streak = f" · 🔥 {h['streak']} streak" if h["streak"] > 1 else ""
            summary.append(f"Logged “{h['title']}”{amount}{when}{streak}")

        elif kind == "create_event":
            event = calendar.create_event(action.get("title") or "", action.get("start") or "",
                                          action.get("end"), action.get("location") or "",
                                          action.get("description") or "")
            undo.append({"kind": "event", "op": "created", "id": event["id"], "before": None})
            where = f" at {event['location']}" if event["location"] else ""
            summary.append(f"📅 Added “{event['title']}” to your calendar ({_when(event)}){where}")

        elif kind == "update_event":
            event_id = action.get("event_id")
            if not event_id:
                raise ValidationError("Claude didn't say which calendar event to change")
            before, after = calendar.update_event(event_id, {
                "title": action.get("title"), "start": action.get("start"), "end": action.get("end"),
                "location": action.get("location"), "description": action.get("description")})
            undo.append({"kind": "event", "op": "updated", "id": event_id, "before": before})
            summary.append(f"📅 Updated “{after['title']}” ({_when(after)})")

        elif kind == "delete_event":
            event_id = action.get("event_id")
            if not event_id:
                raise ValidationError("Claude didn't say which calendar event to remove")
            before = calendar.delete_event(event_id)
            undo.append({"kind": "event", "op": "deleted", "id": event_id, "before": before})
            gone = calendar.simplify(before)
            summary.append(f"📅 Removed “{gone['title']}” from your calendar ({_when(gone)})")

        elif kind == "add_shopping_item":
            fields = {"name": action.get("title"), "description": action.get("description"),
                      "category": action.get("category") or "want", "price": action.get("price"),
                      "url": action.get("url")}
            if fields["url"] and (not fields["name"] or fields["price"] is None):
                # Fill in what's missing from the product page, if the store allows it.
                found = shopping_links.fetch_details(fields["url"])
                fields["name"] = fields["name"] or found["name"]
                fields["description"] = fields["description"] or found["description"]
                if fields["price"] is None:
                    fields["price"] = found["price"]
                if not fields["name"]:
                    raise ValidationError("I couldn't read the item's name from that link. "
                                          "Say what it is, e.g. “add the Sony headphones to my wants: <link>”.")
            item = shopping.create_item(conn, {k: v for k, v in fields.items() if v is not None})
            undo.append({"kind": "shopping", "id": item["id"], "before": None})
            price = f", ${item['price']:,.2f}" if item["price"] is not None else ""
            summary.append(f"🛒 Added “{item['name']}” to your {item['category']}s{price}")

        elif kind == "update_shopping_item":
            item_id = _require(action, "item_id", "shopping item")
            before = shopping.get_item(conn, item_id)
            if before is None:
                raise ValidationError(f"Shopping item #{item_id} doesn't exist")
            fields = {"name": action.get("title"), "description": action.get("description"),
                      "category": action.get("category"), "price": action.get("price"),
                      "url": action.get("url"), "bought": action.get("done")}
            fields = {k: v for k, v in fields.items() if v is not None}
            if not fields:
                continue
            after = shopping.update_item(conn, item_id, fields)
            undo.append({"kind": "shopping", "id": item_id, "before": before})
            if "bought" in fields and len(fields) == 1:
                summary.append(f"🛒 Marked “{after['name']}” as {'bought ✓' if after['bought'] else 'still to buy'}")
            else:
                changed = ["link" if f == "url" else f for f in fields]
                summary.append(f"🛒 Updated “{after['name']}” ({', '.join(changed)})")

        elif kind == "remove_shopping_item":
            item_id = _require(action, "item_id", "shopping item")
            before = shopping.get_item(conn, item_id)
            if before is None:
                raise ValidationError(f"Shopping item #{item_id} doesn't exist")
            shopping.delete_item(conn, item_id)
            undo.append({"kind": "shopping_deleted", "id": item_id, "before": before})
            summary.append(f"🛒 Removed “{before['name']}” from your shopping list")

        else:
            raise ValidationError(f"Unknown action '{kind}'")

    return undo, summary


def log_command(conn, text: str, reply: str, undo: list[dict]) -> int:
    cur = conn.execute(
        "INSERT INTO command_log (text, reply, changes, created_at) VALUES (?, ?, ?, ?)",
        (text, reply, json.dumps(undo), service.now_iso()),
    )
    return cur.lastrowid


def undo_command(conn, log_id: int) -> str:
    row = conn.execute("SELECT * FROM command_log WHERE id = ?", (log_id,)).fetchone()
    if row is None:
        raise ValidationError("That command wasn't found")
    if row["undone"]:
        raise ValidationError("That command was already undone")

    tables = {"goal": "goals", "task": "tasks", "note": "goal_notes",
              "habit": "habits", "habit_log": "habit_logs", "shopping": "shopping_items"}
    # Undo in reverse order: the last change is reverted first.
    for change in reversed(json.loads(row["changes"])):
        if change["kind"] == "event":
            try:
                _undo_event(change)
            except CalendarError as e:
                raise ValidationError(f"Couldn't undo the calendar change: {e}")
            continue
        if change["kind"] == "shopping_deleted":
            shopping.restore_item(conn, change["before"])
            continue
        table = tables[change["kind"]]
        before = change["before"]
        if before is None:
            conn.execute(f"DELETE FROM {table} WHERE id = ?", (change["id"],))
        else:
            cols = [k for k in before if k != "id"]
            conn.execute(
                f"UPDATE {table} SET {', '.join(f'{c} = ?' for c in cols)} WHERE id = ?",
                (*[before[c] for c in cols], change["id"]),
            )
    conn.execute("UPDATE command_log SET undone = 1 WHERE id = ?", (log_id,))
    return f"Undid: {row['text']}"
