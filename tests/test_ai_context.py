"""The AI bar only gets open items plus recently finished ones, and its instructions are cached."""
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backend.modules  # noqa: F401,E402
from backend.database import get_db, init_db  # noqa: E402
from backend.modules.assistant import claude_client  # noqa: E402
from backend.modules.assistant.routes import relevant  # noqa: E402
from backend.modules.goals import service as goals  # noqa: E402

init_db()
old = (date.today() - timedelta(days=40)).isoformat()
with get_db() as c:
    goals.create_task(c, {"title": "Open task", "area": "work"})
    goals.create_task(c, {"title": "Done recently", "area": "work", "done": True})
    t = goals.create_task(c, {"title": "Done long ago", "area": "work", "done": True})
    c.execute("UPDATE tasks SET done_at = ?, updated_at = ? WHERE id = ?", (old + "T10:00", old + "T10:00", t["id"]))
    g, tasks, items, fups = relevant(goals.list_goals(c), goals.list_tasks(c), [], [])
assert [x["title"] for x in tasks] == ["Open task", "Done recently"], [x["title"] for x in tasks]

# The request marks the long system prompt for caching.
sent = {}


class FakeMessages:
    def create(self, **kw):
        sent.update(kw)
        raise claude_client.anthropic.APIConnectionError(request=None)


class FakeClient:
    def __init__(self, **kw):
        self.beta = type("B", (), {"messages": FakeMessages()})()


claude_client.anthropic.Anthropic = FakeClient
try:
    claude_client.ask_claude("hi", "ctx", [])
except claude_client.AssistantError:
    pass
assert isinstance(sent["system"], list) and sent["system"][0]["cache_control"] == {"type": "ephemeral"}, sent.get("system")
assert sent["system"][0]["text"] == claude_client.SYSTEM_PROMPT
print("ai context ok")
