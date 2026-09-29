import json, os, sys, tempfile
from types import SimpleNamespace as NS
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"; os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules
from backend.database import init_db
init_db()
from backend import ai_models
import anthropic
seen = []
class M:
    def create(self, **kw):
        seen.append(kw)
        if "format" in (kw.get("output_config") or {}):
            return NS(stop_reason="end_turn", content=[NS(type="text", text=json.dumps({"intent": "answer", "reply": "hi", "actions": []}))])
        return NS(stop_reason="end_turn", content=[NS(type="text", text="ok")])
anthropic.Anthropic = lambda **kw: NS(beta=NS(messages=M()))
from backend.modules.assistant.claude_client import ask_claude
def shape(kw): return {k: kw.get(k) for k in ("model", "output_config", "betas", "fallbacks")} | {"format": "format" in (kw.get("output_config") or {})}
print("defaults:", {r["id"]: r["model"] for r in ai_models.choices()["roles"]})
for m in ("claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"):
    ai_models.set_model("command", m)
    ask_claude("hi", "ctx", [])
    s = shape(seen[-1]); s["output_config"] = {k: (v if k != "format" else "...") for k, v in (s["output_config"] or {}).items()}
    print(m, "->", s)
try: ai_models.set_model("command", "gpt-5")
except ValueError as e: print("bad:", e)
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as c:
    print(c.put("/api/command/models", json={"role": "email", "model": "claude-opus-5"}).json()["roles"][1])
    print(c.put("/api/command/models", json={"role": "email", "model": "x"}).status_code)
    print(c.get("/api/command/status").json())
