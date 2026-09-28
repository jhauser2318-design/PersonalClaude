"""Follow-ups & notifications: things to follow up on, reminders, and desktop notifications."""
import threading

from .routes import router


def on_startup(conn):
    from ... import notify
    from . import service
    if service.get_settings(conn)["notify_enabled"] != "1":
        return

    def check():
        # If notifications are on but the background check went missing (e.g.
        # after a reinstall), set it up again quietly.
        try:
            if notify.task_installed() is False:
                notify.install_task()
            else:
                notify.register_app()
        except Exception:  # noqa: BLE001 (the Follow-ups page shows the status)
            pass

    threading.Thread(target=check, daemon=True).start()
