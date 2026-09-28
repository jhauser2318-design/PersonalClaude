"""Running on your PC as a "home base" for your phone.

- Background mode: the app starts quietly when you sign in to Windows and
  keeps running after you close its window (a shortcut in your Startup
  folder runs "launcher.pyw --background"). The launcher reads
  data/host.json to know whether to keep going when no window is open.
- Phone access: Tailscale's "serve" feature gives this PC a private https
  address (like https://your-pc.tailnet-name.ts.net) that only your own
  devices signed in to your Tailscale account can open. It forwards to the
  app, which itself only listens on this computer.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from ... import config

HOST_FILE = config.PROJECT_ROOT / "data" / "host.json"
PORT = 8000
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
SHORTCUT_NAME = "Life Control Center (background).lnk"


class HostError(Exception):
    """A setup problem, with a message that's safe to show the user."""


# ---------------------------------------------------------------------------
# Background mode
# ---------------------------------------------------------------------------

def _read() -> dict:
    try:
        return json.loads(HOST_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def always_on() -> bool:
    return bool(_read().get("always_on"))


def _startup_shortcut() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if os.name != "nt" or not appdata:
        return None
    return Path(appdata) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / SHORTCUT_NAME


def _pythonw() -> str:
    exe = Path(sys.executable)
    w = exe.with_name("pythonw.exe")
    return str(w if w.exists() else exe)


SHORTCUT_PS = r"""
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($env:LCC_LNK)
$lnk.TargetPath = $env:LCC_PYW
$lnk.Arguments = '"' + $env:LCC_LAUNCHER + '" --background'
$lnk.WorkingDirectory = $env:LCC_ROOT
$lnk.IconLocation = $env:LCC_ICON
$lnk.Description = 'Starts Life Control Center in the background'
$lnk.Save()
"""


def set_always_on(on: bool) -> None:
    link = _startup_shortcut()
    if on and link is not None:
        link.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SHORTCUT_PS],
            env={**os.environ, "LCC_LNK": str(link), "LCC_PYW": _pythonw(),
                 "LCC_LAUNCHER": str(config.PROJECT_ROOT / "launcher.pyw"), "LCC_ROOT": str(config.PROJECT_ROOT),
                 "LCC_ICON": str(config.PROJECT_ROOT / "frontend" / "icon.ico")},
            capture_output=True, text=True, timeout=60, creationflags=NO_WINDOW)
        if result.returncode != 0:
            raise HostError("Windows didn't let the app add itself to startup. Details: " + result.stderr.strip()[:300])
    elif not on and link is not None:
        link.unlink(missing_ok=True)
    data = _read()
    data["always_on"] = bool(on)
    HOST_FILE.parent.mkdir(parents=True, exist_ok=True)
    HOST_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def background_status() -> dict:
    link = _startup_shortcut()
    return {"always_on": always_on(), "supported": os.name == "nt",
            "starts_with_windows": bool(link and link.exists())}


# ---------------------------------------------------------------------------
# Tailscale
# ---------------------------------------------------------------------------

def tailscale_exe() -> str | None:
    found = shutil.which("tailscale")
    if found:
        return found
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), r"C:\Program Files"):
        if base and (Path(base) / "Tailscale" / "tailscale.exe").exists():
            return str(Path(base) / "Tailscale" / "tailscale.exe")
    return None


def _ts(*args, timeout=20) -> subprocess.CompletedProcess:
    exe = tailscale_exe()
    if not exe:
        raise HostError("Tailscale isn't installed on this PC yet.")
    return subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)


def _serving(exe_ok: bool) -> bool:
    if not exe_ok:
        return False
    try:
        out = _ts("serve", "status", "--json")
        return out.returncode == 0 and f":{PORT}" in out.stdout
    except (HostError, subprocess.TimeoutExpired, OSError):
        return False


def tailscale_status() -> dict:
    """Where the Tailscale setup is at, step by step."""
    st = {"installed": False, "running": False, "account": None, "dns_name": None,
          "https_enabled": False, "serving": False, "url": None, "error": None}
    if not tailscale_exe():
        return st
    st["installed"] = True
    try:
        out = _ts("status", "--json")
        data = json.loads(out.stdout or "{}")
    except (subprocess.TimeoutExpired, OSError, ValueError) as e:
        st["error"] = f"Couldn't read Tailscale's status ({e})."
        return st
    st["running"] = data.get("BackendState") == "Running"
    user = (data.get("User") or {}).get(str((data.get("Self") or {}).get("UserID")), {})
    st["account"] = user.get("LoginName")
    dns = ((data.get("Self") or {}).get("DNSName") or "").rstrip(".")
    st["dns_name"] = dns or None
    st["https_enabled"] = bool(data.get("CertDomains"))
    st["serving"] = st["running"] and _serving(True)
    if dns and st["serving"]:
        st["url"] = f"https://{dns}"
    return st


def start_serving() -> dict:
    """Turn on phone access: tailscale serve --bg http://127.0.0.1:8000 (stays on after restarts)."""
    exe = tailscale_exe()
    if not exe:
        raise HostError("Install Tailscale on this PC first (step 2).")
    proc = subprocess.Popen([exe, "serve", "--bg", f"http://127.0.0.1:{PORT}"], stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, creationflags=NO_WINDOW)
    try:
        output, _ = proc.communicate(timeout=25)
    except subprocess.TimeoutExpired:
        # Tailscale is waiting for something to be switched on in your account.
        proc.kill()
        output, _ = proc.communicate()
    link = re.search(r"https://login\.tailscale\.com/\S+", output or "")
    status = tailscale_status()
    if status["serving"]:
        return status
    if link:
        return {**status, "enable_url": link.group(0).rstrip(".")}
    raise HostError("Tailscale didn't turn on phone access. What it said: " + (output or "").strip()[:400])


def stop_serving() -> None:
    try:
        _ts("serve", "reset")
    except HostError:
        pass
