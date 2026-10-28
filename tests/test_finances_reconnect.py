"""A bank reconnected on SimpleFIN comes back with new account ids: the old
copies must not be counted twice in net worth or spending."""
import os, sys, tempfile, time
from datetime import date, datetime, timedelta
tmp = tempfile.mkdtemp(); os.environ["DATABASE_PATH"] = f"{tmp}/life.db"
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))
from backend.modules.finances import service
from backend.database import get_db, init_db
init_db()
T = date.today()
def ts(d): return int(datetime.combine(d, datetime.min.time()).timestamp()) + 43200
def acc(id_, name, bal, txs, org="Commerce Bank"):
    return {"org": {"name": org}, "id": id_, "name": name, "balance": f"{bal:.2f}", "balance-date": ts(T), "transactions": txs}
def tx(id_, days_ago, amt, desc):
    return {"id": id_, "posted": ts(T - timedelta(days=days_ago)), "amount": f"{amt:.2f}", "description": desc}

old_chk = [tx("A1", 40, -1650, "RENT"), tx("A2", 10, -60, "HY-VEE 123"), tx("A3", 3, -25, "CHIPOTLE")]
with get_db() as c:
    service.store_sync(c, [acc("OLD-CHK", "Commerce Checking", 3000, old_chk),
                           acc("OLD-CARD", "Commerce Visa Signature", -400, [tx("C1", 5, -400, "AMAZON")]),
                           acc("SAV", "360 Savings", 8000, [], org="Capital One")])
    service.update_account(c, "OLD-CHK", {"nickname": "Main checking"})
    c.execute("UPDATE fin_transactions SET category = 'Housing', note = 'rent' WHERE id = 'OLD-CHK:A1'")
    assert service.balances(c)["net"] == 3000 - 400 + 8000
time.sleep(1.1)  # the reconnect happens later

# Reconnected: same accounts, new ids, the last 90 days again (new transaction ids too).
new_chk = [tx("N1", 40, -1650, "RENT"), tx("N2", 10, -60, "HY-VEE 123"), tx("N3", 3, -25, "CHIPOTLE"), tx("N4", 1, -12, "STARBUCKS")]
with get_db() as c:
    r = service.store_sync(c, [acc("NEW-CHK", "Commerce Checking", 2988, new_chk),
                               acc("NEW-CARD", "Commerce Visa Signature", -400, [tx("D1", 5, -400, "AMAZON")]),
                               acc("SAV", "360 Savings", 8000, [], org="Capital One")])
    assert sorted(m["old_id"] for m in r["merged"]) == ["OLD-CARD", "OLD-CHK"], r
    ids = [a["id"] for a in service.list_accounts(c)]
    assert sorted(ids) == ["NEW-CARD", "NEW-CHK", "SAV"], ids
    b = service.balances(c)
    assert b["net"] == 2988 - 400 + 8000, b  # not counted twice
    txs = c.execute("SELECT * FROM fin_transactions WHERE account_id = 'NEW-CHK' ORDER BY posted").fetchall()
    assert len(txs) == 4, [dict(t) for t in txs]  # no duplicated spending
    rent = [t for t in txs if t["description"] == "RENT"][0]
    assert rent["category"] == "Housing" and rent["note"] == "rent"  # your edits carried over
    assert service.list_accounts(c)[0]["nickname"] in ("Main checking", "") and \
        c.execute("SELECT nickname FROM fin_accounts WHERE id = 'NEW-CHK'").fetchone()[0] == "Main checking"
    assert service.net_worth_check(c) == []

# Two real accounts with the same name that were always sent together are never merged.
with get_db() as c:
    r = service.store_sync(c, [acc("NEW-CHK", "Commerce Checking", 2988, []), acc("SAV", "360 Savings", 8000, [], org="Capital One"),
                               acc("NEW-CARD", "Commerce Visa Signature", -400, []), acc("SAV2", "360 Savings", 500, [], org="Capital One")])
    assert r["merged"] == []
    kinds = [x["kind"] for x in service.net_worth_check(c)]
    assert kinds == ["duplicate"], kinds  # flagged for you to check instead

# A loan or card counted as cash, and a card shown as positive, get flagged.
with get_db() as c:
    c.execute("DELETE FROM fin_accounts WHERE id = 'SAV2'")
    c.execute("INSERT INTO fin_accounts (id, org, name, kind, balance, balance_date, updated_at) VALUES "
              "('X1', 'Commerce Bank', 'Commerce Auto Loan', 'checking', 14000, ?, 'x')", (T.isoformat(),))
    c.execute("UPDATE fin_accounts SET balance = 400 WHERE id = 'NEW-CARD'")
    kinds = sorted(x["kind"] for x in service.net_worth_check(c))
    assert kinds == ["card_positive", "type"], kinds
    service.update_account(c, "NEW-CARD", {"flip": True})
    service.update_account(c, "X1", {"kind": "loan"})
    assert service.net_worth_check(c) == []
    b = service.balances(c)
    assert b["debt"] == 400 and b["loans"] == 14000 and b["net"] == 2988 + 8000 - 400 - 14000, b
    assert service._guess_kind("Commerce Bank", "Installment Loan", 100) == "loan"
    assert service._guess_kind("Commerce Bank", "Auto 1234", 100) == "loan"
print("reconnect ok")

# The sync itself: a new account in a normal (2-week) sync triggers a full 90-day pull.
from backend.modules.finances import simplefin, sync
starts = []
def fake_fetch(start, end=None):
    starts.append(date.fromtimestamp(start))
    return {"accounts": [acc("NEW-CHK", "Commerce Checking", 2988, []), acc("SAV", "360 Savings", 8000, [], org="Capital One"),
                         acc("NEW-CARD", "Commerce Visa Signature", -400, []), acc("X1", "Commerce Auto Loan", 14000, []),
                         acc("BRAND-NEW", "Commerce Rewards Savings", 50, [tx("B1", 60, 50, "OPENING DEPOSIT")])], "messages": []}
simplefin.fetch_accounts = fake_fetch
sync.assistant.categorize = lambda: 0
sync._sync()
assert len(starts) == 2 and (T - starts[1]).days >= 89 and (T - starts[0]).days < 60, starts
with get_db() as c:
    assert c.execute("SELECT COUNT(*) FROM fin_transactions WHERE account_id = 'BRAND-NEW'").fetchone()[0] == 1
starts.clear(); sync._sync()
assert len(starts) == 1, starts  # nothing new: one normal request
print("sync refetch ok")
