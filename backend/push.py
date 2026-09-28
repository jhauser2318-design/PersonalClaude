"""Phone notifications (Web Push).

An iPhone (iOS 16.4+) can get notifications from a web app that's been added
to its Home Screen. The phone gives us a "subscription" (an address at
Apple's push service plus two keys); to notify it we encrypt the message for
that phone and post it there. Apple delivers it even when the app is closed.

The encryption (RFC 8291, "aes128gcm") and the sender identification (VAPID,
RFC 8292) are done here with the `cryptography` package, so there's nothing
else to install. Only the notifier on your PC sends pushes; the phone's
subscription details stay in your database.
"""
import base64
import json
import logging
import os
import struct
import time
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import urlparse

from .database import get_setting, register_schema, set_setting

log = logging.getLogger("push")

register_schema(
    """
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint   TEXT NOT NULL UNIQUE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        label      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_ok    TEXT,
        last_error TEXT,
        fails      INTEGER NOT NULL DEFAULT 0
    );
    """
)

SUBJECT = "mailto:life-control-center@users.noreply.github.com"  # who's sending (required by push services)
TTL = 12 * 3600          # a reminder older than 12 hours isn't worth showing
MAX_FAILS = 20           # give up on a phone that keeps failing (it's probably been reset)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# ---------------------------------------------------------------------------
# Keys (VAPID): made once, kept in your real database
# ---------------------------------------------------------------------------

def _keys(conn):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    pem = get_setting(conn, "push_vapid_private")
    if pem:
        private = serialization.load_pem_private_key(pem.encode(), password=None)
    else:
        private = ec.generate_private_key(ec.SECP256R1())
        pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()).decode()
        set_setting(conn, "push_vapid_private", pem)
        conn.commit()
    public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return private, public


def public_key(conn) -> str:
    """The key the phone needs to subscribe (applicationServerKey)."""
    return _b64(_keys(conn)[1])


def _vapid_header(private, public: bytes, endpoint: str) -> str:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    url = urlparse(endpoint)
    header = _b64(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = _b64(json.dumps({"aud": f"{url.scheme}://{url.netloc}", "exp": int(time.time()) + 12 * 3600,
                              "sub": SUBJECT}, separators=(",", ":")).encode())
    signing_input = f"{header}.{claims}".encode()
    r, s = decode_dss_signature(private.sign(signing_input, ec.ECDSA(hashes.SHA256())))
    token = f"{header}.{claims}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={token}, k={_b64(public)}"


# ---------------------------------------------------------------------------
# Encryption (RFC 8291)
# ---------------------------------------------------------------------------

def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt(message: bytes, p256dh: str, auth: str, salt: bytes | None = None, private=None) -> bytes:
    """Encrypt one message for one phone (a single aes128gcm record)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    ua_public = _unb64(p256dh)
    auth_secret = _unb64(auth)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    private = private or ec.generate_private_key(ec.SECP256R1())  # a fresh key for every message
    as_public = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = private.exchange(ec.ECDH(), ua_key)
    ikm = _hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    salt = salt or os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    ciphertext = AESGCM(cek).encrypt(nonce, message + b"\x02", None)  # \x02 = last (and only) record
    return salt + struct.pack("!IB", 4096, len(as_public)) + as_public + ciphertext


# ---------------------------------------------------------------------------
# Subscriptions (one per phone)
# ---------------------------------------------------------------------------

def subscribe(conn, sub: dict, label: str = "") -> dict:
    endpoint = (sub or {}).get("endpoint") or ""
    keys = (sub or {}).get("keys") or {}
    if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("That doesn't look like a push subscription")
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
                    label = excluded.label, fails = 0, last_error = NULL""",
                 (endpoint, keys["p256dh"], keys["auth"], (label or "Phone")[:60], now))
    return dict(conn.execute("SELECT id, label, created_at, last_ok FROM push_subscriptions WHERE endpoint = ?",
                             (endpoint,)).fetchone())


def unsubscribe(conn, endpoint: str | None = None, sub_id: int | None = None) -> None:
    if sub_id:
        conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
    elif endpoint:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))


def devices(conn) -> list[dict]:
    try:
        return [dict(r) for r in conn.execute(
            "SELECT id, label, created_at, last_ok, last_error, endpoint FROM push_subscriptions ORDER BY id")]
    except Exception:  # noqa: BLE001 (table not created yet)
        return []


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

def _post(endpoint: str, body: bytes, headers: dict) -> int:
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status
    except urllib.error.HTTPError as e:
        return e.code


def send_all(conn, messages: list[dict], poster=None, endpoint: str | None = None) -> int:
    """Send each message ({title, body, url, tag, urgent, badge}) to every phone (or just the one
    with `endpoint`). Returns how many pushes the push service accepted."""
    subs = [dict(r) for r in conn.execute("SELECT * FROM push_subscriptions ORDER BY id")] if devices(conn) else []
    if endpoint:
        subs = [s for s in subs if s["endpoint"] == endpoint]
    if not subs or not messages:
        return 0
    poster = poster or _post
    private, public = _keys(conn)
    sent = 0
    for s in subs:
        for m in messages:
            payload = json.dumps({k: m[k] for k in ("title", "body", "url", "tag", "badge") if m.get(k) is not None}).encode()
            try:
                body = encrypt(payload, s["p256dh"], s["auth"])
                status = poster(s["endpoint"], body, {
                    "Authorization": _vapid_header(private, public, s["endpoint"]),
                    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
                    "TTL": str(TTL), "Urgency": "high" if m.get("urgent") else "normal",
                })
            except Exception as e:  # noqa: BLE001 (no internet, bad keys...): try again next time
                status, err = 0, str(e)[:200]
            else:
                err = f"push service said {status}"
            now = datetime.now().isoformat(timespec="seconds")
            if 200 <= status < 300:
                sent += 1
                conn.execute("UPDATE push_subscriptions SET last_ok = ?, fails = 0, last_error = NULL WHERE id = ?",
                             (now, s["id"]))
            elif status in (404, 410):  # the phone unsubscribed or was reset: forget it
                conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (s["id"],))
                break
            else:
                log.warning("Push to %s failed: %s", s["label"], err)
                conn.execute("UPDATE push_subscriptions SET fails = fails + 1, last_error = ? WHERE id = ?", (err, s["id"]))
                conn.execute("DELETE FROM push_subscriptions WHERE id = ? AND fails >= ?", (s["id"], MAX_FAILS))
                break
    conn.commit()
    return sent
