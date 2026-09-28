"""Life Control Center - desktop launcher (Windows).

The Desktop icon runs this file with pythonw.exe (Python without a black
console window). It:
  1. starts the app's server quietly in the background,
  2. opens the app in its own window using Microsoft Edge (or Google Chrome)
     "app mode": no tabs or address bar, so it looks like a normal program,
  3. shuts the server down when you close that window.

If something goes wrong, details are written to data/app.log.
(start.bat still works too, and shows the server's messages in a window.)
"""
import logging
import os
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
NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW: don't flash a console when we run helpers


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


def window_is_open(browser: Path) -> bool:
    """True while any browser process is using the app window's profile."""
    query = (f"@(Get-CimInstance Win32_Process -Filter \"Name='{browser.name}'\" | "
             f"Where-Object {{ $_.CommandLine -like '*{PROFILE.name}*' }}).Count")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", query],
                             capture_output=True, text=True, timeout=20, creationflags=NO_WINDOW)
        return int(out.stdout.strip() or 0) > 0
    except Exception as e:
        logging.warning("Couldn't check for the app window (%s); stopping.", e)
        return False


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
    logging.info("Launcher starting")

    server = thread = None
    if not server_is_up():
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

    # Only shut the server down later if this launcher is the one that started it.
    owns_server = thread is not None and thread.is_alive()

    browser = find_browser()
    if browser is None:
        logging.info("No Edge/Chrome found; opening the default browser")
        webbrowser.open(URL)
        if owns_server:
            thread.join()  # keeps running until you sign out or restart
        return

    subprocess.Popen([
        str(browser), f"--app={URL}", f"--user-data-dir={PROFILE}",
        "--no-first-run", "--no-default-browser-check", "--window-size=1280,860",
    ])
    if not owns_server:
        return

    time.sleep(8)  # give the window time to appear
    while window_is_open(browser):
        time.sleep(3)
    logging.info("App window closed; stopping the server")
    server.should_exit = True
    thread.join(timeout=10)


if __name__ == "__main__":
    main()
