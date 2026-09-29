"""App-wide search over the demo data."""
import os
import sys
import tempfile
from pathlib import Path

os.environ["DATABASE_PATH"] = f"{tempfile.mkdtemp()}/life.db"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backend.modules  # noqa: F401,E402
from fastapi.testclient import TestClient  # noqa: E402
from backend.database import get_db, init_db  # noqa: E402
from backend.demo.seed import seed  # noqa: E402
from backend.main import app  # noqa: E402

init_db()
with get_db() as c:
    seed(c)
client = TestClient(app)
groups = {g["group"]: g["items"] for g in client.get("/api/search?q=sam").json()}
assert {"People", "Fun", "Follow-ups"} <= set(groups), groups.keys()
assert groups["People"][0]["link"] == "people"
assert client.get("/api/search?q=h").json() == []  # too short
assert client.get("/api/search?q=%25").json() is not None  # a % sign doesn't break it
hvac = client.get("/api/search?q=hvac").json()
assert hvac[0]["group"] == "Home maintenance" and hvac[0]["items"][0]["link"] == "home"
print("search ok")
