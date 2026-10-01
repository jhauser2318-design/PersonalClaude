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
from ..modules.cpa import service as cpa
from ..modules.finances import planning
from ..modules.fun import service as fun
from ..modules.home import service as home
from ..modules.journal import service as journal
from ..modules.people import service as people
from ..modules.review import service as review
from ..modules.schedule import service as schedule


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
        ("Paper towels", "", "need", None, False),
        ("Protein powder", "", "need", None, False),
        ("Espresso machine", "Nice-to-have for weekend mornings", "want", 399.00, False),
    ]:
        item = shopping.create_item(conn, {"name": name, "description": desc, "category": cat,
                                           "price": price if cat == "want" else None})
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
    _seed_life(conn, today, rnd, g)


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
        y, mo = divmod(today.year * 12 + today.month - 1 - m, 12)  # m months back (subtracting days can skip a month)
        base = date(y, mo + 1, 1)

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


def _seed_life(conn, today: date, rnd: random.Random, g: dict) -> None:
    """Schedule, CPA planner, people, fun, home & admin, weekly review, bills and savings."""
    D = lambda n: today + timedelta(days=n)  # noqa: E731
    habit_id = lambda title: conn.execute("SELECT id FROM habits WHERE title = ?", (title,)).fetchone()[0]  # noqa: E731

    # --- Schedule: typical days, and today's plan ---------------------------------
    workday = [("06:30", "07:30", "Gym", "health"), ("08:30", "11:30", "Deep work: dashboard migration", "work"),
               ("12:00", "12:45", "Lunch walk", "health"), ("13:00", "17:00", "Meetings & email", "work"),
               ("19:00", "21:00", "CPA study: FAR", "education"), ("21:30", "22:00", "Read 20 pages", "education")]
    weekend = [("08:00", "09:30", "Long run", "health"), ("10:00", "13:00", "CPA study: practice exam", "education"),
               ("15:00", "17:00", "Groceries & meal prep", "health"), ("19:00", "22:00", "Friends", "social")]
    as_blocks = lambda rows: [{"start": a, "end": b, "title": t, "area": ar} for a, b, t, ar in rows]  # noqa: E731
    schedule.save_template(conn, "Workday", [0, 1, 2, 3, 4], as_blocks(workday))
    schedule.save_template(conn, "Weekend", [5, 6], as_blocks(weekend))
    for back in range(0, 8):
        day = D(-back)
        rows = workday if day.weekday() < 5 else weekend
        for a, b, t, ar in rows:
            block = schedule.create_block(conn, {"date": day.isoformat(), "start": a, "end": b, "title": t, "area": ar})
            if back > 0 or b <= datetime.now().strftime("%H:%M"):
                if rnd.random() < 0.8:
                    schedule.update_block(conn, block["id"], {"done": True})
    for back in range(0, 7):
        for _ in range(rnd.choice([0, 1, 2])):
            conn.execute("INSERT INTO focus_sessions (started_at, minutes, label, habit_id) VALUES (?, ?, ?, ?)",
                         (_stamp(D(-back), 19), rnd.choice([25, 50, 50]), "FAR", habit_id("CPA study")))

    # --- CPA planner -----------------------------------------------------------------
    cpa.overview(conn)  # creates FAR, AUD, REG, BAR
    ids = {r["code"]: r["id"] for r in conn.execute("SELECT id, code FROM cpa_sections")}
    cpa.save_settings(conn, habit_id("CPA study"), 30)
    cpa.update_section(conn, ids["AUD"], {"status": "passed", "passed_date": D(-160).isoformat(), "score": 82,
                                          "study_start": D(-260).isoformat(), "exam_date": D(-160).isoformat()})
    cpa.update_section(conn, ids["FAR"], {"status": "scheduled", "study_start": D(-70).isoformat(), "exam_date": D(74).isoformat(),
                                          "target_hours": 300, "notes": "Becker. Weak spots: leases, governmental."})
    cpa.update_section(conn, ids["REG"], {"exam_date": None})
    for back, score, kind in [(-60, 64, "practice exam"), (-45, 69, "practice exam"), (-31, 72, "quiz"),
                              (-17, 74, "practice exam"), (-3, 78, "practice exam")]:
        cpa.add_score(conn, "FAR", score, D(back).isoformat(), kind)

    # --- People ----------------------------------------------------------------------
    bday = lambda n, year: D(n).replace(year=year).isoformat()  # noqa: E731
    for name, rel, birthday, cadence, notes, contacts in [
        ("Mom", "family", bday(9, 1966), 7, "Loves gardening; ask about the tomatoes.", [(-3, "call", "Talked about Thanksgiving")]),
        ("Dad", "family", "1964-02-11", 14, "", [(-19, "call", "")]),
        ("Sam Rivera", "friend", bday(3, 1995), 21, "Lisbon trip organizer. Partner: Jordan.", [(-4, "met", "Lisbon planning dinner")]),
        ("Priya Patel", "mentor", None, 30, "Senior manager; promotion sponsor.", [(-6, "met", "Promotion case check-in")]),
        ("Jake Kim", "friend", "0000-06-03", 14, "College roommate, lives in Denver.", [(-33, "text", "")]),
        ("Grandma Rose", "family", "1941-12-24", 10, "Call on Sundays.", [(-12, "call", "")]),
    ]:
        p = people.create_person(conn, {"name": name, "relation": rel, "birthday": birthday, "cadence_days": cadence, "notes": notes})
        for back, kind, note in contacts:
            people.log_contact(conn, p["id"], D(back).isoformat(), kind, note)

    # --- Fun ---------------------------------------------------------------------------
    for back, title, cat, rating, who, place, cost, notes in [
        (-1, "Trivia night", "friends", 4, "Sam, Jordan", "The Owl", 32, "Came 2nd, lost on the music round"),
        (-3, "Sunset kayak on the river", "outdoors", 5, "Sam", "Chicago River", 45, ""),
        (-6, "Cubs game", "sports", 4, "Dad", "Wrigley Field", 78, ""),
        (-9, "Movie night: Dune", "shows", 3, "", "Home", None, ""),
        (-12, "Ramen crawl", "food", 5, "Jake, Priya", "West Loop", 54, "Best: Ramen Takeya"),
        (-16, "Board games", "games", 4, "Sam, Jordan", "Home", None, "Wingspan"),
        (-21, "Farmers market + picnic", "outdoors", 4, "Mom", "Green City Market", 26, ""),
        (-27, "Jazz at the Green Mill", "shows", 5, "Jake", "Green Mill", 20, ""),
        (-34, "Pottery class", "creative", 3, "", "Lillstreet", 65, "Wobbly bowl, great time"),
        (-41, "Weekend in Milwaukee", "travel", 5, "Sam, Jordan", "Milwaukee", 240, ""),
        (-55, "Lazy Sunday reading in the park", "relax", 4, "", "Lincoln Park", None, ""),
        (-70, "Axe throwing", "friends", 4, "Priya's team", "Bad Axe", 38, ""),
    ]:
        fun.add_entry(conn, {"date": D(back).isoformat(), "title": title, "category": cat, "rating": rating,
                             "with_whom": who, "place": place, "cost": cost, "notes": notes})
    for title, cat in [("Chicago food tour", "food"), ("Try indoor climbing", "sports"), ("Architecture boat tour", "outdoors"),
                       ("Comedy show at Second City", "shows"), ("Weekend in Door County", "travel")]:
        fun.add_idea(conn, title, cat)

    # --- Journal (the last couple of weeks, with a few gaps) -------------------------
    for back, mood, text in [
        (-1, 4, "Good day. Knocked out the dashboard migration review before lunch and the team liked the new layout.\n\nFAR practice after dinner: still slow on governmental funds. Going to do 20 more MCQs on that tomorrow."),
        (-2, 3, "Long meetings. Didn't get to the gym, so I walked at lunch instead. Called Mom, she sounded good."),
        (-3, 5, "Ramen crawl with Jake and Priya. Laughed way too much. Need more nights like this."),
        (-5, 2, "Tired and a bit behind. Skipped CPA study. Tomorrow: bed by 11, gym first thing."),
        (-6, 4, "Back on track. Gym, deep work block, 2 hours of FAR. Felt good to stick to the plan."),
        (-8, 4, "Weekend reset: groceries, meal prep, cleaned the apartment. Started the new book."),
        (-9, 3, "Practice exam: 71%. Better than last time. Leases and bonds are the weak spots."),
        (-12, 4, "Board games at home with Sam and Jordan. Wingspan is great."),
    ]:
        journal.save_entry(conn, D(back), text, mood)

    # --- Home maintenance-------------------------------------------------------------
    for name, cat, n, unit, last, notes in [
        ("Change HVAC filter", "home", 3, "months", D(-95), "16x25x1, MERV 8"),
        ("Oil change", "car", 6, "months", D(-170), "Every 5,000 miles; synthetic 0W-20"),
        ("Rotate tires", "car", 6, "months", D(-60), ""),
        ("Smoke detector batteries", "home", 1, "years", D(-200), "Hallway + bedroom"),
        ("Dentist cleaning", "health", 6, "months", D(-150), "Dr. Alvarez"),
        ("Deep clean the fridge", "home", 2, "months", D(-20), ""),
    ]:
        item = home.save_item(conn, {"name": name, "category": cat, "every_n": n, "every_unit": unit, "notes": notes})
        home.mark_done(conn, item["id"], last.isoformat(), None)
    for name, cat, due, done, cost, notes in [
        ("Fix the leaky bathroom faucet", "home", D(4), None, None, "Probably the cartridge"),
        ("Replace garage door opener remote", "car", None, None, None, ""),
        ("Get winter tires put on", "car", D(30), None, None, "Book at Discount Tire"),
        ("Patch the drywall in the hallway", "home", D(-2), None, None, ""),
        ("Install new smart thermostat", "home", D(-12), D(-10), 129, ""),
    ]:
        job = home.save_item(conn, {"name": name, "category": cat, "one_time": True,
                                    "due_date": due.isoformat() if due else None, "notes": notes})
        if done:
            home.mark_done(conn, job["id"], done.isoformat(), cost)
    for name, kind, when, remind, where in [
        ("Passport", "document", D(210), 180, "Fire safe"),
        ("Driver's license", "document", D(400), 60, "Wallet"),
        ("Car registration", "renewal", D(18), 30, "Glove box"),
        ("Renters insurance", "insurance", D(41), 30, "Email from Lemonade"),
        ("Lease renewal deadline", "renewal", D(12), 21, "Parkview portal"),
        ("Laptop warranty", "warranty", D(95), 14, "Google Drive / Receipts"),
    ]:
        home.save_date(conn, {"name": name, "kind": kind, "date": when.isoformat(), "remind_days": remind, "location": where})

    # --- Weekly review (last week, done) ---------------------------------------------
    last = review.monday() - timedelta(days=7)
    review.save_review(conn, last.isoformat(), {
        "went_well": "Hit 4 gym sessions and all my CPA study blocks. Practice scores are climbing.",
        "improve": "Too many late nights; move reading earlier.",
        "priorities": ["Score 80%+ on a FAR practice exam", "Send the migration plan to Priya", "Book Sintra tickets"],
        "completed": True})

    # --- Bills & savings -------------------------------------------------------------
    planning.save_bill(conn, {"name": "Renters insurance", "amount": 168, "due_day": D(41).day, "frequency": "yearly",
                              "start_month": D(41).month, "category": "Insurance", "autopay": True})
    planning.save_bill(conn, {"name": "Car insurance", "amount": 118, "due_day": 22, "category": "Insurance", "autopay": True})
    planning.save_bill(conn, {"name": "Amazon Prime", "amount": 139, "due_day": 9, "frequency": "yearly",
                              "start_month": 2, "category": "Subscriptions", "subscription": True, "autopay": True})
    planning.set_sub_flag(conn, "iCloud", "keep")
    planning.set_sub_flag(conn, "Spotify", "cancel", "Use the family plan instead")
    planning.save_savings(conn, {"name": "Emergency fund", "target": 15000, "account_id": "DEMO-SAV",
                                 "target_date": D(200).isoformat(), "goal_id": g["save"]})
    planning.save_savings(conn, {"name": "Lisbon trip", "target": 1800, "saved": 1250, "target_date": D(24).isoformat()})
    planning.save_savings(conn, {"name": "CPA exam fees (REG, BAR)", "target": 900, "saved": 250, "target_date": D(150).isoformat()})
