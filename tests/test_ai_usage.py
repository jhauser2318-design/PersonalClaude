import json, os, sys, tempfile
from types import SimpleNamespace as NS
from datetime import date, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"; os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules
from backend.database import init_db, get_db
init_db()
from backend import ai_models, demo
import anthropic
def resp(model, i, o, cw=0, cr=0, text=None):
    return NS(stop_reason="end_turn", model=model, usage=NS(input_tokens=i, output_tokens=o, cache_creation_input_tokens=cw, cache_read_input_tokens=cr),
              content=[NS(type="text", text=text or json.dumps({"intent": "answer", "reply": "ok", "actions": []}))])
class M:
    def create(self, **kw): return resp(kw["model"], 7000, 900)
anthropic.Anthropic = lambda **kw: NS(beta=NS(messages=M()))
from backend.modules.assistant.claude_client import ask_claude
print("cost sonnet 7000/900:", round(ai_models.cost_of("claude-sonnet-5", 7000, 900), 5), "opus:", round(ai_models.cost_of("claude-opus-5", 7000, 900), 5),
      "cache read 5000:", round(ai_models.cost_of("claude-sonnet-5", 0, 0, 0, 5000), 5))
for _ in range(3): ask_claude("hi", "ctx", [])
demo.enable(); ask_claude("demo question", "ctx", []); demo.disable()   # still recorded in the real DB
# older rows for last month / 30-day pace
with get_db() as c:
    for d, cost in [(20, 0.05), (40, 0.30)]:
        c.execute("INSERT INTO ai_usage (ts, role, model, cost) VALUES (?, 'email', 'claude-sonnet-5', ?)", ((date.today() - timedelta(days=d)).isoformat() + "T10:00:00", cost))
ai_models.record("finance", resp("claude-haiku-4-5", 1000, 100), "claude-sonnet-5")  # served model wins
ai_models.record("finance", NS(), "x")  # no usage: ignored
u = ai_models.usage_summary()
print("today", u["today"], "month", u["month"]["cost"], "last30", u["last_30_days"]["cost"], "per_day", u["per_day"])
print("roles", [(r["name"], r["requests"], r["avg_cost"]) for r in u["roles"]], "models", u["models"])
ai_models.set_credits(5, (date.today() - timedelta(days=25)).isoformat())
print("credits", ai_models.usage_summary()["credits"])
ai_models.set_credits(None); print("cleared", ai_models.usage_summary()["credits"])
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as c:
    print(c.get("/api/command/usage").status_code, c.put("/api/command/usage/credits", json={"amount": 5}).json()["credits"]["left"])
print("ALL OK")
