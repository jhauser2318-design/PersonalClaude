"""A built-in sample Google Calendar and Gmail inbox for demo mode.

In demo mode, every Google request the app makes is answered here instead of
by Google (see calendar/google.py → authed_request). Everything is made up and
dated around today. Changes (new events, "sent" emails) live in memory only
and nothing ever reaches Google.
"""
import base64
import copy
import itertools
import re
import threading
from datetime import date, datetime, timedelta

API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary"
GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
TZ = "America/Chicago"
ME = "Alex Morgan <alex.morgan@example.com>"

_lock = threading.Lock()
_state: dict | None = None


def reset() -> None:
    global _state
    with _lock:
        _state = None


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def _offset() -> str:
    return "-05:00"  # Central Daylight Time; good enough for sample data


def _timed(day: date, start: str, end: str, title: str, location: str = "", description: str = "") -> dict:
    return {"summary": title, "location": location, "description": description,
            "start": {"dateTime": f"{day.isoformat()}T{start}:00{_offset()}", "timeZone": TZ},
            "end": {"dateTime": f"{day.isoformat()}T{end}:00{_offset()}", "timeZone": TZ}}


def _all_day(first: date, last: date, title: str, location: str = "") -> dict:
    return {"summary": title, "location": location, "description": "",
            "start": {"date": first.isoformat()}, "end": {"date": (last + timedelta(days=1)).isoformat()}}


def _build() -> dict:
    today = date.today()
    ids = itertools.count(1)
    events = {}

    def add(e):
        eid = f"demo{next(ids)}"
        events[eid] = {**e, "id": eid, "status": "confirmed", "htmlLink": "https://calendar.google.com/"}

    for offset in range(-7, 29):
        d = today + timedelta(days=offset)
        wd = d.weekday()
        if wd < 5:
            add(_timed(d, "09:30", "09:45", "Team standup", "Zoom"))
        if wd == 1:
            add(_timed(d, "14:00", "14:30", "1:1 with Priya (manager)", "Conference room B"))
            add(_timed(d, "06:30", "07:30", "Gym: upper body", "Summit Fitness"))
        if wd == 3:
            add(_timed(d, "06:30", "07:30", "Gym: legs", "Summit Fitness"))
        if wd in (0, 2):
            add(_timed(d, "19:00", "21:00", "CPA study: FAR practice", "Home"))
        if wd == 4:
            add(_timed(d, "12:00", "13:00", "Lunch with the analytics team", "Sweetgreen"))
        if wd == 5:
            add(_timed(d, "19:00", "21:30", "Dinner with Sam & Jordan", "Lucia's Trattoria"))
        if wd == 6:
            add(_timed(d, "08:00", "09:30", "Long run: 8 miles", "Riverside trail"))
    thursday = today + timedelta(days=(3 - today.weekday()) % 7 or 7)
    add(_timed(thursday, "15:00", "16:00", "Dentist cleaning", "Bright Smile Dental",
               "Bring the new insurance card."))
    add(_timed(today + timedelta(days=9), "17:30", "18:30", "Quarterly review prep", "Office"))
    trip = today + timedelta(days=24)
    add(_all_day(trip, trip + timedelta(days=4), "Lisbon trip ✈️", "Lisbon, Portugal"))
    add(_all_day(today + timedelta(days=12), today + timedelta(days=12), "Mom's birthday 🎂"))

    now = datetime.now()

    def when(hours_ago: float) -> datetime:
        return now - timedelta(hours=hours_ago)

    mails = [
        ("Sarah Chen <sarah.chen@northwind.example>", "Q4 budget numbers", 3, True,
         "Hi Alex,\n\nThe Q4 budget came in at $48,500 for our team. Can you confirm the headcount line by "
         "Thursday so I can send it to finance?\n\nThanks,\nSarah", ["Q4_budget.xlsx"]),
        ("City Power & Light <billing@citypower.example>", "Your October bill is ready", 20, True,
         "Your bill for account ending 4412 is ready.\n\nAmount due: $86.40\nDue date: the 18th of next month\n\n"
         "Pay online anytime at citypower.example.", []),
        ("Sam Rivera <sam.rivera@example.com>", "Saturday dinner?", 28, True,
         "Hey! Are we still on for Saturday at Lucia's? Jordan is in too. 7pm work?\n\nSam", []),
        ("CPA Review Pro <no-reply@cpareview.example>", "Your FAR practice exam results", 45, False,
         "Nice work, Alex! You scored 78% on FAR practice exam 3 (passing is 75%).\n\nWeakest area: "
         "governmental accounting. Suggested next step: 40 practice questions in that section.", []),
        ("Parkview Apartments <leasing@parkview.example>", "Lease renewal offer", 70, False,
         "Hello Alex,\n\nYour lease ends in 60 days. We'd love to have you stay: the renewal rate for a "
         "12-month lease is $1,495/month (currently $1,450). Please let us know by the 15th.\n\nParkview Leasing", []),
        ("TAP Air Portugal <bookings@flytap.example>", "Your trip to Lisbon: booking confirmed", 96, False,
         "Booking reference: DEMO42\n\nChicago (ORD) → Lisbon (LIS), departing in about 3 weeks, 6:40 PM.\n"
         "Return 5 days later.\n\nHave a great trip!", ["itinerary.pdf"]),
        ("Priya Patel <priya.patel@northwind.example>", "Re: Senior Analyst promotion path", 120, False,
         "Hi Alex,\n\nGreat conversation today. For the promotion case, let's focus on two things this quarter: "
         "leading the dashboard migration, and presenting the Q4 forecast to the leadership team.\n\nPriya", []),
        ("Summit Fitness <hello@summitfitness.example>", "Your membership receipt", 150, False,
         "Thanks for being a member! We charged $39.99 to your card for this month's membership.", []),
    ]
    messages = {}
    for i, (sender, subject, hours, unread, body, files) in enumerate(mails, start=1):
        sent_at = when(hours)
        parts = [{"mimeType": "text/plain", "body": {"data": _b64(body)}}]
        parts += [{"mimeType": "application/octet-stream", "filename": f, "body": {"attachmentId": f"a{i}"}} for f in files]
        messages[f"dm{i}"] = {
            "id": f"dm{i}", "threadId": f"dt{i}",
            "labelIds": ["INBOX"] + (["UNREAD"] if unread else []) + (["STARRED"] if i in (1, 6) else []),
            "internalDate": str(int(sent_at.timestamp() * 1000)), "snippet": body.replace("\n", " ")[:120],
            "payload": {"mimeType": "multipart/mixed", "headers": [
                {"name": "From", "value": sender}, {"name": "To", "value": ME}, {"name": "Subject", "value": subject},
                {"name": "Date", "value": sent_at.strftime("%a, %d %b %Y %H:%M:%S -0500")},
                {"name": "Message-ID", "value": f"<dm{i}@demo.example>"}], "parts": parts},
            "_text": f"{sender} {subject} {body}".lower(), "_time": sent_at,
        }
    return {"events": events, "messages": messages, "ids": ids, "sent": 0}


def _get_state() -> dict:
    global _state
    with _lock:
        if _state is None:
            _state = _build()
        return _state


def _clean(msg: dict) -> dict:
    return {k: v for k, v in msg.items() if not k.startswith("_")}


def _matches(msg: dict, query: str) -> bool:
    labels = msg["labelIds"]
    for token in re.findall(r'\S+:"[^"]+"|\S+:\S+|"[^"]+"|\S+', (query or "").lower()):
        key, _, value = token.partition(":") if ":" in token else ("", "", token)
        value = value.strip('"')
        if key == "in":
            if value == "inbox" and "INBOX" not in labels:
                return False
            if value == "sent" and "SENT" not in labels:
                return False
        elif key == "is":
            if value == "unread" and "UNREAD" not in labels:
                return False
            if value == "starred" and "STARRED" not in labels:
                return False
        elif key in ("from", "to", "subject"):
            headers = {h["name"].lower(): h["value"].lower() for h in msg["payload"]["headers"]}
            if value not in headers.get(key, ""):
                return False
        elif key == "newer_than":
            m = re.match(r"(\d+)([dmy])", value)
            if m:
                days = int(m[1]) * {"d": 1, "m": 30, "y": 365}[m[2]]
                if msg["_time"] < datetime.now() - timedelta(days=days):
                    return False
        elif key in ("after", "before", "older_than", "label", "has", "category"):
            continue  # not modeled in the demo: ignore rather than hide everything
        elif value and value not in msg["_text"]:
            return False
    return True


def _gmail(method: str, path: str, params, body):
    st = _get_state()
    if path == "/profile":
        return 200, {"emailAddress": "alex.morgan@example.com"}
    if path == "/messages" and method == "GET":
        q = dict(params) if isinstance(params, (list, tuple)) else (params or {})
        found = sorted((m for m in st["messages"].values() if _matches(m, q.get("q", ""))),
                       key=lambda m: m["_time"], reverse=True)[: int(q.get("maxResults", 20))]
        return 200, ({"messages": [{"id": m["id"], "threadId": m["threadId"]} for m in found]} if found else {})
    if path == "/messages/send" and method == "POST":
        st["sent"] += 1  # pretend: demo mode never sends real email
        return 200, {"id": f"demo-sent-{st['sent']}", "threadId": (body or {}).get("threadId", "demo-new")}
    msg_id = path.rsplit("/", 1)[-1]
    if msg_id in st["messages"]:
        return 200, _clean(st["messages"][msg_id])
    return 404, {"error": {"message": "Requested entity was not found."}}


def _calendar(method: str, path: str, params, body):
    st = _get_state()
    events = st["events"]
    if path == "/events" and method == "GET":
        p = params or {}
        lo = (p.get("timeMin") or "0000")[:10]
        hi = (p.get("timeMax") or "9999")[:10]

        def start_of(e):
            return e["start"].get("dateTime") or e["start"].get("date")

        items = sorted((e for e in events.values()
                        if start_of(e)[:10] <= hi and (e["end"].get("dateTime") or e["end"].get("date"))[:10] >= lo),
                       key=start_of)
        return 200, {"timeZone": TZ, "items": items[: int(p.get("maxResults", 250))]}
    if path == "/events" and method == "POST":
        eid = f"demo{next(st['ids'])}"
        events[eid] = {**(body or {}), "id": eid, "status": "confirmed", "htmlLink": "https://calendar.google.com/"}
        return 200, events[eid]
    eid = path.rsplit("/", 1)[-1]
    if eid not in events:
        return 404, {"error": {"message": "Not Found"}}
    if method == "GET":
        return 200, events[eid]
    if method in ("PATCH", "PUT"):
        events[eid].update(body or {})
        return 200, events[eid]
    if method == "DELETE":
        del events[eid]
        return 204, None
    return 400, {"error": {"message": "Not supported in demo mode"}}


def handle(method: str, url: str, *, params=None, body=None):
    """Answer a Google API request with sample data. Returns (status, json)."""
    url = url.split("?")[0]
    if url.startswith(GMAIL):
        status, data = _gmail(method, url[len(GMAIL):], params, body)
    elif url.startswith(API_BASE):
        status, data = _calendar(method, url[len(API_BASE):], params, body)
    else:
        status, data = 404, {"error": {"message": "Not available in demo mode"}}
    return status, copy.deepcopy(data)
