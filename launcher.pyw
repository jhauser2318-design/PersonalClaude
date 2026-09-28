"""Life Control Center - desktop launcher (Windows).

The Desktop icon runs this file with pythonw.exe (Python without a black
console window). It:
  1. opens the app's own window (Microsoft Edge or Google Chrome "app mode":
     no tabs or address bar, so it looks like a normal program), showing a
     "Starting..." screen,
  2. checks GitHub for a newer version and installs it (see updater.py),
  3. starts the app's server quietly in the background; the window switches
     to the app as soon as it's ready,
  4. shuts the server down a few minutes after you close that window (the
     open window checks in every 15 seconds; when that stops, it's closed).

If an older copy of the app is still running (for example from before an
update), it's stopped first so you always get the current version.

If something goes wrong, details are written to data/app.log.
(start.bat still works too, and shows the server's messages in a window.)
"""
import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8000
URL = f"http://localhost:{PORT}"
DATA = ROOT / "data"
PROFILE = DATA / "browser-profile"  # the app window's own browser settings
LOG = DATA / "app.log"
SPLASH = ROOT / "frontend" / "splash.html"
LOCK_PORT = 47819  # held while a launcher is running, so two clicks don't start two apps
NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # Windows: don't flash a console for helpers

IDLE_LIMIT = int(os.environ.get("LCC_IDLE_LIMIT", 180))  # seconds without a check-in before the app stops

# Set when the launcher restarts itself after updating its own code.
AFTER_UPDATE = os.environ.get("LCC_AFTER_UPDATE") == "1"


def show_error(text: str) -> None:
    logging.error(text)
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, "Life Control Center", 0x10)
    except Exception:
        print(text)


def server_is_up() -> bool:
    try:
        with urllib.request.urlopen(f"{URL}/api/areas", timeout=1):
            return True
    except Exception:
        return False


def find_browser() -> Path | None:
    """Edge comes with Windows; Chrome is the fallback."""
    places = []
    for var in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if base:
            places += [Path(base) / "Microsoft/Edge/Application/msedge.exe",
                       Path(base) / "Google/Chrome/Application/chrome.exe"]
    return next((p for p in places if p.is_file()), None)


def open_window(browser: Path, target: str) -> None:
    subprocess.Popen([
        str(browser), f"--app={target}", f"--user-data-dir={PROFILE}",
        "--no-first-run", "--no-default-browser-check", "--window-size=1280,860",
    ])


def take_lock():
    """Returns a held socket if no other launcher is running, else None."""
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
        return lock
    except OSError:
        lock.close()
        return None


def server_info() -> dict | None:
    """Version and process id of the running app, or None if it's too old to say."""
    try:
        with urllib.request.urlopen(f"{URL}/api/app/info", timeout=2) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def installed_version() -> str | None:
    try:
        return json.loads((DATA / "version.json").read_text(encoding="utf-8")).get("sha")
    except Exception:
        return None


def stop_old_server(info: dict | None) -> None:
    """Stop an out-of-date copy of the app that's still running."""
    if info and info.get("pid"):
        try:
            os.kill(int(info["pid"]), 15)
        except Exception as e:
            logging.warning("Couldn't stop process %s (%s)", info["pid"], e)
    elif os.name == "nt":
        # Versions from before this check can't report their process id, so find
        # the Python program that's using the app's port and stop it.
        script = (f"Get-NetTCPConnection -LocalPort {PORT} -State Listen -ErrorAction SilentlyContinue | "
                  "Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { "
                  "$p = Get-Process -Id $_ -ErrorAction SilentlyContinue; "
                  "if ($p -and $p.ProcessName -like 'python*') { Stop-Process -Id $_ -Force } }")
        subprocess.run(["powershell", "-NoProfile", "-Command", script],
                       capture_output=True, timeout=30, creationflags=NO_WINDOW)
    for _ in range(40):  # wait up to 10 seconds for it to go away
        if not server_is_up():
            return
        time.sleep(0.25)


def start_server():
    """Run the web server in a background thread. Returns (server, thread)."""
    import uvicorn
    sys.path.insert(0, str(ROOT))
    os.chdir(ROOT)
    from backend.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_config=None, access_log=False))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return server, thread


def main() -> None:
    DATA.mkdir(exist_ok=True)
    if LOG.exists() and LOG.stat().st_size > 1_000_000:
        LOG.unlink()  # start a fresh log once it gets big
    # pythonw has no console, so send all messages to a log file instead.
    log_file = open(LOG, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log_file
    logging.basicConfig(stream=log_file, level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    logging.info("Launcher starting%s", " (after update)" if AFTER_UPDATE else "")

    browser = find_browser()

    if server_is_up():
        info = server_info()
        if info is not None and info.get("version") == installed_version():
            # The current version is already running: just open another window.
            if browser:
                open_window(browser, URL)
            else:
                webbrowser.open(URL)
            return
        logging.info("An older copy of the app is still running (%s); stopping it", info)
        stop_old_server(info)
        if server_is_up():
            show_error("An older copy of Life Control Center is still running and couldn't be "
                       "stopped. Please restart your computer, then open the app again.")
            return

    lock = take_lock()
    for _ in range(40):  # an old launcher we just stopped (or one restarting after an update) may still be exiting
        if lock:
            break
        time.sleep(0.25)
        lock = take_lock()
    if lock is None:
        return  # another click is starting the app right now

    # 1. Show the window straight away, with a "Starting..." screen.
    if browser and not AFTER_UPDATE:
        open_window(browser, SPLASH.as_uri())

    # 2. Get the newest version from GitHub.
    if not AFTER_UPDATE:
        import updater
        if updater.update():
            # The launcher itself changed: restart it so the new code runs.
            logging.info("Launcher updated; restarting it")
            lock.close()
            subprocess.Popen([sys.executable, str(ROOT / "launcher.pyw")], cwd=ROOT,
                             env={**os.environ, "LCC_AFTER_UPDATE": "1"})
            return

    # 3. Start the app.
    try:
        server, thread = start_server()
    except Exception as e:
        show_error(f"The app couldn't start:\n\n{e}\n\nDetails are in {LOG}")
        return
    for _ in range(60):  # wait up to 30 seconds
        if server_is_up() or not thread.is_alive():
            break
        time.sleep(0.5)
    if not server_is_up():
        show_error("The app couldn't start. Is another program using port 8000?\n\n"
                   f"Details are in {LOG}")
        return

    if browser is None:
        logging.info("No Edge/Chrome found; opening the default browser")
        webbrowser.open(URL)
        thread.join()  # keeps running until you sign out or restart
        return

    # 4. Keep running while the window is open. It checks in every 15 seconds
    #    (at least once a minute when minimized); after IDLE_LIMIT seconds of
    #    silence the window must be closed, so stop the app.
    from backend.main import seconds_since_ping
    while seconds_since_ping() < IDLE_LIMIT:
        time.sleep(5)
    logging.info("App window closed; stopping the server")
    server.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()
