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


# --- loans & normalized income ---
chk = ACCOUNTS[0]["transactions"]
loan_tx = []
for k, days_ago in enumerate((70, 40, 10)):
    d = today - timedelta(days=days_ago)
    chk.append({"id": f"L{k}", "posted": ts(d), "amount": "-300.00", "description": "SOFI LOAN PMT WEB", "payee": "", "memo": "", "pending": False})
    loan_tx.append({"id": f"LL{k}", "posted": ts(d + timedelta(days=1)), "amount": "300.00", "description": "PAYMENT RECEIVED", "payee": "", "memo": "", "pending": False})
ACCOUNTS.append({"org": {"name": "SoFi"}, "id": "ACT-5", "name": "Student Loan Refinance", "currency": "USD",
                 "balance": "-28450.12", "balance-date": ts(today), "transactions": loan_tx})
_orig_cat = categorize_fake
def categorize_fake2(content):
    items = json.loads(_orig_cat(content))["items"]
    lines = content.split("\n")
    for it in items:
        if "sofi" in lines[it["n"] - 1].lower(): it.update(category="Debt Payments", name="SoFi loan payment")
        if "payment received" in lines[it["n"] - 1].lower(): it.update(category="Income", name="Payment received")
    return json.dumps({"items": items})
globals()["categorize_fake"] = categorize_fake2

token = base64.b64encode(b"https://bridge.example/simplefin/claim/abc").decode()
simplefin.claim(token); sync.run_sync()
with get_db() as conn:
    print("kinds", [(a["name"], a["kind"]) for a in service.list_accounts(conn)])
    loan_side = service.list_transactions(conn, account_id="ACT-5")
    print("loan-side categories", {t["category"] for t in loan_side})
    chk_side = service.list_transactions(conn, search="sofi")
    print("checking-side", {(t["category"], t["transfer_with"]) for t in chk_side})
    print("balances", service.balances(conn))
    rate = service.income_rate(conn)
    print("income rate", rate)
    assert 170 < rate["daily"] < 180, rate
    y = (today - timedelta(days=1)).isoformat()
    d = service.day_summary(conn, y)
    print("day", y, "earned", d["earned"], "spent", d["spending"], "net_norm", d["net_normalized"], "mtd", d["month_to_date"])
    print("set income", service.set_income_monthly(conn, 5000)["daily"], "clear", service.set_income_monthly(conn, None)["source"])
    loans = service.list_loans(conn)
    print("loans", loans)
    assert loans[0]["needs_details"]
    L = service.save_loan(conn, {"name": "SoFi student loan", "lender": "SoFi", "account_id": "ACT-5", "apr": 5.49, "payment": 400, "due_day": 15})
    print("saved", L["balance"], L["linked"])
    f = service.loan_forecast(conn, L["id"], 200, 0)
    print("forecast base", f["baseline"]["months"], f["baseline"]["payoff"], f["baseline"]["total_interest"],
          "extra", f["scenario"]["months"], "saved", f["months_saved"], f["interest_saved"])
    M = service.save_loan(conn, {"name": "Car", "balance": 9000, "apr": 7, "payment": 350})
    print("manual", M["balance"], M["linked"], "balances", service.balances(conn))
    try: service.save_loan(conn, {"name": "x", "apr": 99}); assert False
    except service.ValidationError as e: print("bad apr ->", e)
    LID = L["id"]

# AI: loan_forecast tool + context
def spy(self, **kw):
    msgs = kw["messages"]
    if "format" not in (kw.get("output_config") or {}) and len(msgs) == 1:
        spy.ctx = msgs[0]["content"]
        return NS(stop_reason="tool_use", content=[NS(type="tool_use", id="f1", name="loan_forecast",
                  input={"loan_id": LID, "extra_monthly": 300, "lump_sum": 1000})])
    if "format" not in (kw.get("output_config") or {}):
        spy.res = msgs[-1]["content"][0]["content"]
        return NS(stop_reason="end_turn", content=[NS(type="text", text="ok")])
    return FakeMessages.__dict__["create"](self, **kw)
_orig = FakeMessages.create
FakeMessages.create = lambda self, **kw: spy(self, **kw) if ("format" not in (kw.get("output_config") or {})) else _orig(self, **kw)
assistant.ask("when is my sofi loan paid off if I pay 300 more")
print("ctx loans:", [l for l in spy.ctx.splitlines() if "SoFi" in l or "INCOME PER DAY" in l])
print("tool result:", spy.res[:220])

from fastapi.testclient import TestClient
from backend.main import app
with TestClient(app) as c:
    r = c.get("/api/finances/loans").json(); print("api loans", [(l["name"], l.get("forecast", {}).get("payoff")) for l in r["loans"]])
    print(c.post(f"/api/finances/loans/{LID}/forecast", json={"extra": 100, "lump": 0}).json()["months_saved"])
    print(c.put("/api/finances/income", json={"monthly": 5200}).json()["daily"], c.get("/api/finances/day").json()["earned"])
    print(c.get("/api/finances/categories").json()["spending"][-5:])
print("ALL OK")
