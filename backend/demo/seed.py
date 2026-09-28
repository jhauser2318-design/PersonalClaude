"""Sample data for demo mode: a made-up person ("Alex Morgan") with goals,
tasks, routines, a shopping list, follow-ups and three months of bank and
card activity. Everything is dated around today, so it always looks current.
The same "random" choices are made every time (fixed seed).
"""
import random
from datetime import date, datetime, timedelta

from ..database import set_setting
from ..modules.finances import service as fin
from ..modules.followups import service as followups
from ..modules.goals import service as goals
from ..modules.habits import service as habits
from ..modules.shopping import service as shopping


def _iso(d: date) -> str:
    return d.isoformat()


def _stamp(d: date, hour: int = 12) -> str:
    return datetime.combine(d, datetime.min.time()).replace(hour=hour).isoformat(timespec="seconds")


def seed(conn) -> None:
    today = date.today()
    rnd = random.Random(42)
    D = lambda n: today + timedelta(days=n)  # noqa: E731

    # Don't add the normal first-run examples/starters on top of this.
    set_setting(conn, "examples_seeded", "1")
    set_setting(conn, "starter_routines_added", "1")

    # --- Goals, notes, tasks ---------------------------------------------------------
    g = {}
    for key, fields, notes in [
        ("run", {"title": "Run a half marathon", "area": "health", "description": "Finish the fall half marathon under 2 hours.",
                 "target_date": _iso(D(52)), "status": "in_progress", "progress": 45},
         [(-20, "Ran 6 miles without stopping for the first time."), (-9, "Long run: 7.5 miles at a 9:40 pace."),
          (-2, "Legs felt heavy; swapped the tempo run for an easy 3 miles.")]),
        ("cpa", {"title": "Pass the CPA FAR section", "area": "education", "description": "Exam booked for early next quarter.",
                 "target_date": _iso(D(74)), "status": "in_progress", "progress": 60},
         [(-14, "Finished the leases chapter."), (-3, "Practice exam 3: 78% (passing is 75%).")]),
        ("promo", {"title": "Get promoted to Senior Analyst", "area": "work",
                   "description": "Lead the dashboard migration and present the Q4 forecast.",
                   "target_date": _iso(D(120)), "status": "in_progress", "progress": 30},
         [(-6, "Priya agreed on the two focus areas for the promotion case.")]),
        ("trip", {"title": "Plan the Lisbon trip with friends", "area": "social", "description": "Flights, stay and a day trip to Sintra.",
                  "target_date": _iso(D(24)), "status": "in_progress", "progress": 70},
         [(-4, "Flights booked for everyone.")]),
        ("save", {"title": "Build a 6-month emergency fund", "area": "work", "description": "$15,000 in high-yield savings.",
                  "target_date": _iso(D(200)), "status": "in_progress", "progress": 55}, []),
    ]:
        goal = goals.create_goal(conn, fields)
        g[key] = goal["id"]
        for days_ago, text in notes:
            note = goals.add_note(conn, goal["id"], text)
            conn.execute("UPDATE goal_notes SET created_at = ? WHERE id = ?", (_stamp(D(days_ago), 19), note["id"]))

    for title, area, goal, due, prio, done in [
        ("Confirm Q4 headcount line with Sarah", "work", "promo", 0, "high", False),
        ("Draft the dashboard migration plan", "work", "promo", 3, "high", False),
        ("Book the Sintra day-trip tickets", "social", "trip", 5, "medium", False),
        ("Buy running gels for the long run", "health", "run", -1, "low", False),
        ("40 practice questions: governmental accounting", "education", "cpa", 1, "high", False),
        ("Reply to Parkview about the lease renewal", "social", None, 2, "medium", False),
        ("Schedule the car's oil change", "health", None, 8, "low", False),
        ("Send Q3 expense report", "work", None, -3, "medium", True),
        ("Renew passport photos", "social", "trip", -6, "medium", True),
        ("Register for the half marathon", "health", "run", -12, "high", True),
    ]:
        task = goals.create_task(conn, {"title": title, "area": area, "goal_id": g.get(goal), "due_date": _iso(D(due)),
                                        "priority": prio, "done": done})
        if title.startswith("Confirm Q4"):
            followups.set_reminder(conn, "task", task["id"], f"{_iso(D(0))}T16:00")

    # --- Routines with ~10 weeks of history -------------------------------------------
    start = D(-70)
    for fields, chance, amount in [
        ({"title": "Go to the gym", "area": "health", "frequency": "times_per_week", "times_per_week": 4,
          "goal_id": g["run"]}, 0.62, None),
        ({"title": "Skincare routine", "area": "health", "frequency": "daily"}, 0.9, None),
        ({"title": "CPA study", "area": "education", "frequency": "daily", "target_amount": 2, "unit": "hours",
          "goal_id": g["cpa"]}, 0.8, 2),
        ({"title": "Read 20 pages", "area": "education", "frequency": "weekdays", "days": [0, 1, 2, 3, 4],
          "target_amount": 20, "unit": "pages"}, 0.75, 20),
    ]:
        h = habits.create_habit(conn, fields)
        conn.execute("UPDATE habits SET created_at = ? WHERE id = ?", (_stamp(start, 8), h["id"]))
        for i in range(71):
            d = start + timedelta(days=i)
            if d == today and fields["title"] != "Skincare routine":
                continue  # leave some of today's routines to do
            if fields["frequency"] == "weekdays" and d.weekday() > 4:
                continue
            recent_streak = (today - d).days <= 12  # a nice current streak
            if recent_streak or rnd.random() < chance:
                habits.log_habit(conn, h["id"], _iso(d), amount * rnd.choice([1, 1, 1, 0.75, 1.25]) if amount else None)
        if fields["title"] == "Skincare routine":
            followups.set_reminder(conn, "routine", h["id"], "21:30")
        if fields["title"] == "CPA study":
            followups.set_reminder(conn, "routine", h["id"], "19:00")

    # --- Shopping list ---------------------------------------------------------------
    for name, desc, cat, price, bought in [
        ("Running shoes", "Replacement pair for half-marathon training", "need", 139.99, False),
        ("Travel adapter (EU)", "For the Lisbon trip", "need", 18.99, False),
        ("Noise-canceling headphones", "For the flight and the office", "want", 249.00, False),
        ("Standing desk mat", "Home office", "want", 49.95, False),
        ("CPA FAR flashcards", "Pocket review cards", "need", 34.00, True),
        ("Espresso machine", "Nice-to-have for weekend mornings", "want", 399.00, False),
    ]:
        item = shopping.create_item(conn, {"name": name, "description": desc, "category": cat, "price": price})
        if bought:
            shopping.update_item(conn, item["id"], {"bought": True})

    # --- Follow-ups and notification history -----------------------------------------
    for title, person, direction, due, remind, notes in [
        ("Q4 headcount numbers", "Sarah Chen", "waiting", 3, f"{_iso(D(3))}T10:00", "She's checking with finance."),
        ("Lease renewal decision", "Parkview Apartments", "todo", 12, f"{_iso(D(10))}T09:00", "Renewal offer: $1,495/month."),
        ("Promotion case feedback", "Priya Patel", "waiting", 7, None, ""),
        ("Send Sam the Lisbon Airbnb link", "Sam Rivera", "todo", 0, None, ""),
    ]:
        f = followups.create_followup(conn, {"title": title, "person": person, "direction": direction,
                                             "due_date": _iso(D(due)), "notes": notes})
        if remind:
            followups.set_reminder(conn, "followup", f["id"], remind)
    for kind, title, body, link, hours_ago in [
        ("briefing", "☀️ Your day", "2 tasks due · 3 routines to do · yesterday +$0 in, $42 out", "dashboard", 5),
        ("routine", "🔁 CPA study", "Not checked off yet today · 2 hours", "routines", 20),
        ("followup", "↩ Q4 headcount numbers", "Waiting on · Sarah Chen", "followups", 30),
        ("budget", "💸 Over budget: Dining & Coffee", "$268 spent of $250 this month ($18 over)", "finances", 50),
    ]:
        stamp = (datetime.now() - timedelta(hours=hours_ago)).isoformat(timespec="seconds")
        conn.execute("INSERT INTO notifications (kind, title, body, link, created_at, delivered_at, read_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?)", (kind, title, body, link, stamp, stamp, stamp if hours_ago > 24 else None))

    _seed_finances(conn, today, rnd)


def _seed_finances(conn, today: date, rnd: random.Random) -> None:
    now = datetime.now().isoformat(timespec="seconds")
    accounts = [
        ("DEMO-CHK", "Demo Bank", "Everyday Checking", "checking", 4820.55),
        ("DEMO-SAV", "Demo Bank", "High-Yield Savings", "savings", 8950.00),
        ("DEMO-VISA", "Horizon Card Co", "Rewards Visa", "credit", -612.33),
        ("DEMO-CB", "Horizon Card Co", "Cash Back Card", "credit", -289.40),
        ("DEMO-LOAN", "Horizon Student Lending", "Student Loan", "loan", -24380.00),
    ]
    for acc_id, org, name, kind, bal in accounts:
        conn.execute("INSERT INTO fin_accounts (id, org, name, kind, balance, balance_date, updated_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?)", (acc_id, org, name, kind, bal, today.isoformat(), now))

    tx = []  # (account, day, amount, description, pending)

    def add(acc, d, amount, desc, pending=False):
        if d <= today:
            tx.append((acc, d, round(amount, 2), desc, pending))

    first = today - timedelta(days=95)
    payday = today - timedelta(days=(today.weekday() - 4) % 7)  # most recent Friday
    while payday >= first:
        add("DEMO-CHK", payday, 2310.00, "NORTHWIND CORP DIRECT DEP PPD")
        add("DEMO-CHK", payday + timedelta(days=1), -300.00, "ONLINE TRANSFER TO SAVINGS")
        add("DEMO-SAV", payday + timedelta(days=1), 300.00, "ONLINE TRANSFER FROM CHECKING")
        payday -= timedelta(days=14)

    for m in range(4):
        base = (today.replace(day=1) - timedelta(days=31 * m)).replace(day=1)

        def day_of(n):
            return base.replace(day=min(n, 28))

        add("DEMO-CHK", day_of(1), -1450.00, "PARKVIEW APTS RENT ACH")
        add("DEMO-CHK", day_of(18), -86.40 + rnd.uniform(-9, 9), "CITY POWER & LIGHT WEB PMT")
        add("DEMO-CHK", day_of(15), -380.00, "HORIZON STUDENT LN PMT")
        add("DEMO-LOAN", day_of(16), 380.00, "PAYMENT RECEIVED THANK YOU")
        add("DEMO-VISA", day_of(22), -65.00, "VERIZON WIRELESS AUTOPAY")
        add("DEMO-VISA", day_of(10), -59.99, "SPECTRUM INTERNET")
        add("DEMO-VISA", day_of(7), -39.99, "SUMMIT FITNESS MEMBERSHIP")
        add("DEMO-CB", day_of(5), -15.49, "NETFLIX.COM")
        add("DEMO-CB", day_of(12), -11.99, "SPOTIFY USA")
        add("DEMO-CB", day_of(3), -2.99, "APPLE.COM/BILL ICLOUD")
        add("DEMO-SAV", day_of(28), 31.20 + rnd.uniform(-2, 2), "INTEREST PAYMENT")
        visa_bill = round(rnd.uniform(520, 760), 2)
        add("DEMO-CHK", day_of(25), -visa_bill, "HORIZON RWDS VISA PAYMENT")
        add("DEMO-VISA", day_of(26), visa_bill, "PAYMENT THANK YOU")
        cb_bill = round(rnd.uniform(260, 420), 2)
        add("DEMO-CHK", day_of(20), -cb_bill, "HORIZON CASH BACK PAYMENT")
        add("DEMO-CB", day_of(21), cb_bill, "PAYMENT THANK YOU")

    d = first
    while d <= today:
        wd = d.weekday()
        if rnd.random() < 0.55:
            add("DEMO-VISA", d, -rnd.uniform(4.25, 7.5), f"BLUE BOTTLE COFFEE #{rnd.randint(10, 99)}", d == today)
        if wd in (1, 5) or rnd.random() < 0.08:
            add("DEMO-CB", d, -rnd.uniform(38, 128), rnd.choice(["TRADER JOE'S #512", "KROGER #0931"]))
        if wd in (4, 5) and rnd.random() < 0.7:
            add("DEMO-VISA", d, -rnd.uniform(14, 68), rnd.choice(["CHIPOTLE 2291", "SWEETGREEN CHICAGO", "LUCIA'S TRATTORIA"]))
        if wd == 0 and rnd.random() < 0.8:
            add("DEMO-VISA", d, -rnd.uniform(34, 56), "SHELL OIL 57442")
        if rnd.random() < 0.13:
            add("DEMO-CB", d, -rnd.uniform(11, 84), "AMZN MKTP US")
        if rnd.random() < 0.09:
            add("DEMO-VISA", d, -rnd.uniform(9, 31), "UBER *TRIP")
        if rnd.random() < 0.05:
            add("DEMO-CB", d, -rnd.uniform(22, 95), "TARGET 00012")
        if rnd.random() < 0.04:
            add("DEMO-VISA", d, -rnd.uniform(12, 45), rnd.choice(["AMC THEATRES", "STEAM GAMES"]))
        d += timedelta(days=1)
    add("DEMO-CB", today - timedelta(days=33), -199.00, "CPA REVIEW PRO")
    add("DEMO-CB", today - timedelta(days=8), 23.99, "AMZN MKTP US RETURN")

    names = {
        "NORTHWIND": ("Northwind Corp payroll", "Income"), "TRANSFER": ("Savings transfer", "Transfer"),
        "PARKVIEW": ("Parkview Apartments", "Housing"), "CITY POWER": ("City Power & Light", "Utilities & Phone"),
        "HORIZON STUDENT": ("Horizon student loan", "Debt Payments"), "PAYMENT RECEIVED": ("Loan payment", "Transfer"),
        "VERIZON": ("Verizon", "Utilities & Phone"), "SPECTRUM": ("Spectrum", "Utilities & Phone"),
        "SUMMIT": ("Summit Fitness", "Health & Fitness"), "NETFLIX": ("Netflix", "Subscriptions"),
        "SPOTIFY": ("Spotify", "Subscriptions"), "APPLE": ("iCloud", "Subscriptions"), "INTEREST": ("Savings interest", "Income"),
        "RWDS VISA": ("Rewards Visa payment", "Transfer"), "CASH BACK PAYMENT": ("Cash Back Card payment", "Transfer"),
        "PAYMENT THANK YOU": ("Card payment", "Transfer"), "BLUE BOTTLE": ("Blue Bottle Coffee", "Dining & Coffee"),
        "TRADER": ("Trader Joe's", "Groceries"), "KROGER": ("Kroger", "Groceries"), "CHIPOTLE": ("Chipotle", "Dining & Coffee"),
        "SWEETGREEN": ("Sweetgreen", "Dining & Coffee"), "LUCIA": ("Lucia's Trattoria", "Dining & Coffee"),
        "SHELL": ("Shell", "Gas"), "AMZN": ("Amazon", "Shopping"), "UBER": ("Uber", "Transportation"),
        "TARGET": ("Target", "Shopping"), "AMC": ("AMC Theatres", "Entertainment"), "STEAM": ("Steam", "Entertainment"),
        "CPA REVIEW": ("CPA Review Pro", "Education"),
    }
    for i, (acc, day, amount, desc, pending) in enumerate(sorted(tx, key=lambda t: t[1])):
        key = fin.merchant_key(desc, "", amount)
        conn.execute(
            "INSERT INTO fin_transactions (id, account_id, posted, amount, description, pending, merchant_key, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (f"{acc}:{i}", acc, day.isoformat(), amount, desc, int(pending), key, now))
        name, cat = next(((n, c) for k, (n, c) in names.items() if k in desc), (desc.title(), "Other"))
        conn.execute("INSERT OR IGNORE INTO fin_merchants (key, name, category, source, updated_at) VALUES (?, ?, ?, 'ai', ?)",
                     (key, name, cat, now))
    fin.match_transfers(conn)

    # Daily balances for checking and savings (worked backwards from today).
    for acc_id, _, _, kind, bal in accounts:
        if kind not in ("checking", "savings"):
            continue
        running = bal
        by_day: dict[str, float] = {}
        for acc, day, amount, _, _ in tx:
            if acc == acc_id:
                by_day[day.isoformat()] = by_day.get(day.isoformat(), 0) + amount
        for n in range(0, 60):
            day = (today - timedelta(days=n)).isoformat()
            conn.execute("INSERT OR REPLACE INTO fin_balance_history (date, account_id, balance) VALUES (?, ?, ?)",
                         (day, acc_id, round(running, 2)))
            running -= by_day.get(day, 0)

    for cat, amount in {"Housing": 1450, "Groceries": 450, "Dining & Coffee": 250, "Shopping": 200, "Gas": 180,
                        "Transportation": 120, "Entertainment": 80, "Subscriptions": 40, "Utilities & Phone": 230,
                        "Health & Fitness": 60, "Debt Payments": 380}.items():
        fin.set_budget(conn, cat, amount)
    fin.add_rule(conn, "Transfers to my High-Yield Savings are savings, not spending (Transfer).")
    fin.add_rule(conn, "Lucia's Trattoria is always dinner with friends (Dining & Coffee).")
    fin.save_loan(conn, {"name": "Student loan", "lender": "Horizon Student Lending", "account_id": "DEMO-LOAN",
                         "apr": 5.25, "payment": 380, "due_day": 15})
    fin.save_loan(conn, {"name": "Car loan", "lender": "Demo Auto Finance", "balance": 8600, "apr": 6.9, "payment": 310,
                         "due_day": 3})
    fin.save_sync_status(conn, ok=True, messages=[])
