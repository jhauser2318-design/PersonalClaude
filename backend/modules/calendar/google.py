"""Talking to Google: signing in (OAuth) and calling the Google Calendar API.

How the connection works:
  1. You create a free "OAuth client" in Google Cloud (see README) and upload
     its JSON file on the Calendar page. It's saved as data/google_client.json.
  2. "Connect Google Calendar" sends you to Google's sign-in page. You approve
     access to your calendar events (nothing else: not your email or files).
  3. Google sends you back to this app with a one-time code, which the app
     swaps for a token saved in data/google_token.json.
Both files stay on your computer (data/ is never uploaded to GitHub, and
updates never touch it). "Disconnect" deletes the token.

Only Python's built-in web tools are used, so nothing extra is installed.
"""
import base64
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

from ... import config
from ...database import demo_on

CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
# What the app asks for: your calendar events, reading Gmail, and sending
# email (the app only sends after you click Send). Nothing else.
SCOPES = [CALENDAR_SCOPE, GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE]
REDIRECT_URI = "http://localhost:8000/api/calendar/oauth/callback"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary"

DATA_DIR = config.PROJECT_ROOT / "data"
CLIENT_FILE = DATA_DIR / "google_client.json"
TOKEN_FILE = DATA_DIR / "google_token.json"

_pending: dict[str, tuple[str, str]] = {}  # sign-ins in progress: state -> (PKCE verifier, page to return to)
last_error: str | None = None   # shown on the Calendar page after a failed sign-in


class CalendarError(Exception):
    """A calendar problem, with a message that's safe to show the user."""


class NotConnected(CalendarError):
    pass


# ---------------------------------------------------------------------------
# Low-level HTTP (one function, so tests can swap it out)
# ---------------------------------------------------------------------------

def http_request(method: str, url: str, *, params=None, form=None, body=None, token=None):
    """Returns (status_code, parsed_json_or_None)."""
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"Accept": "application/json"}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, None
    except (urllib.error.URLError, TimeoutError) as e:
        raise CalendarError(f"Couldn't reach Google ({getattr(e, 'reason', e)}). Check your internet connection.")


# ---------------------------------------------------------------------------
# Client file (from Google Cloud)
# ---------------------------------------------------------------------------

def load_client() -> dict | None:
    if demo_on():
        return {"client_id": "demo", "client_secret": "demo"}
    return _load_client_file()


def _load_client_file() -> dict | None:
    try:
        data = json.loads(CLIENT_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    info = data.get("web") or data.get("installed") or {}
    if info.get("client_id") and info.get("client_secret"):
        return {"client_id": info["client_id"], "client_secret": info["client_secret"],
                "redirect_uris": info.get("redirect_uris", [])}
    return None


def save_client(text: str) -> dict:
    if demo_on():
        raise CalendarError("Setting up Google isn't available in demo mode. Turn demo mode off in Settings first.")
    try:
        data = json.loads(text)
    except ValueError:
        raise CalendarError("That file isn't valid JSON. Download the client file from Google Cloud again.")
    info = data.get("web") or data.get("installed") or {}
    if not (info.get("client_id") and info.get("client_secret")):
        raise CalendarError("That doesn't look like a Google OAuth client file (no client_id / client_secret).")
    if "web" in data and REDIRECT_URI not in info.get("redirect_uris", []):
        raise CalendarError(
            f"This client is missing the redirect address. In Google Cloud, add {REDIRECT_URI} "
            "under 'Authorized redirect URIs', save, then download the file again.")
    DATA_DIR.mkdir(exist_ok=True)
    CLIENT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return load_client()


# ---------------------------------------------------------------------------
# Sign-in
# ---------------------------------------------------------------------------

def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def authorization_url(return_to: str = "calendar") -> str:
    if demo_on():
        raise CalendarError("Connecting Google isn't available in demo mode. Turn demo mode off in Settings first.")
    client = load_client()
    if not client:
        raise CalendarError("Upload your Google client file first (step 1 on the Calendar page).")
    verifier = _b64url(secrets.token_bytes(48))
    state = _b64url(secrets.token_bytes(16))
    _pending[state] = (verifier, return_to if return_to in ("calendar", "email") else "calendar")
    return AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client["client_id"],
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "include_granted_scopes": "true",
        "access_type": "offline",        # get a refresh token, so you stay connected
        "prompt": "consent",
        "state": state,
        "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    })


def finish_sign_in(code: str, state: str) -> str:
    """Swap Google's one-time code for a token. Returns the page to go back to."""
    pending = _pending.pop(state, None)
    if pending is None:
        raise CalendarError("That sign-in link expired. Click “Connect” again.")
    verifier, return_to = pending
    client = load_client()
    status, data = http_request("POST", TOKEN_URL, form={
        "code": code, "client_id": client["client_id"], "client_secret": client["client_secret"],
        "redirect_uri": REDIRECT_URI, "grant_type": "authorization_code", "code_verifier": verifier,
    })
    if status != 200 or not data or "access_token" not in data:
        raise CalendarError(f"Google didn't accept the sign-in ({_google_message(data) or status}).")
    if not data.get("refresh_token"):
        raise CalendarError("Google didn't provide a long-term token. Click Connect again and approve access.")
    _save_token(data)
    return return_to


def _save_token(data: dict, refresh_token: str | None = None, scope: str | None = None) -> None:
    token = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token") or refresh_token,
        "expires_at": time.time() + int(data.get("expires_in", 3600)),
        # Which permissions Google actually granted (you can untick some).
        "scope": data.get("scope") or scope or CALENDAR_SCOPE,
    }
    DATA_DIR.mkdir(exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(token, indent=2), encoding="utf-8")


def _load_token() -> dict | None:
    try:
        return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def is_connected() -> bool:
    if demo_on():
        return True  # demo mode: a built-in sample calendar and inbox (backend/demo)
    return bool(load_client() and _load_token())


def granted_scopes() -> set[str]:
    if demo_on():
        return set(SCOPES)
    token = _load_token()
    return set((token or {}).get("scope", CALENDAR_SCOPE).split()) if token else set()


def has_gmail() -> bool:
    scopes = granted_scopes()
    return GMAIL_READ_SCOPE in scopes and GMAIL_SEND_SCOPE in scopes


def disconnect() -> None:
    if demo_on():
        raise CalendarError("Disconnecting Google isn't available in demo mode. Turn demo mode off in Settings first.")
    token = _load_token()
    if token:
        try:
            http_request("POST", REVOKE_URL, form={"token": token.get("refresh_token") or token["access_token"]})
        except CalendarError:
            pass  # offline: still forget the token locally
    TOKEN_FILE.unlink(missing_ok=True)


def _access_token(force_refresh: bool = False) -> str:
    token, client = _load_token(), load_client()
    if not token or not client:
        raise NotConnected("Google Calendar isn't connected. Connect it on the Calendar page.")
    if force_refresh or token["expires_at"] - 60 < time.time():
        status, data = http_request("POST", TOKEN_URL, form={
            "client_id": client["client_id"], "client_secret": client["client_secret"],
            "refresh_token": token["refresh_token"], "grant_type": "refresh_token",
        })
        if status != 200 or not data or "access_token" not in data:
            if data and data.get("error") in ("invalid_grant", "unauthorized_client"):
                TOKEN_FILE.unlink(missing_ok=True)
                global last_error
                last_error = ("Google disconnected the app. It does this every 7 days while your Google app "
                              "is in Testing mode, or if access was removed. Click Connect to sign in again.")
                raise NotConnected("Google Calendar access expired or was removed. "
                                   "Reconnect it on the Calendar page.")
            raise CalendarError(f"Couldn't refresh Google access ({_google_message(data) or status}).")
        _save_token(data, refresh_token=token["refresh_token"], scope=token.get("scope"))
        return data["access_token"]
    return token["access_token"]


def _google_message(data) -> str | None:
    if not isinstance(data, dict):
        return None
    err = data.get("error")
    if isinstance(err, dict):
        return err.get("message")
    return data.get("error_description") or err


def authed_request(method: str, url: str, *, params=None, body=None):
    """Call any Google API with your saved sign-in. Returns (status, json)."""
    if demo_on():
        # Demo mode: a built-in sample calendar and inbox. Nothing reaches Google,
        # and "sent" emails go nowhere.
        from ...demo import fake_google
        return fake_google.handle(method, url, params=params, body=body)
    status, data = http_request(method, url, params=params, body=body, token=_access_token())
    if status == 401:  # token expired early: refresh once and retry
        status, data = http_request(method, url, params=params, body=body,
                                    token=_access_token(force_refresh=True))
    return status, data


def api(method: str, path: str = "", *, params=None, body=None):
    """Call the Calendar API for your primary calendar. Returns the JSON reply."""
    status, data = authed_request(method, API_BASE + path, params=params, body=body)
    if status >= 400:
        if status == 404 or status == 410:
            raise CalendarError("That event wasn't found in Google Calendar (it may have been deleted).")
        raise CalendarError(f"Google Calendar error: {_google_message(data) or status}")
    return data
