"""Calendar events: a simple shape on top of Google Calendar's format.

An event here is:
  {"id", "title", "start", "end", "all_day", "location", "description", "date", "link"}
where start/end are "YYYY-MM-DDTHH:MM" (timed) or "YYYY-MM-DD" (all-day,
end inclusive). Times are in your Google Calendar's own time zone.
"""
from datetime import date, datetime, timedelta

from . import google
from .google import CalendarError

_time_zone: str | None = None


def time_zone() -> str:
    """Your Google Calendar's time zone (asked once, then remembered)."""
    global _time_zone
    if not _time_zone:
        _time_zone = google.api("GET", "/events", params={"maxResults": 1}).get("timeZone") or "UTC"
    return _time_zone


# ---------------------------------------------------------------------------
# Converting between Google's format and ours
# ---------------------------------------------------------------------------

def simplify(e: dict) -> dict:
    start, end = e.get("start", {}), e.get("end", {})
    all_day = "date" in start
    if all_day:
        s = start["date"]
        # Google's all-day end date is exclusive; ours is the last day.
        last = date.fromisoformat(end.get("date", s)) - timedelta(days=1)
        en = max(s, last.isoformat())
    else:
        s = start.get("dateTime", "")[:16]
        en = end.get("dateTime", "")[:16]
    return {
        "id": e["id"],
        "title": e.get("summary") or "(no title)",
        "start": s,
        "end": en,
        "all_day": all_day,
        "location": e.get("location") or "",
        "description": e.get("description") or "",
        "date": s[:10],
        "link": e.get("htmlLink"),
    }


def _parse(value: str, what: str) -> datetime | date:
    original = (value or "").strip()
    text = original.replace(" ", "T")
    try:
        if len(text) == 10:
            return date.fromisoformat(text)
        return datetime.fromisoformat(text[:16])
    except ValueError:
        raise CalendarError(f"'{original}' isn't a valid {what} (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)")


def _times(start: str, end: str | None) -> tuple[dict, dict]:
    """Google start/end objects from our strings."""
    s = _parse(start, "start time")
    tz = time_zone()
    if isinstance(s, datetime):
        e = _parse(end, "end time") if end else s + timedelta(hours=1)
        if not isinstance(e, datetime):  # end given as a date only
            e = datetime.combine(e, s.time()) + timedelta(hours=1)
        if e <= s:
            raise CalendarError("The event has to end after it starts.")
        fmt = "%Y-%m-%dT%H:%M:00"
        return {"dateTime": s.strftime(fmt), "timeZone": tz}, {"dateTime": e.strftime(fmt), "timeZone": tz}
    e = _parse(end, "end date") if end else s
    e = e.date() if isinstance(e, datetime) else e
    if e < s:
        raise CalendarError("The event has to end on or after the day it starts.")
    return {"date": s.isoformat()}, {"date": (e + timedelta(days=1)).isoformat()}


# ---------------------------------------------------------------------------
# Reading and writing
# ---------------------------------------------------------------------------

def list_events(start: date, days: int = 7) -> list[dict]:
    """Events from `start` for `days` days (one extra day each side, filtered by local date)."""
    end = start + timedelta(days=days)
    data = google.api("GET", "/events", params={
        "timeMin": f"{(start - timedelta(days=1)).isoformat()}T00:00:00Z",
        "timeMax": f"{(end + timedelta(days=1)).isoformat()}T00:00:00Z",
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 250,
    })
    global _time_zone
    _time_zone = data.get("timeZone") or _time_zone
    events = [simplify(e) for e in data.get("items", []) if e.get("status") != "cancelled"]
    lo, hi = start.isoformat(), (end - timedelta(days=1)).isoformat()
    # Keep events that overlap the range (multi-day all-day events included).
    return [e for e in events if e["date"] <= hi and e["end"][:10] >= lo]


def get_raw(event_id: str) -> dict:
    return google.api("GET", f"/events/{event_id}")


def create_event(title: str, start: str, end: str | None = None,
                 location: str = "", description: str = "") -> dict:
    title = (title or "").strip()
    if not title:
        raise CalendarError("An event needs a title.")
    if not start:
        raise CalendarError("An event needs a start date or time.")
    s, e = _times(start, end)
    body = {"summary": title, "start": s, "end": e}
    if location:
        body["location"] = location.strip()
    if description:
        body["description"] = description.strip()
    return simplify(google.api("POST", "/events", body=body))


def update_event(event_id: str, fields: dict) -> tuple[dict, dict]:
    """Change some fields. Returns (the event before, the event after)."""
    before = get_raw(event_id)
    body = {}
    if fields.get("title"):
        body["summary"] = fields["title"].strip()
    if fields.get("location") is not None:
        body["location"] = fields["location"].strip()
    if fields.get("description") is not None:
        body["description"] = fields["description"].strip()
    if fields.get("start") or fields.get("end"):
        old = simplify(before)
        start = fields.get("start") or old["start"]
        end = fields.get("end")
        if not end:
            # Keep the same length when only the start moves.
            old_s, old_e = _parse(old["start"], "start"), _parse(old["end"], "end")
            new_s = _parse(start, "start")
            if isinstance(new_s, datetime) and isinstance(old_s, datetime) and isinstance(old_e, datetime):
                end = (new_s + (old_e - old_s)).strftime("%Y-%m-%dT%H:%M")
            elif isinstance(new_s, date) and not isinstance(new_s, datetime) and not isinstance(old_s, datetime):
                end = (new_s + (old_e - old_s)).isoformat()
        body["start"], body["end"] = _times(start, end)
    if not body:
        return before, simplify(before)
    after = google.api("PATCH", f"/events/{event_id}", body=body)
    return before, simplify(after)


def delete_event(event_id: str) -> dict:
    """Delete an event. Returns what it was (so it can be restored)."""
    before = get_raw(event_id)
    google.api("DELETE", f"/events/{event_id}")
    return before


# ---------------------------------------------------------------------------
# Undo helpers (used by the command bar)
# ---------------------------------------------------------------------------

RESTORE_FIELDS = ["summary", "description", "location", "start", "end", "colorId",
                  "recurrence", "reminders", "transparency", "visibility"]


def restore_fields(event_id: str, raw: dict) -> None:
    body = {k: raw[k] for k in ("summary", "description", "location", "start", "end") if k in raw}
    for k in ("summary", "description", "location"):
        body.setdefault(k, "")
    google.api("PATCH", f"/events/{event_id}", body=body)


def recreate(raw: dict) -> dict:
    body = {k: raw[k] for k in RESTORE_FIELDS if k in raw}
    return simplify(google.api("POST", "/events", body=body))
