"""Keeps Life Control Center up to date with the latest version on GitHub.

The desktop launcher calls update() every time you open the app:
  1. ask GitHub which version is newest (one tiny request),
  2. if it's newer than what's installed, download it and copy it over,
  3. never touch your data (data/), your API key (.env), or the
     Python environment (.venv).

If you're offline or GitHub doesn't answer, it just skips the update and
the app opens normally.
"""
import hashlib
import io
import json
import logging
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

REPO = "jhauser2318-design/PersonalClaude"
BRANCH = "main"

ROOT = Path(__file__).resolve().parent
VERSION_FILE = ROOT / "data" / "version.json"
KEEP = {".venv", "data", ".env", ".git"}   # never overwritten by an update
NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # Windows: don't flash a console


def _ssl_contexts():
    """Normal certificate check first; then Mozilla's certificate list (certifi),
    which helps on computers whose certificate store Python can't use."""
    yield None
    try:
        import certifi
        yield ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return


def _get(url: str, timeout: float, attempts: int = 2) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "LifeControlCenter-updater",
        "Accept": "application/vnd.github+json",
    })
    last_error = None
    for attempt in range(attempts):
        for context in _ssl_contexts():
            try:
                with urllib.request.urlopen(req, timeout=timeout, context=context) as resp:
                    return resp.read()
            except urllib.error.URLError as e:
                last_error = e
                if isinstance(getattr(e, "reason", None), ssl.SSLError):
                    continue  # certificate problem: try the other certificate list
                break
            except (TimeoutError, OSError) as e:
                last_error = e
                break
        if isinstance(last_error, urllib.error.HTTPError) and last_error.code < 500 and last_error.code != 429:
            break  # retrying won't help
        time.sleep(1.5)
    raise last_error


def describe_error(e: Exception) -> str:
    """A plain-English reason, shown in the app and written to the log."""
    reason = getattr(e, "reason", e)
    if isinstance(e, urllib.error.HTTPError):
        if e.code in (403, 429):
            return "GitHub is limiting requests from your network right now. Try again in an hour."
        return f"GitHub answered with an error ({e.code})."
    if isinstance(reason, ssl.SSLError) or "CERTIFICATE" in str(reason).upper():
        return ("A secure connection to GitHub couldn't be verified. Security software "
                "(antivirus or firewall) may be inspecting web traffic.")
    if isinstance(reason, (TimeoutError, socket.timeout)) or "timed out" in str(reason).lower():
        return "GitHub took too long to answer. Check your internet connection and try again."
    if isinstance(reason, socket.gaierror):
        return "Couldn't find github.com. Check that you're connected to the internet."
    return f"Couldn't connect to GitHub ({reason})."


def latest_commit() -> str:
    """The id of the newest version on GitHub.

    Asks GitHub the same way `git` does (the address used for downloads), which,
    unlike GitHub's API, isn't limited to 60 checks an hour per network.
    """
    try:
        raw = _get(f"https://github.com/{REPO}.git/info/refs?service=git-upload-pack", timeout=15)
        for line in raw.decode("utf-8", "replace").splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[1] == f"refs/heads/{BRANCH}":
                sha = parts[0][-40:]
                if len(sha) == 40:
                    return sha
    except Exception as e:
        logging.info("Git-style version check failed (%s); trying GitHub's API", e)
    return json.loads(_get(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}", timeout=15))["sha"]


def _commit_message(sha: str) -> str:
    """What changed, for the "Updated to…" banner (optional; blank if unavailable)."""
    try:
        return json.loads(_get(f"https://api.github.com/repos/{REPO}/commits/{sha}",
                               timeout=8, attempts=1)).get("commit", {}).get("message", "")
    except Exception:
        return ""


def _digest(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def read_version() -> dict:
    try:
        return json.loads(VERSION_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_version(data: dict) -> None:
    VERSION_FILE.parent.mkdir(exist_ok=True)
    VERSION_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _summary(message: str) -> str:
    """A friendly one-line description of an update, from its commit message."""
    lines = [line.strip() for line in message.splitlines() if line.strip()]
    if not lines:
        return "Latest version"
    # A merged pull request's message is "Merge pull request #N from ..." then its title.
    if lines[0].startswith("Merge pull request") and len(lines) > 1:
        return lines[1]
    return lines[0]


def update() -> dict:
    """Install the newest version if there is one.

    Returns {"updated": bool, "launcher_changed": bool, "error": str | None}.
    launcher_changed means the launcher's own code changed, so it should
    restart itself.
    """
    result = {"updated": False, "launcher_changed": False, "error": None}
    try:
        latest = latest_commit()
    except Exception as e:
        result["error"] = describe_error(e)
        logging.warning("Update check failed: %s (%r)", result["error"], e)
        return result

    if read_version().get("sha") == latest:
        logging.info("Already up to date (%s)", latest[:7])
        return result

    logging.info("Updating to %s", latest[:7])
    watched = ["launcher.pyw", "updater.py", "requirements.txt"]
    before = {name: _digest(ROOT / name) for name in watched}

    try:
        archive = _get(f"https://codeload.github.com/{REPO}/zip/{latest}", timeout=60)
        with tempfile.TemporaryDirectory() as tmp:
            zipfile.ZipFile(io.BytesIO(archive)).extractall(tmp)
            src = next(Path(tmp).iterdir())  # the ZIP holds one top-level folder
            for path in sorted(src.rglob("*")):
                rel = path.relative_to(src)
                if rel.parts[0] in KEEP:
                    continue
                dest = ROOT / rel
                if path.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                else:
                    shutil.copy2(path, dest)
    except Exception as e:
        logging.warning("Update failed, keeping the current version (%s)", e)
        reason = describe_error(e) if isinstance(e, urllib.error.URLError) else str(e)
        result["error"] = f"The update couldn't be installed ({reason}). The current version is still in place."
        return result

    if _digest(ROOT / "requirements.txt") != before["requirements.txt"]:
        logging.info("Installing new packages")
        python = Path(sys.executable).with_name("python.exe")
        if not python.is_file():
            python = Path(sys.executable)
        subprocess.run([str(python), "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
                        "-r", str(ROOT / "requirements.txt")], creationflags=NO_WINDOW, timeout=900)

    _write_version({
        "sha": latest,
        "summary": _summary(_commit_message(latest)),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "show_notice": True,
    })
    logging.info("Update installed")
    result["updated"] = True
    result["launcher_changed"] = (_digest(ROOT / "launcher.pyw") != before["launcher.pyw"]
                                  or _digest(ROOT / "updater.py") != before["updater.py"])
    return result
