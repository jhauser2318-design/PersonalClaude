"""Signing in from other devices (your phone).

The app's own window on your PC never needs a passcode. Requests that come
in through Tailscale (your phone) do: the first time, you type the passcode
you set on the PC, and that device is remembered for 90 days.

How a request is recognized as "from another device": the app only listens
on this computer (127.0.0.1), so the only way in from outside is through
Tailscale's secure proxy ("tailscale serve"), and that proxy always adds
an X-Forwarded-For header (plus Tailscale-User-* headers).
"""
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta

from ...database import get_setting, register_schema, set_setting
from ..goals.service import ValidationError, now_iso

COOKIE = "lcc_session"
SESSION_DAYS = 90
MIN_PASSCODE = 6
MAX_FAILURES = 5          # wrong passcodes in a row before a pause
LOCKOUT_SECONDS = 600
ITERATIONS = 200_000

register_schema(
    """
    CREATE TABLE IF NOT EXISTS devices (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_seen  TEXT NOT NULL,
        expires_at TEXT NOT NULL
    );
    """
)

_failures = {"count": 0, "until": 0.0}


def is_remote(headers) -> bool:
    """True when a request came through Tailscale (i.e. from another device)."""
    if "x-forwarded-for" in headers or "tailscale-user-login" in headers:
        return True
    host = (headers.get("host") or "").split(":")[0].lower()
    return host.endswith(".ts.net")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Passcode
# ---------------------------------------------------------------------------

def has_passcode(conn) -> bool:
    return bool(get_setting(conn, "auth_passcode"))


def set_passcode(conn, passcode: str) -> None:
    passcode = (passcode or "").strip()
    if len(passcode) < MIN_PASSCODE:
        raise ValidationError(f"Use at least {MIN_PASSCODE} characters (numbers are fine).")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", passcode.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    set_setting(conn, "auth_passcode", f"pbkdf2${ITERATIONS}${salt}${digest}")
    # A new passcode signs every other device out.
    conn.execute("DELETE FROM devices")


def check_passcode(conn, passcode: str) -> bool:
    stored = get_setting(conn, "auth_passcode") or ""
    try:
        _, iters, salt, digest = stored.split("$")
    except ValueError:
        return False
    test = hashlib.pbkdf2_hmac("sha256", (passcode or "").strip().encode(), bytes.fromhex(salt), int(iters)).hex()
    return hmac.compare_digest(test, digest)


# ---------------------------------------------------------------------------
# Remembered devices (sessions)
# ---------------------------------------------------------------------------

def device_name(user_agent: str) -> str:
    ua = user_agent or ""
    for key, name in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android phone"),
                      ("Macintosh", "Mac"), ("Windows", "Windows PC")):
        if key in ua:
            return name
    return "Device"


def login(conn, passcode: str, user_agent: str) -> str:
    """Returns a new session token, or raises ValidationError."""
    now = time.time()
    if _failures["until"] > now:
        mins = int((_failures["until"] - now) // 60) + 1
        raise ValidationError(f"Too many wrong tries. Wait {mins} minute{'s' if mins != 1 else ''} and try again.")
    if not has_passcode(conn):
        raise ValidationError("No passcode is set yet. On your PC, open Settings → Phone & devices and set one.")
    if not check_passcode(conn, passcode):
        _failures["count"] += 1
        if _failures["count"] >= MAX_FAILURES:
            _failures.update(count=0, until=now + LOCKOUT_SECONDS)
        raise ValidationError("That passcode isn't right.")
    _failures.update(count=0, until=0.0)
    token = secrets.token_urlsafe(32)
    stamp = now_iso()
    expires = (datetime.now() + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds")
    conn.execute("INSERT INTO devices (token_hash, name, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?)",
                 (_hash_token(token), device_name(user_agent), stamp, stamp, expires))
    return token


def session(conn, token: str | None) -> dict | None:
    """The remembered device for this token, or None. Refreshes last_seen now and then."""
    if not token:
        return None
    row = conn.execute("SELECT * FROM devices WHERE token_hash = ?", (_hash_token(token),)).fetchone()
    if not row or row["expires_at"] < now_iso():
        return None
    if row["last_seen"] < (datetime.now() - timedelta(minutes=30)).isoformat(timespec="seconds"):
        conn.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (now_iso(), row["id"]))
    return dict(row)


def logout(conn, token: str | None) -> None:
    if token:
        conn.execute("DELETE FROM devices WHERE token_hash = ?", (_hash_token(token),))


def list_devices(conn) -> list[dict]:
    return [{k: r[k] for k in ("id", "name", "created_at", "last_seen", "expires_at")}
            for r in conn.execute("SELECT * FROM devices WHERE expires_at >= ? ORDER BY last_seen DESC", (now_iso(),))]


def forget_device(conn, device_id: int) -> None:
    conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))
