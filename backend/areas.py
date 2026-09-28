"""The life areas every goal and task belongs to.

To add or rename an area later, change this list. Colors are used by the
frontend (it fetches them from /api/areas).
"""
AREAS = [
    {"id": "work", "name": "Work", "color": "#60a5fa", "icon": "💼"},
    {"id": "health", "name": "Health", "color": "#34d399", "icon": "💪"},
    {"id": "social", "name": "Social", "color": "#fbbf24", "icon": "🤝"},
    {"id": "education", "name": "Education", "color": "#a78bfa", "icon": "📚"},
]

AREA_IDS = [a["id"] for a in AREAS]
