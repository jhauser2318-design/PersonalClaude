"""Talking to SimpleFIN Bridge (the service that reads your bank and card accounts).

How the connection works:
  1. On the SimpleFIN Bridge website you create a "Setup Token" for this app
     and paste it into the Finances page.
  2. The Setup Token is a one-time code. The app trades it in ("claims" it)
     for a private Access URL, saved in data/simplefin.json. That file never
     leaves your computer (data/ is never uploaded to GitHub, and updates
     never touch it). The Access URL can only READ balances and transactions:
     nobody can move money with it.
  3. From then on the app asks SimpleFIN for your accounts and recent
     transactions. SimpleFIN refreshes from your banks about once a day.

Only Python's built-in web tools are used, so nothing extra is installed.
"""
import base64
import binascii
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from ... import config
from ...database import demo_on

DATA_FILE = config.PROJECT_ROOT / "data" / "simplefin.json"


class FinanceError(Exception):
    """A finances problem, with a message that's safe to show the user."""


class NotConnected(FinanceError):
    pass


# ---------------------------------------------------------------------------
# Low-level HTTP (one function, so tests can swap it out)
# ---------------------------------------------------------------------------

def http_request(method: str, url: str, *, auth: str | None = None, timeout: int = 60):
    """Returns (status_code, body_text)."""
    headers = {"Accept": "application/json", "User-Agent": "LifeControlCenter"}
    if auth:
        headers["Authorization"] = f"Basic {base64.b64encode(auth.encode()).decode()}"
    data = b"" if method == "POST" else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise FinanceError(f"Couldn't reach SimpleFIN ({getattr(e, 'reason', e)}). Check your internet connection.")


# ---------------------------------------------------------------------------
# Connecting
# ---------------------------------------------------------------------------

def is_connected() -> bool:
    return demo_on() or DATA_FILE.exists()  # demo mode shows sample accounts


def _access_url() -> str:
    try:
        return json.loads(DATA_FILE.read_text())["access_url"]
    except FileNotFoundError:
        raise NotConnected("Connect SimpleFIN on the Finances page first.")
    except (ValueError, KeyError):
        raise NotConnected("The saved SimpleFIN connection is damaged. Disconnect and connect again.")


def decode_setup_token(token: str) -> str:
    """A Setup Token is the claim URL, base64-encoded."""
    token = "".join((token or "").split())
    if not token:
        raise FinanceError("Paste your SimpleFIN Setup Token first.")
    if token.startswith("https://"):
        return token  # someone pasted the claim URL itself
    try:
        url = base64.b64decode(token + "=" * (-len(token) % 4), validate=False).decode()
    except (binascii.Error, UnicodeDecodeError):
        url = ""
    if not url.startswith("https://"):
        raise FinanceError("That doesn't look like a SimpleFIN Setup Token. Copy the whole token "
                           "(a long string of letters and numbers) and try again.")
    return url


def claim(token: str) -> None:
    """Trade a Setup Token for an Access URL and save it."""
    if demo_on():
        raise FinanceError("Connecting a bank isn't available in demo mode. Turn demo mode off in Settings first.")
    claim_url = decode_setup_token(token)
    status, body = http_request("POST", claim_url)
    if status == 403:
        raise FinanceError("SimpleFIN says this Setup Token was already used or is invalid. "
                           "Each token works only once: create a new one and paste it here.")
    if status != 200 or not body.strip().startswith("https://"):
        raise FinanceError(f"SimpleFIN didn't accept the token (error {status}). Create a new token and try again.")
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({"access_url": body.strip(), "connected_at": int(time.time())}))


def disconnect() -> None:
    if demo_on():
        raise FinanceError("Disconnecting isn't available in demo mode. Turn demo mode off in Settings first.")
    DATA_FILE.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Reading accounts and transactions
# ---------------------------------------------------------------------------

def _split_credentials(access_url: str) -> tuple[str, str]:
    """https://user:pass@host/path -> ("https://host/path", "user:pass")."""
    parts = urllib.parse.urlsplit(access_url)
    auth = ""
    if parts.username is not None:
        auth = f"{urllib.parse.unquote(parts.username)}:{urllib.parse.unquote(parts.password or '')}"
    host = parts.hostname or ""
    if parts.port:
        host += f":{parts.port}"
    return urllib.parse.urlunsplit((parts.scheme, host, parts.path.rstrip("/"), "", "")), auth


def fetch_accounts(start: int, end: int | None = None) -> dict:
    """GET /accounts: every account with its transactions posted since `start` (unix time).

    Returns {"accounts": [...], "messages": [text shown to the user]}.
    """
    if demo_on():
        raise FinanceError("Syncing is paused in demo mode.")
    base, auth = _split_credentials(_access_url())
    params = {"start-date": str(int(start)), "pending": "1"}
    if end:
        params["end-date"] = str(int(end))
    status, body = http_request("GET", f"{base}/accounts?{urllib.parse.urlencode(params)}", auth=auth)
    if status in (401, 403):
        raise FinanceError("SimpleFIN no longer accepts this app's access (it may have been revoked). "
                           "Disconnect and connect again with a new Setup Token.")
    if status == 402:
        raise FinanceError("SimpleFIN says your subscription needs attention (payment required). "
                           "Check your account on the SimpleFIN Bridge website.")
    if status != 200:
        raise FinanceError(f"SimpleFIN returned an error ({status}). Try again later.")
    try:
        data = json.loads(body)
    except ValueError:
        raise FinanceError("SimpleFIN sent something unexpected. Try again later.")
    # Problems SimpleFIN reports (e.g. "Capital One needs you to sign in again").
    messages = [str(m) for m in data.get("errors") or []]
    messages += [str(m.get("msg") or m) for m in data.get("errlist") or [] if isinstance(m, dict)]
    return {"accounts": data.get("accounts") or [], "messages": list(dict.fromkeys(messages))}
