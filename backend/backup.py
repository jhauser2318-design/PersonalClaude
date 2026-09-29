"""Backups of your data.

Everything you enter lives in one file, data/life.db. Once a day (and on
demand from Settings) a copy is saved in data/backups, keeping the last 14.
If you pick an extra folder in Settings (for example your OneDrive folder),
each backup is copied there too, so it survives even if this PC doesn't.

Restoring first saves a copy of what's there now, so a restore can itself
be undone. Backups use SQLite's own backup feature, which is safe while the
app is running.

Also here: the daily tidy-up (old notification history and undo history).
"""
import logging
import re
import shutil
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from .config import DATABASE_PATH
from .database import connect, get_setting, set_setting

log = logging.getLogger("backup")

BACKUP_DIR = DATABASE_PATH.parent / "backups"
KEEP = 14
NAME = re.compile(r"^life-(\d{4}-\d{2}-\d{2})(?:-(\d{6,9}))?(-before-restore)?\.db$")
PRUNE_DAYS = 90


def _copy_db(src: Path, dest: Path) -> None:
    """Copy a SQLite database safely (even while it's in use)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    s = sqlite3.connect(src, timeout=30)
    d = sqlite3.connect(tmp)
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()
    tmp.replace(dest)


def extra_folder(conn) -> Path | None:
    folder = (get_setting(conn, "backup_folder") or "").strip()
    return Path(folder) if folder else None


def list_backups() -> list[dict]:
    out = []
    if BACKUP_DIR.exists():
        for p in BACKUP_DIR.glob("life-*.db"):
            m = NAME.match(p.name)
            if m:
                out.append({"name": p.name, "date": m[1], "size": p.stat().st_size,
                            "saved_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
                            "before_restore": bool(m[3])})
    return sorted(out, key=lambda b: b["saved_at"], reverse=True)


def _prune(folder: Path) -> None:
    files = sorted((p for p in folder.glob("life-*.db") if NAME.match(p.name)),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files[KEEP:]:
        try:
            p.unlink()
        except OSError:
            pass


def backup_now(reason: str = "") -> dict:
    """Save a backup now. Returns {"name", "extra": path or None, "extra_error": ...}."""
    if not DATABASE_PATH.exists():
        return {"name": None}
    stamp = datetime.now()
    # Milliseconds in the name, so two backups in the same second never overwrite each other.
    name = f"life-{stamp:%Y-%m-%d}-{stamp:%H%M%S}{stamp.microsecond // 1000:03d}{'-before-restore' if reason == 'restore' else ''}.db"
    dest = BACKUP_DIR / name
    _copy_db(DATABASE_PATH, dest)
    _prune(BACKUP_DIR)
    result = {"name": name, "extra": None, "extra_error": None}
    conn = connect(real=True)
    try:
        folder = extra_folder(conn)
        set_setting(conn, "backup_last", stamp.isoformat(timespec="seconds"))
        conn.commit()
    finally:
        conn.close()
    if folder:
        try:
            target = folder / "Life Control Center backups"
            target.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, target / name)
            _prune(target)
            result["extra"] = str(target)
        except OSError as e:
            result["extra_error"] = f"Couldn't copy to {folder}: {e}"
            log.warning(result["extra_error"])
    return result


def daily() -> bool:
    """Once a day: back up, then tidy old history. Returns True if it ran."""
    if not DATABASE_PATH.exists():
        return False
    conn = connect(real=True)
    try:
        if (get_setting(conn, "backup_day") or "") == date.today().isoformat():
            return False
        set_setting(conn, "backup_day", date.today().isoformat())
        conn.commit()
    finally:
        conn.close()
    try:
        backup_now()
    except Exception as e:  # noqa: BLE001 (never stop the app over a backup)
        log.warning("Daily backup failed: %s", e)
    try:
        tidy()
    except Exception as e:  # noqa: BLE001
        log.warning("Tidy-up failed: %s", e)
    return True


def restore(name: str) -> dict:
    """Put a backup back in place (after saving what's there now)."""
    m = NAME.match(name or "")
    src = BACKUP_DIR / name
    if not m or not src.exists():
        raise ValueError("That backup doesn't exist")
    safety = backup_now("restore")
    # Copy the backup's contents into the live database (safe with open connections).
    s = sqlite3.connect(src)
    d = sqlite3.connect(DATABASE_PATH, timeout=30)
    try:
        s.backup(d)
    finally:
        d.close()
        s.close()
    return {"restored": name, "saved_current_as": safety["name"]}


# ---------------------------------------------------------------------------
# Tidy-up: history that would otherwise grow forever
# ---------------------------------------------------------------------------

OLD_TABLES = ["workout_sets", "workouts", "body_weight", "health_daily", "health_workouts", "meals", "recipes"]


def tidy(conn=None) -> dict:
    own = conn is None
    conn = conn or connect(real=True)
    cutoff = (datetime.now() - timedelta(days=PRUNE_DAYS)).isoformat(timespec="seconds")
    out = {}
    try:
        for table, where in [
            ("notifications", "created_at < ? AND delivered_at IS NOT NULL"),
            ("command_log", "created_at < ?"),
            ("reminders", "repeat = 'once' AND fired_at IS NOT NULL AND fired_at < ?"),
        ]:
            try:
                out[table] = conn.execute(f"DELETE FROM {table} WHERE {where}", (cutoff,)).rowcount
            except sqlite3.OperationalError:
                pass
        # Pages that were removed (Workouts, Meals): drop their leftover tables once,
        # after a backup exists that still has them.
        if get_setting(conn, "old_tables_dropped") != "1" and list_backups():
            for t in OLD_TABLES:
                conn.execute(f"DROP TABLE IF EXISTS {t}")
            set_setting(conn, "old_tables_dropped", "1")
            out["dropped_old_tables"] = True
        conn.commit()
    finally:
        if own:
            conn.close()
    return out


def status() -> dict:
    conn = connect(real=True)
    try:
        folder = extra_folder(conn)
        last = get_setting(conn, "backup_last")
    finally:
        conn.close()
    return {"last": last, "folder": str(folder) if folder else "", "backups": list_backups(),
            "location": str(BACKUP_DIR), "suggested_folder": _suggest_folder()}


def _suggest_folder() -> str:
    home = Path.home()
    for name in ("OneDrive", "OneDrive - Personal", "Dropbox", "Google Drive", "iCloudDrive"):
        if (home / name).is_dir():
            return str(home / name)
    return ""
