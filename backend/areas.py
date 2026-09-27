"""The life areas every goal and task belongs to.

To add or rename an area later, change this list. Colors are used by the
frontend (it fetches them from /api/areas).
"""
AREAS = [
    {"id": "work", "name": "Work", "color": "#3b82f6", "icon": "💼"},
    {"id": "health", "name": "Health", "color": "#10b981", "icon": "💪"},
    {"id": "social", "name": "Social", "color": "#f59e0b", "icon": "🤝"},
    {"id": "education", "name": "Education", "color": "#8b5cf6", "icon": "📚"},
]

AREA_IDS = [a["id"] for a in AREAS]
