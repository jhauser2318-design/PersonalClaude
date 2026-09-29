"""Search across the whole app (the 🔍 button, or Ctrl+K)."""
import sqlite3
from datetime import date, timedelta

# (group, SQL returning title, sub, link-arg; the search text is bound to every ?)
SOURCES = [
    ("Tasks", "SELECT title, COALESCE('due ' || due_date, '') || CASE WHEN done THEN ' · done' ELSE '' END, 'tasks' "
              "FROM tasks WHERE title LIKE ? ORDER BY done, due_date LIMIT 8", 1),
    ("Goals", "SELECT title, area || ' · ' || progress || '%', 'area/' || area FROM goals WHERE title LIKE ? OR description LIKE ? LIMIT 6", 2),
    ("Goal notes", "SELECT n.text, g.title, 'goals' FROM goal_notes n JOIN goals g ON g.id = n.goal_id WHERE n.text LIKE ? "
                   "ORDER BY n.created_at DESC LIMIT 5", 1),
    ("Routines", "SELECT title, COALESCE(unit, ''), 'routines' FROM habits WHERE title LIKE ? LIMIT 5", 1),
    ("Schedule", "SELECT title, date || ' ' || start || '–' || end, 'schedule/' || date FROM schedule_blocks "
                 "WHERE title LIKE ? AND date >= ? ORDER BY date DESC LIMIT 6", "recent"),
    ("Follow-ups", "SELECT title, COALESCE(NULLIF(person, ''), direction), 'followups' FROM followups "
                   "WHERE title LIKE ? OR person LIKE ? OR notes LIKE ? ORDER BY done LIMIT 6", 3),
    ("People", "SELECT name, COALESCE(NULLIF(relation, ''), 'person'), 'people' FROM people WHERE name LIKE ? OR notes LIKE ? LIMIT 6", 2),
    ("Fun", "SELECT title, date || COALESCE(' · ' || NULLIF(with_whom, ''), ''), 'fun' FROM fun_log "
            "WHERE title LIKE ? OR with_whom LIKE ? OR place LIKE ? OR notes LIKE ? ORDER BY date DESC LIMIT 6", 4),
    ("Fun ideas", "SELECT title, 'idea', 'fun' FROM fun_ideas WHERE done_at IS NULL AND title LIKE ? LIMIT 4", 1),
    ("Home maintenance", "SELECT name, CASE WHEN one_time THEN 'one-time job' ELSE 'repeating' END, 'home' FROM maintenance "
                         "WHERE name LIKE ? OR notes LIKE ? LIMIT 6", 2),
    ("Important dates", "SELECT name, 'expires ' || date, 'home/dates' FROM important_dates WHERE name LIKE ? OR notes LIKE ? LIMIT 5", 2),
    ("Shopping", "SELECT name, category || CASE WHEN bought THEN ' · bought' ELSE '' END, 'shopping' FROM shopping_items "
                 "WHERE name LIKE ? OR description LIKE ? ORDER BY bought LIMIT 6", 2),
    ("Bills", "SELECT name, '$' || printf('%.2f', amount) || ' · day ' || due_day, 'finances/bills' FROM fin_bills WHERE name LIKE ? LIMIT 5", 1),
    ("Transactions", "SELECT COALESCE(NULLIF(m.name, ''), NULLIF(t.payee, ''), t.description), "
                     "t.posted || ' · $' || printf('%.2f', -t.amount), 'finances/transactions' "
                     "FROM fin_transactions t LEFT JOIN fin_merchants m ON m.key = t.merchant_key "
                     "WHERE t.description LIKE ? OR t.payee LIKE ? OR m.name LIKE ? ORDER BY t.posted DESC LIMIT 8", 3),
]


def search(conn, q: str) -> list[dict]:
    q = (q or "").strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"
    recent = (date.today() - timedelta(days=60)).isoformat()
    groups = []
    for group, sql, binds in SOURCES:
        params = (like, recent) if binds == "recent" else (like,) * binds
        try:
            rows = conn.execute(sql, params).fetchall()
        except sqlite3.OperationalError:  # that page isn't set up yet
            continue
        if rows:
            groups.append({"group": group, "items": [{"title": r[0], "sub": r[1] or "", "link": r[2]} for r in rows]})
    return groups
