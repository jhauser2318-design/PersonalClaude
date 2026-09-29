"""End-to-end test of the Finances module with fake SimpleFIN and fake Claude."""
import base64, json, os, random, sys, tempfile, time
from datetime import date, datetime, timedelta
from types import SimpleNamespace as NS

tmp = tempfile.mkdtemp()
os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
os.environ["ANTHROPIC_API_KEY"] = "sk-test"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from backend import config
config.PROJECT_ROOT = __import__("pathlib").Path(tmp)
from backend.modules.finances import simplefin, service, assistant, sync
simplefin.DATA_FILE = config.PROJECT_ROOT / "data" / "simplefin.json"
from backend.database import get_db, init_db
from backend import database
init_db()

random.seed(4)
today = date.today()
def ts(d): return int(datetime.combine(d, datetime.min.time()).timestamp()) + 43200
def txs():
    chk, cap, disc, savor = [], [], [], []
    n = 0
    def add(lst, d, amt, desc, pending=False):
        nonlocal n; n += 1
        lst.append({"id": f"T{n}", "posted": 0 if pending else ts(d), "transacted_at": ts(d), "amount": f"{amt:.2f}",
                    "description": desc, "payee": "", "memo": "", "pending": pending})
    for i in range(95):
        d = today - timedelta(days=94 - i)
        if d.weekday() == 4 and (d.toordinal() // 7) % 2 == 0: add(chk, d, 2450.00, "ACME CORP PAYROLL PPD ID 99887")
        if d.day == 1: add(chk, d, -1650, "ZELLE PAYMENT TO LANDLORD RENT")
        if d.day == 5: add(disc, d, -15.49, "NETFLIX.COM 866-579-7172 CA")
        if d.day == 12: add(savor, d, -11.99, "SPOTIFY USA 877-778-1161")
        if d.day == 18: add(chk, d, -85.20, "EVERGY ELECTRIC WEB PMT")
        if random.random() < .5: add(savor, d, -round(random.uniform(4, 9), 2), f"STARBUCKS STORE #{random.randint(1000,9999)} KANSAS CITY MO")
        if random.random() < .25: add(disc, d, -round(random.uniform(40, 160), 2), f"HY-VEE #{random.randint(100,999)} OVERLAND PARK KS")
        if random.random() < .15: add(savor, d, -round(random.uniform(10, 80), 2), f"AMZN Mktp US*{random.randint(10000,99999)}AB")
        if d.day == 20:
            add(chk, d, -420.55, "DISCOVER E-PAYMENT 1234"); add(disc, d + timedelta(days=1), 420.55, "INTERNET PAYMENT - THANK YOU")
    add(savor, today, -23.10, "CHIPOTLE 1234", pending=True)
    add(savor, today - timedelta(days=3), 25.00, "AMZN Mktp US refund")
    bal = lambda l, s: f"{s + sum(float(t['amount']) for t in l):.2f}"
    return [
        {"org": {"name": "Commerce Bank", "domain": "commercebank.com"}, "id": "ACT-1", "name": "Commerce Checking",
         "currency": "USD", "balance": bal(chk, 3000), "available-balance": bal(chk, 3000), "balance-date": ts(today), "transactions": chk},
        {"org": {"name": "Capital One"}, "id": "ACT-2", "name": "360 Performance Savings", "currency": "USD",
         "balance": "8200.00", "balance-date": ts(today), "transactions": cap},
        {"org": {"name": "Discover"}, "id": "ACT-3", "name": "Discover It Card", "currency": "USD",
         "balance": bal(disc, -300), "balance-date": ts(today), "transactions": disc},
        {"org": {"name": "Capital One"}, "id": "ACT-4", "name": "SavorOne", "currency": "USD",
         "balance": bal(savor, -150), "balance-date": ts(today), "transactions": savor},
    ]

ACCOUNTS = txs()
calls = []
def fake_http(method, url, *, auth=None, timeout=60):
    calls.append((method, url, auth))
    if url == "https://bridge.example/simplefin/claim/abc":
        if method != "POST": return 405, ""
        if getattr(fake_http, "claimed", False): return 403, "Forbidden"
        fake_http.claimed = True
        return 200, "https://u%40x:p4ss@bridge.example/simplefin"
    if url.startswith("https://bridge.example/simplefin/accounts?"):
        assert auth == "u@x:p4ss", auth
        start = int(url.split("start-date=")[1].split("&")[0])
        out = []
        for a in ACCOUNTS:
            a2 = dict(a); a2["transactions"] = [t for t in a["transactions"] if (t["posted"] or t["transacted_at"]) >= start]
            out.append(a2)
        return 200, json.dumps({"errors": ["Capital One: please re-authenticate"], "accounts": out})
    return 404, ""
simplefin.http_request = fake_http

# --- fake Claude ---
def categorize_fake(content):
    items = []
    for line in content.split("\n"):
        n, rest = line.split(". ", 1)
        low = rest.lower()
        cat, name = "Other", rest.split(" | ")[0][:20].title()
        for k, c, nm in [("payroll", "Income", "Acme payroll"), ("landlord", "Housing", "Rent"), ("netflix", "Subscriptions", "Netflix"),
                         ("spotify", "Subscriptions", "Spotify"), ("evergy", "Utilities & Phone", "Evergy"), ("starbucks", "Dining & Coffee", "Starbucks"),
                         ("hy-vee", "Groceries", "Hy-Vee"), ("amzn", "Shopping", "Amazon"), ("discover e-payment", "Transfer", "Discover payment"),
                         ("thank you", "Transfer", "Card payment"), ("chipotle", "Dining & Coffee", "Chipotle")]:
            if k in low: cat, name = c, nm; break
        items.append({"n": int(n), "name": name, "category": cat})
    return json.dumps({"items": items})

class FakeMessages:
    def __init__(self): self.log = []
    def create(self, **kw):
        self.log.append(kw)
        if "output_config" in kw and "format" in kw["output_config"]:
            assert kw["output_config"]["format"]["schema"]["properties"]["items"]
            return NS(stop_reason="end_turn", content=[NS(type="text", text=categorize_fake(kw["messages"][0]["content"]))])
        # tool loop: first call -> use tools; then answer
        msgs = kw["messages"]
        if len(msgs) == 1:
            return NS(stop_reason="tool_use", content=[
                NS(type="tool_use", id="c1", name="get_totals", input={"start": f"{today:%Y-%m}-01", "end": today.isoformat()}),
                NS(type="tool_use", id="c2", name="spending_breakdown", input={"start": "2020-01-01", "end": today.isoformat(), "group_by": "month"}),
                NS(type="tool_use", id="c3", name="find_transactions", input={"search": "starbucks", "limit": 5}),
                NS(type="tool_use", id="c4", name="recurring_charges", input={}),
                NS(type="tool_use", id="c5", name="set_budget", input={"category": "Dining & Coffee", "amount": 120}),
                NS(type="tool_use", id="c6", name="set_budget", input={"category": "Income", "amount": 120}),
            ])
        FakeMessages.last_results = msgs[-1]["content"]
        return NS(stop_reason="end_turn", content=[NS(type="text", text="## Summary\n- You spent a lot on coffee.")])
fake_client = NS(beta=NS(messages=FakeMessages()))
import anthropic
anthropic.Anthropic = lambda **kw: fake_client


# --- rules & daily tests ---
token = base64.b64encode(b"https://bridge.example/simplefin/claim/abc").decode()
simplefin.claim(token)
print("sync", sync.run_sync()["categorized"])

systems = []
orig_create = FakeMessages.create
def spy(self, **kw):
    if "format" in (kw.get("output_config") or {}):
        systems.append(kw["system"])
    msgs = kw["messages"]
    if "format" not in (kw.get("output_config") or {}) and len(msgs) == 1 and "RULE-TEST" in str(msgs[0]["content"]):
        return NS(stop_reason="tool_use", content=[
            NS(type="tool_use", id="r1", name="add_rule", input={"text": "Starbucks is Groceries for testing."}),
            NS(type="tool_use", id="r2", name="spending_breakdown", input={"start": (today - timedelta(days=6)).isoformat(), "end": today.isoformat(), "group_by": "day"})])
    return orig_create(self, **kw)
FakeMessages.create = spy

with get_db() as conn:
    r = service.add_rule(conn, "  Zelle payments   to the landlord are Housing. ")
    print("rule:", r["text"])
    try: service.add_rule(conn, "x"); assert False
    except service.ValidationError as e: print("short ->", e)
    service.update_rule(conn, r["id"], enabled=False)
    print("rules_text (disabled):", repr(service.rules_text(conn)))
    service.update_rule(conn, r["id"], enabled=True, text="Zelle payments to the landlord are Housing.")
    print("rules_text:", service.rules_text(conn))
    # a user-set merchant must survive a re-sort
    sb = service.list_transactions(conn, search="starbucks", limit=1)[0]
    service.set_transaction_category(conn, sb["id"], "Entertainment", apply_to_similar=True)
    n_ai = conn.execute("SELECT COUNT(*) FROM fin_merchants WHERE source != 'user'").fetchone()[0]
    print("ai merchants", n_ai)

systems.clear()
print("resort sorted:", assistant.resort())
print("rules in system prompt:", all("Zelle payments to the landlord are Housing." in s for s in systems), len(systems))
with get_db() as conn:
    print("user merchant kept:", service.get_transaction(conn, sb["id"])["category"])

# assistant add_rule + day grouping
calls_before = len(fake_client.beta.messages.log)
a = assistant.ask("RULE-TEST remember starbucks")
print("ask changes:", a["changes"])
last = fake_client.beta.messages.log[-1]
print("context has rules:", "THE USER'S RULES" in last["messages"][0]["content"])
res = [r for r in last["messages"][-1]["content"] if r["tool_use_id"] == "r2"][0]["content"]
print("day breakdown:", res[:160])
import time; time.sleep(1.5)
print("resorting done:", not assistant.resorting())

# day report prompt
assistant.ask("", report="day", day="2026-09-20")
print("day report task:", "2026-09-20" in fake_client.beta.messages.log[-1]["messages"][0]["content"] if False else [m for m in fake_client.beta.messages.log if "cash analysis of 2026-09-20" in str(m["messages"][0]["content"])] != [])

# daily summary + balance history
with get_db() as conn:
    y = (today - timedelta(days=1)).isoformat()
    conn.execute("INSERT OR REPLACE INTO fin_balance_history VALUES (?, 'ACT-1', 5000)", ((today - timedelta(days=2)).isoformat(),))
    conn.execute("INSERT OR REPLACE INTO fin_balance_history VALUES (?, 'ACT-1', 4700)", (y,))
    conn.execute("INSERT OR REPLACE INTO fin_balance_history VALUES (?, 'ACT-2', 8200)", ((today - timedelta(days=5)).isoformat(),))
    d = service.day_summary(conn, y)
    print("day", d["date"], "in", d["income"], "out", d["spending"], "net", d["net"], "avg", d["avg_daily_spending"],
          "cats", [(c["category"], c["spent"]) for c in d["categories"]][:3], "txs", len(d["transactions"]),
          "mtd", d["month_to_date"], "cash", d["cash"], "series", len(d["series"]))
    payday = [r for r in d["series"] if r["income"] > 0][0]["date"]
    p = service.day_summary(conn, payday)
    print("payday", payday, "income items", [(t["merchant"], t["amount"]) for t in p["income_items"]])
    try: service.day_summary(conn, "garbage"); assert False
    except service.ValidationError as e: print("bad day ->", e)
    print("snapshots stored by sync:", conn.execute("SELECT COUNT(*) FROM fin_balance_history").fetchone()[0])

from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as c:
    print(c.get("/api/finances/day").json()["date"])
    print(c.get("/api/finances/rules").json()["resorting"], len(c.get("/api/finances/rules").json()["rules"]))
    r = c.post("/api/finances/rules", json={"text": "Evergy is Utilities & Phone"}).json(); print("post", r["id"])
    print(c.patch(f"/api/finances/rules/{r['id']}", json={"enabled": False}).json()["enabled"])
    print(c.post("/api/finances/rules/apply").json())
    print(c.delete(f"/api/finances/rules/{r['id']}").json(), c.post("/api/finances/rules", json={"text": ""}).status_code)
    print(c.post("/api/finances/ask", json={"report": "day", "day": "2026-09-01"}).status_code)
print("ALL OK")
