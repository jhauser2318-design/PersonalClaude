"""API endpoints for Finances."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import config
from ...database import get_db
from ..assistant.claude_client import AssistantError
from ..goals.service import ValidationError
from . import assistant, service, simplefin, sync

router = APIRouter(prefix="/api/finances", tags=["finances"])


class TokenIn(BaseModel):
    token: str


class DisconnectIn(BaseModel):
    delete_data: bool = False


class TxPatch(BaseModel):
    category: str | None = None
    apply_to_similar: bool = False
    note: str | None = None


class AccountPatch(BaseModel):
    nickname: str | None = None
    kind: str | None = None
    hidden: bool | None = None


class BudgetIn(BaseModel):
    amount: float | None = None


class Turn(BaseModel):
    role: str
    content: str


class AskIn(BaseModel):
    question: str = ""
    history: list[Turn] = []
    report: str | None = None
    day: str | None = None


class RuleIn(BaseModel):
    text: str


class RulePatch(BaseModel):
    text: str | None = None
    enabled: bool | None = None


def _run(fn, *args, **kwargs):
    try:
        with get_db() as conn:
            return fn(conn, *args, **kwargs)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
def status():
    with get_db() as conn:
        st = service.sync_status(conn)
        count = conn.execute("SELECT COUNT(*) AS n FROM fin_transactions").fetchone()["n"]
    return {"connected": simplefin.is_connected(), "syncing": sync.is_running(), "transactions": count,
            "api_key_configured": config.api_key_configured(), **st}


@router.post("/connect")
async def connect(body: TokenIn):
    try:
        await run_in_threadpool(simplefin.claim, body.token)
    except simplefin.FinanceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    sync.sync_in_background(only_if_stale=False)  # first sync: ~90 days of history
    return {"ok": True}


@router.post("/disconnect")
def disconnect(body: DisconnectIn):
    simplefin.disconnect()
    if body.delete_data:
        with get_db() as conn:
            for table in ("fin_transactions", "fin_accounts", "fin_merchants", "fin_budgets"):
                conn.execute(f"DELETE FROM {table}")
            service.save_sync_status(conn, ok=False)
            conn.execute("DELETE FROM app_settings WHERE key = 'fin_last_sync'")
    return {"ok": True}


@router.post("/sync")
async def sync_now():
    try:
        return await run_in_threadpool(sync.run_sync)
    except simplefin.FinanceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync-if-stale")
def sync_if_stale():
    return {"started": sync.sync_in_background(only_if_stale=True)}


@router.get("/overview")
def overview(month: str | None = None):
    data = _run(service.overview)
    if month:
        data["month"] = _run(service.month_summary, month)
    return data


@router.get("/transactions")
def transactions(start: str | None = None, end: str | None = None, category: str | None = None,
                 account_id: str | None = None, search: str | None = None, limit: int = 1000):
    return _run(service.list_transactions, start=start, end=end, category=category or None,
                account_id=account_id or None, search=search or None, limit=min(limit, 5000))


@router.patch("/transactions/{tx_id:path}")
def update_transaction(tx_id: str, body: TxPatch):
    return _run(service.set_transaction_category, tx_id, body.category, body.apply_to_similar, body.note)


@router.patch("/accounts/{account_id:path}")
def update_account(account_id: str, body: AccountPatch):
    return _run(service.update_account, account_id, body.model_dump(exclude_unset=True))


@router.get("/budgets")
def budgets(month: str | None = None):
    return {
        "categories": service.SPENDING_CATEGORIES,
        "budgets": _run(service.list_budgets),
        "suggested": _run(service.suggest_budgets),
        "month": _run(service.month_summary, month),
    }


@router.put("/budgets/{category}")
def set_budget(category: str, body: BudgetIn):
    return _run(service.set_budget, category, body.amount)


@router.get("/categories")
def categories():
    return {"all": service.CATEGORIES, "spending": service.SPENDING_CATEGORIES}


@router.post("/categorize")
async def categorize():
    try:
        return {"sorted": await run_in_threadpool(assistant.categorize)}
    except AssistantError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ask")
async def ask(body: AskIn):
    if body.report and body.report not in assistant.REPORTS:
        raise HTTPException(status_code=400, detail="Unknown report")
    if not body.report and not body.question.strip():
        raise HTTPException(status_code=400, detail="Type a question first")
    try:
        return await run_in_threadpool(assistant.ask, body.question.strip(),
                                       [t.model_dump() for t in body.history], body.report, body.day)
    except (AssistantError, simplefin.FinanceError) as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Daily cash analysis ------------------------------------------------------------

@router.get("/day")
def day(date: str | None = None):
    return _run(service.day_summary, date)


# --- Your rules (plain English, followed by the AI) ----------------------------------

@router.get("/rules")
def rules():
    return {"rules": _run(service.list_rules), "resorting": assistant.resorting()}


@router.post("/rules")
def add_rule(body: RuleIn):
    return _run(service.add_rule, body.text)


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: int, body: RulePatch):
    return _run(service.update_rule, rule_id, body.text, body.enabled)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int):
    _run(service.delete_rule, rule_id)
    return {"ok": True}


@router.post("/rules/apply")
async def apply_rules():
    """Re-sort every transaction the AI sorted, using the current rules."""
    if assistant.resorting():
        return {"sorted": 0, "busy": True}
    try:
        return {"sorted": await run_in_threadpool(assistant.resort)}
    except AssistantError as e:
        raise HTTPException(status_code=400, detail=str(e))
