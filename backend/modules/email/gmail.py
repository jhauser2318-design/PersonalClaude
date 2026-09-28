"""Reading and sending Gmail, using the same Google sign-in as the calendar.

Emails are fetched only when you look at the Email page or ask the AI
something about your email. Nothing is stored: they're read from Gmail each
time. Sending only happens from the Send button (see routes.py).
"""
import base64
import html
import re
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from email.utils import getaddresses, parseaddr

from ..calendar import google
from ..calendar.google import CalendarError

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
BODY_LIMIT = 12000  # characters of an email's text passed to the AI


class EmailError(CalendarError):
    """An email problem, with a message that's safe to show the user."""


def require_gmail() -> None:
    if not google.is_connected():
        raise google.NotConnected("Google isn't connected yet. Connect it on the Email page.")
    if not google.has_gmail():
        raise EmailError("Gmail access hasn't been granted yet. On the Email page, click "
                         "“Connect Gmail” to approve it.")


def _call(method: str, path: str, *, params=None, body=None):
    require_gmail()
    status, data = google.authed_request(method, GMAIL + path, params=params, body=body)
    if status >= 400:
        message = google._google_message(data) or str(status)
        if status == 403 and ("has not been used" in message or "is disabled" in message):
            raise EmailError("The Gmail API isn't turned on in your Google Cloud project yet. "
                             "Enable it (see the Email page, step 1), wait a minute, and try again.")
        if status == 403 and "insufficient" in message.lower():
            raise EmailError("Gmail access wasn't fully granted. Click “Connect Gmail” on the Email page "
                             "and tick all the boxes Google shows.")
        if status == 404:
            raise EmailError("That email wasn't found (it may have been deleted).")
        raise EmailError(f"Gmail error: {message}")
    return data


def my_address() -> str:
    return _call("GET", "/profile").get("emailAddress", "")


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def _headers(payload: dict) -> dict:
    return {h["name"].lower(): h["value"] for h in payload.get("headers", [])}


def _summary(msg: dict) -> dict:
    h = _headers(msg.get("payload", {}))
    labels = msg.get("labelIds", [])
    return {
        "id": msg["id"],
        "thread_id": msg.get("threadId"),
        "from": h.get("from", ""),
        "to": h.get("to", ""),
        "subject": h.get("subject", "") or "(no subject)",
        "date": h.get("date", ""),
        "timestamp": int(msg.get("internalDate", 0)) // 1000,
        "snippet": html.unescape(msg.get("snippet", "")),
        "unread": "UNREAD" in labels,
        "labels": labels,
    }


def search(query: str = "in:inbox", max_results: int = 20) -> list[dict]:
    """Emails matching a Gmail search (same syntax as Gmail's search box), newest first."""
    max_results = max(1, min(int(max_results or 20), 50))
    data = _call("GET", "/messages", params={"q": query or "in:inbox", "maxResults": max_results})
    ids = [m["id"] for m in data.get("messages", [])]
    if not ids:
        return []

    def meta(msg_id):
        return _call("GET", f"/messages/{msg_id}", params=[
            ("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "To"),
            ("metadataHeaders", "Subject"), ("metadataHeaders", "Date")])

    with ThreadPoolExecutor(max_workers=8) as pool:
        messages = list(pool.map(meta, ids))
    return [_summary(m) for m in messages]


def _decode(data: str) -> str:
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    return raw.decode("utf-8", "replace")


def _html_to_text(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style|head).*?</\1>", " ", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h[1-6])>", "\n", markup)
    text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
    text = re.sub(r"[ \t ]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def _body(payload: dict) -> tuple[str, list[str]]:
    """(plain text, attachment names) from a message payload."""
    plain, htmls, attachments = [], [], []

    def walk(part):
        mime = part.get("mimeType", "")
        if part.get("filename"):
            attachments.append(part["filename"])
        data = part.get("body", {}).get("data")
        if data and mime == "text/plain":
            plain.append(_decode(data))
        elif data and mime == "text/html":
            htmls.append(_decode(data))
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)
    text = "\n".join(plain).strip() or _html_to_text("\n".join(htmls))
    return text, attachments


def get_message(msg_id: str) -> dict:
    msg = _call("GET", f"/messages/{msg_id}", params={"format": "full"})
    info = _summary(msg)
    h = _headers(msg.get("payload", {}))
    text, attachments = _body(msg.get("payload", {}))
    info.update({
        "cc": h.get("cc", ""),
        "reply_to": h.get("reply-to", ""),
        "message_id_header": h.get("message-id", ""),
        "references": h.get("references", ""),
        "body": text,
        "attachments": attachments,
    })
    return info


# ---------------------------------------------------------------------------
# Sending (only ever called from the Send button)
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")


def _clean_recipients(value: str) -> str:
    addresses = [addr for _, addr in getaddresses([value or ""]) if addr]
    bad = [a for a in addresses if not _EMAIL_RE.match(a)]
    if bad:
        raise EmailError(f"“{bad[0]}” doesn't look like an email address.")
    return ", ".join(addresses)


def send(to: str, subject: str, body: str, cc: str = "", reply_to_id: str | None = None) -> dict:
    to_clean = _clean_recipients(to)
    if not to_clean:
        raise EmailError("Add at least one recipient.")
    if not (body or "").strip():
        raise EmailError("The email is empty.")
    msg = EmailMessage()
    msg["To"] = to_clean
    if cc and _clean_recipients(cc):
        msg["Cc"] = _clean_recipients(cc)
    msg["Subject"] = (subject or "").strip() or "(no subject)"
    thread_id = None
    if reply_to_id:
        original = get_message(reply_to_id)
        thread_id = original["thread_id"]
        if original["message_id_header"]:
            msg["In-Reply-To"] = original["message_id_header"]
            msg["References"] = (original["references"] + " " + original["message_id_header"]).strip()
    msg.set_content(body.strip() + "\n")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    payload = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id
    sent = _call("POST", "/messages/send", body=payload)
    return {"id": sent.get("id"), "to": to_clean, "subject": msg["Subject"]}


def display_name(address: str) -> str:
    name, addr = parseaddr(address or "")
    return name or addr
