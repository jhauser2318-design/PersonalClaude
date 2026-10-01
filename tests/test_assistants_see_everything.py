"""Each AI assistant gets the data it needs from every part of the app (on the demo data),
and the demo data has no missing months."""
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

os.environ["DATABASE_PATH"] = f"{tempfile.mkdtemp()}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backend.modules  # noqa: F401,E402
from backend.database import get_db, init_db  # noqa: E402
from backend.demo.seed import seed  # noqa: E402
from backend.modules.assistant import claude_client  # noqa: E402
from backend.modules.assistant.routes import extra_context, relevant  # noqa: E402
from backend.modules.email import assistant as email_assistant  # noqa: E402
from backend.modules.finances import assistant as fin  # noqa: E402
from backend.modules.followups import service as fu  # noqa: E402
from backend.modules.goals import service as goals  # noqa: E402
from backend.modules.habits import service as habits  # noqa: E402
from backend.modules.shopping import service as shopping  # noqa: E402

init_db()
with get_db() as c:
    seed(c)
    c.execute("UPDATE people SET email = 'mom@example.com' WHERE name = 'Mom'")
    g, t, i, f = relevant(goals.list_goals(c), goals.list_tasks(c), shopping.list_items(c), fu.list_followups(c))
    ctx = claude_client.build_context(g, t, habits.list_habits(c), {"connected": False}, i, f, extra_context(c))
    fctx = fin._context(c)
    rent_months = [r[0][:7] for r in c.execute("SELECT posted FROM fin_transactions WHERE description LIKE '%PARKVIEW%' ORDER BY posted")]

# AI bar: every page's data
for section in ("GOALS", "TASKS", "ROUTINES", "CALENDAR", "SHOPPING", "FOLLOW-UPS", "SCHEDULE", "PEOPLE", "CPA EXAM",
                "FUN", "HOME MAINTENANCE", "BILLS you added", "SAVINGS GOALS"):
    assert section in ctx, f"AI bar is missing {section}"
# Routing: bill and savings questions go to the finance assistant, not email
prompt = claude_client.SYSTEM_PROMPT
assert '"what bills are due this week?"' in prompt and "savings goals" in prompt.split('5. intent "finance"')[1][:600]
assert '"any bills due?"' not in prompt

# Finance assistant: accounts, budgets, income, loans, bills, subscriptions, savings, rules
for section in ("ACCOUNTS", "MONTHLY BUDGETS", "INCOME PER DAY", "LOANS", "BILLS:", "SUBSCRIPTIONS:", "SAVINGS GOALS", "RULES"):
    assert section in fctx, f"finance assistant is missing {section}"
assert "Parkview Apartments" in json.dumps(json.loads(fin._run_tool("bills_calendar", {"month": date.today().strftime("%Y-%m")}, {"changes": []})))
assert "Spotify" in json.loads(fin._run_tool("subscriptions", {}, {"changes": []}))["marked_to_cancel"]
assert {t["name"] for t in fin.TOOLS} >= {"get_totals", "spending_breakdown", "find_transactions", "recurring_charges",
                                          "bills_calendar", "subscriptions", "set_budget", "set_category", "loan_forecast", "add_rule"}

# Email assistant: contacts from People
assert "Mom (family) <mom@example.com>" in email_assistant._contacts()

# Demo data: four months in a row, none skipped
y, m = date.today().year, date.today().month
expected = []
for back in range(3, -1, -1):
    yy, mm = divmod(y * 12 + m - 1 - back, 12)
    expected.append(f"{yy:04d}-{mm + 1:02d}")
assert rent_months == expected, (rent_months, expected)
print("assistants see everything ok")
