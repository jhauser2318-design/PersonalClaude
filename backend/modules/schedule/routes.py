"""API endpoints for the daily schedule and the focus timer."""
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ...database import get_db
from ..goals.service import ValidationError
from . import service

router = APIRouter(prefix="/api", tags=["schedule"])


class BlockIn(BaseModel):
    date: str
    start: str
    end: str
    title: str
    area: str | None = None
    notes: str = ""


class BlockPatch(BaseModel):
    date: str | None = None
    start: str | None = None
    end: str | None = None
    title: str | None = None
    area: str | None = None
    notes: str | None = None
    done: bool | None = None


class CopyIn(BaseModel):
    from_date: str
    to_date: str
    replace: bool = False


class TemplateIn(BaseModel):
    name: str
    weekdays: list[int] = []
    blocks: list[dict] | None = None
    from_date: str | None = None   # save this day's blocks as the template


class ApplyIn(BaseModel):
    date: str


class PresetsIn(BaseModel):
    presets: list[dict]


class FocusIn(BaseModel):
    minutes: float
    label: str = ""
    habit_id: int | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/schedule")
async def day(date_: str | None = None, day: str | None = None):
    d = day or date_ or date.today().isoformat()
    data = _run(service.day_plan, d)
    data["templates"] = _run(service.list_templates)
    data["presets"] = _run(service.list_presets)
    # Important events from Google Calendar, shown next to your blocks (read-only here).
    from ..calendar import google, service as calendar
    data["events"] = []
    if google.is_connected():
        try:
            data["events"] = await run_in_threadpool(calendar.list_events, date.fromisoformat(data["date"]), 1)
        except Exception:  # noqa: BLE001 (the schedule works without the calendar)
            pass
    return data


@router.post("/schedule/blocks")
def create(body: BlockIn):
    return _run(service.create_block, body.model_dump())


@router.patch("/schedule/blocks/{block_id}")
def update(block_id: int, body: BlockPatch):
    return _run(service.update_block, block_id, body.model_dump(exclude_unset=True))


@router.delete("/schedule/blocks/{block_id}")
def delete(block_id: int):
    _run(service.delete_block, block_id)
    return {"ok": True}


@router.post("/schedule/copy")
def copy(body: CopyIn):
    return _run(service.copy_day, body.from_date, body.to_date, body.replace)


@router.get("/schedule/templates")
def templates():
    return _run(service.list_templates)


@router.post("/schedule/templates")
def save_template(body: TemplateIn):
    def work(conn):
        blocks = body.blocks if body.blocks is not None else service.list_blocks(conn, body.from_date or date.today().isoformat())
        return service.save_template(conn, body.name, body.weekdays, blocks)
    return _run(work)


@router.patch("/schedule/templates/{template_id}")
def update_template(template_id: int, body: TemplateIn):
    def work(conn):
        blocks = body.blocks if body.blocks is not None else service.list_blocks(conn, body.from_date or date.today().isoformat())
        return service.save_template(conn, body.name, body.weekdays, blocks, template_id)
    return _run(work)


@router.delete("/schedule/templates/{template_id}")
def delete_template(template_id: int):
    _run(service.delete_template, template_id)
    return {"ok": True}


@router.post("/schedule/templates/{template_id}/apply")
def apply_template(template_id: int, body: ApplyIn):
    return _run(service.apply_template, template_id, body.date)


@router.put("/schedule/presets")
def save_presets(body: PresetsIn):
    return _run(service.save_presets, body.presets)


@router.post("/focus/finish")
def finish_focus(body: FocusIn):
    return _run(service.finish_focus, body.minutes, body.label, body.habit_id)


@router.get("/focus/today")
def focus_today():
    return {"minutes": _run(service.focus_today)}


@router.get("/today")
def today():
    """For the Dashboard: today's plan, plus a heads-up list from the other modules."""
    from datetime import timedelta

    def work(conn):
        plan = service.day_plan(conn, date.today().isoformat())
        heads = []

        def add(fn):
            try:
                fn()
            except Exception:  # noqa: BLE001 (a module that isn't set up just adds nothing)
                pass

        def people():
            from ..people import service as ppl
            s = ppl.summary(conn)
            for p in s["birthdays"]:
                if p["birthday_in"] <= 7:
                    heads.append({"icon": "🎂", "text": f"{p['name']}'s birthday " + ("today" if p["birthday_in"] == 0 else f"in {p['birthday_in']} days"), "link": "people"})
            if s["due"]:
                heads.append({"icon": "👋", "text": "Reach out to " + ", ".join(p["name"] for p in s["due"][:3]) + ("…" if len(s["due"]) > 3 else ""), "link": "people"})

        def home():
            from ..home import service as hm
            for it in hm.list_maintenance(conn):
                if it["status"] == "overdue" or (it["due_in"] is not None and it["due_in"] <= 3):
                    heads.append({"icon": "🔧", "text": f"{it['name']}: " + ("overdue" if it["due_in"] < 0 else "due today" if it["due_in"] == 0 else f"due in {it['due_in']} days"), "link": "home"})
            for d in hm.list_dates(conn):
                if d["status"] in ("expired", "soon"):
                    heads.append({"icon": "📄", "text": f"{d['name']}: " + ("expired" if d["days_left"] < 0 else f"expires in {d['days_left']} days"), "link": "home/dates"})

        def bills():
            from ..finances import planning
            if not conn.execute("SELECT (SELECT COUNT(*) FROM fin_bills) + (SELECT COUNT(*) FROM fin_accounts)").fetchone()[0]:
                return
            t = date.today()
            items = planning.bills_for_month(conn)["items"]
            if t.day > 24:
                items += planning.bills_for_month(conn, (t.replace(day=28) + timedelta(days=5)).strftime("%Y-%m"))["items"]
            soon = [i for i in items if t.isoformat() <= i["date"] <= (t + timedelta(days=3)).isoformat()]
            for i in soon:
                heads.append({"icon": "💳", "text": f"{i['name']} ${i['amount']:,.0f} due " + ("today" if i["date"] == t.isoformat() else date.fromisoformat(i["date"]).strftime("%a")), "link": "finances/bills"})

        def review():
            if date.today().weekday() == 6:
                from ..review import service as rv
                r = rv.get_review(conn)["review"]
                if not r["completed_at"]:
                    heads.append({"icon": "📝", "text": "Sunday: time for your weekly review", "link": "review"})

        for fn in (people, home, bills, review):
            add(fn)
        return {"plan": plan, "heads_up": heads}
    return _run(work)
