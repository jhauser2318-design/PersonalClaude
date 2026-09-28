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
import subprocess
import sys
import tempfile
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


def _get(url: str, timeout: float) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "LifeControlCenter-updater",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


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
        info = json.loads(_get(f"https://api.github.com/repos/{REPO}/commits/{BRANCH}", timeout=6))
        latest = info["sha"]
    except Exception as e:
        logging.info("Update check skipped (%s)", e)
        result["error"] = "Couldn't reach GitHub to check for updates. Are you online?"
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
        result["error"] = f"The update couldn't be installed ({e}). The current version is still in place."
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
        "summary": _summary(info.get("commit", {}).get("message", "")),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "show_notice": True,
    })
    logging.info("Update installed")
    result["updated"] = True
    result["launcher_changed"] = (_digest(ROOT / "launcher.pyw") != before["launcher.pyw"]
                                  or _digest(ROOT / "updater.py") != before["updater.py"])
    return result
