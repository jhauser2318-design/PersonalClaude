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

# --- tests ---
try:
    simplefin.decode_setup_token("not a token"); assert False
except simplefin.FinanceError as e: print("bad token ->", e)
token = base64.b64encode(b"https://bridge.example/simplefin/claim/abc").decode()
simplefin.claim(" " + token[:10] + "\n" + token[10:] + " ")
assert simplefin.is_connected()
try: simplefin.claim(token); assert False
except simplefin.FinanceError as e: print("reuse ->", e)

r = sync.run_sync(); print("sync1", r)
assert r["new"] > 50 and r["categorized"] > 5
r2 = sync.run_sync(); print("sync2", {k: v for k, v in r2.items()})
start2 = int(calls[-1][1].split("start-date=")[1].split("&")[0])
print("second sync starts", datetime.fromtimestamp(start2).date())

with get_db() as conn:
    n = conn.execute("SELECT COUNT(*) n FROM fin_transactions").fetchone()["n"]
    pend = conn.execute("SELECT COUNT(*) n FROM fin_transactions WHERE pending=1").fetchone()["n"]
    pairs = conn.execute("SELECT COUNT(*) n FROM fin_transactions WHERE transfer_with IS NOT NULL").fetchone()["n"]
    print("tx", n, "pending", pend, "transfer-paired", pairs)
    assert pend == 1
    print("accounts", [(a["display_name"], a["kind"], a["balance"]) for a in service.list_accounts(conn)])
    print("balances", service.balances(conn))
    ov = service.overview(conn)
    print("cashflow", ov["cashflow"])
    print("month cats", [(c["category"], c["spent"]) for c in ov["month"]["categories"]])
    print("recurring", [(r["merchant"], r["amount"], r["next_date"]) for r in ov["recurring"]])
    print("uncategorized", ov["uncategorized"])
    print("suggest", service.suggest_budgets(conn))
    # recategorize one Amazon tx and all similar
    amz = service.list_transactions(conn, search="amzn", limit=3)
    t = service.set_transaction_category(conn, amz[0]["id"], "Groceries", apply_to_similar=False, note="food order")
    assert t["category"] == "Groceries" and t["category_source"] == "you"
    t = service.set_transaction_category(conn, amz[1]["id"], "Personal Care", apply_to_similar=True)
    others = service.list_transactions(conn, search="amzn")
    print("amazon cats", sorted({(x["category"], x["amount"] > 0) for x in others}))
    # un-transfer a paired tx
    paired = service.list_transactions(conn, category="Transfer", limit=1)[0]
    service.set_transaction_category(conn, paired["id"], "Other")
    print("after unpair:", service.get_transaction(conn, paired["id"])["category"],
          service.get_transaction(conn, paired["transfer_with"])["category"])
    try: service.set_budget(conn, "Transfer", 5); assert False
    except service.ValidationError as e: print("budget transfer ->", e)
    service.update_account(conn, "ACT-2", {"hidden": True, "nickname": "Savings"})
    print("balances hidden savings", service.balances(conn))
    service.update_account(conn, "ACT-2", {"hidden": False})

a = assistant.ask("how much coffee?", [{"role": "assistant", "content": "x"}, {"role": "user", "content": "hi"}])
print("ask ->", a)
print("tool results:", [(r["tool_use_id"], r.get("is_error", False), r["content"][:80]) for r in FakeMessages.last_results])
rep = assistant.ask("", report="last_month")
assert "REPORT" in "".join(b["text"] for b in fake_client.beta.messages.log[-1]["system"])
with get_db() as conn:
    print("budgets", service.list_budgets(conn))
    print("month summary budget", {k: v for k, v in service.month_summary(conn).items() if k in ("budget_total", "budgeted_spent")})

# API via TestClient
from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as c:
    s = c.get("/api/finances/status").json(); print("status", s)
    assert c.get("/api/finances/overview").status_code == 200
    m = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    assert c.get(f"/api/finances/overview?month={m}").json()["month"]["month"] == m
    txl = c.get("/api/finances/transactions", params={"category": "Dining & Coffee"}).json()
    print("dining txs", len(txl))
    tid = txl[0]["id"]
    r = c.patch(f"/api/finances/transactions/{tid}", json={"category": "Travel"}); print("patch", r.status_code, r.json()["category"])
    r = c.patch(f"/api/finances/transactions/{tid}", json={"category": "Bogus"}); print("patch bogus", r.status_code, r.json())
    print("budgets", c.get("/api/finances/budgets").json()["budgets"])
    print("put budget", c.put("/api/finances/budgets/Groceries", json={"amount": 400}).json())
    print("put budget clear", c.put("/api/finances/budgets/Groceries", json={"amount": None}).json())
    print("ask", c.post("/api/finances/ask", json={"question": "hi"}).json())
    print("report bad", c.post("/api/finances/ask", json={"report": "zzz"}).status_code)
    print("accounts patch", c.patch("/api/finances/accounts/ACT-1", json={"kind": "savings"}).json()["kind"])
    print("disconnect", c.post("/api/finances/disconnect", json={"delete_data": True}).json(), c.get("/api/finances/status").json())
print("ALL OK")
