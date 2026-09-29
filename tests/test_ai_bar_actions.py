import os, sys, tempfile, json
from datetime import date, timedelta
tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
import backend.modules  # noqa
from backend.database import get_db, init_db
init_db()
from backend.modules.assistant import actions
from backend.modules.assistant.claude_client import BLANKS, normalize_action, build_context, ACTION_SCHEMA, RESPONSE_SCHEMA
from backend.modules.assistant.routes import extra_context
from backend.modules.habits import service as habits
T = date.today().isoformat()
def A(**kw):
    a = {k: v for k, v in BLANKS.items()}; a.update(type=kw.pop("type"), link_to_new_goal=False); a.update(kw)
    assert set(a) == set(ACTION_SCHEMA["properties"]), set(ACTION_SCHEMA["properties"]) ^ set(a)
    return normalize_action(a)
with get_db() as c:
    habits.create_habit(c, {"title": "Gym", "area": "health", "frequency": "daily"})
def run(acts):
    with get_db() as c:
        undo, summary = actions.apply_actions(c, acts)
        lid = actions.log_command(c, "x", "y", undo)
    print(*summary, sep="\n")
    return lid
lid = run([A(type="add_schedule_block", start="19:00", end="21:00", title="CPA study", area="education"),
           A(type="add_schedule_block", date=T, start=f"{T}T06:00", title="Gym")])
with get_db() as c:
    blocks = c.execute("SELECT * FROM schedule_blocks").fetchall(); assert len(blocks) == 2 and blocks[1]["end"] == "07:00"
    bid = blocks[0]["id"]
lid2 = run([A(type="update_schedule_block", block_id=bid, done="yes"), A(type="remove_schedule_block", block_id=blocks[1]["id"])])
with get_db() as c:
    print(actions.undo_command(c, lid2)); assert len(c.execute("SELECT * FROM schedule_blocks").fetchall()) == 2
    assert c.execute("SELECT done FROM schedule_blocks WHERE id=?", (bid,)).fetchone()[0] == 0
lid3 = run([A(type="add_person", title="Mom", date="0000-05-11", amount=7, description="family"),
            A(type="log_contact", person="mom", title="call", note="trip plans"),
            A(type="log_cpa_score", title="FAR", amount=74, note="Becker PE 1"),
            A(type="log_fun", title="Bowling with Sam", description="friends", amount=5, person="Sam", location="Lucky Strike", price=30),
            A(type="add_fun_idea", title="Axe throwing", description="friends")])
with get_db() as c:
    ctx = build_context([], [], [], {}, [], [], extra_context(c))
    print(ctx[ctx.index("SCHEDULE"):])
    assert c.execute("SELECT COUNT(*) FROM fun_log").fetchone()[0] == 1
    print(actions.undo_command(c, lid3))
    for t in ("people", "interactions", "cpa_scores", "fun_log", "fun_ideas"):
        assert c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0, t
    print(actions.undo_command(c, lid)); assert c.execute("SELECT COUNT(*) FROM schedule_blocks").fetchone()[0] == 0
print(len(json.dumps(RESPONSE_SCHEMA)), "schema chars;", len(ACTION_SCHEMA["properties"]), "fields")
print("actions ok")
