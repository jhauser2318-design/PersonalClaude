"""API endpoints for Finances."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ... import config
from ...database import get_db
from ..assistant.claude_client import AssistantError
from ..goals.service import ValidationError
from . import assistant, planning, service, simplefin, sync

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
    try:
        simplefin.disconnect()
    except simplefin.FinanceError as e:
        raise HTTPException(status_code=400, detail=str(e))
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


# --- Income per day (Daily view) ------------------------------------------------------

class IncomeIn(BaseModel):
    monthly: float | None = None


@router.get("/income")
def income():
    return _run(service.income_rate)


@router.put("/income")
def set_income(body: IncomeIn):
    return _run(service.set_income_monthly, body.monthly)


# --- Loans and payoff forecasts ---------------------------------------------------------

class LoanIn(BaseModel):
    name: str | None = None
    lender: str | None = None
    account_id: str | None = None
    balance: float | None = None
    apr: float | None = None
    payment: float | None = None
    due_day: int | None = None
    notes: str | None = None


class ForecastIn(BaseModel):
    extra: float = 0
    lump: float = 0


@router.get("/loans")
def loans():
    def work(conn):
        out = []
        for loan in service.list_loans(conn):
            if loan.get("id") and loan["payment"]:
                loan["forecast"] = service.amortize(loan["balance"], loan["apr"], loan["payment"])
            out.append(loan)
        return {"loans": out, "income": service.income_rate(conn)}
    return _run(work)


@router.post("/loans")
def add_loan(body: LoanIn):
    return _run(service.save_loan, body.model_dump(exclude_none=True))


@router.patch("/loans/{loan_id}")
def update_loan(loan_id: int, body: LoanIn):
    return _run(service.save_loan, body.model_dump(exclude_unset=True), loan_id)


@router.delete("/loans/{loan_id}")
def delete_loan(loan_id: int):
    _run(service.delete_loan, loan_id)
    return {"ok": True}


@router.post("/loans/{loan_id}/forecast")
def forecast(loan_id: int, body: ForecastIn):
    return _run(service.loan_forecast, loan_id, body.extra, body.lump)


# ---------------------------------------------------------------------------
# Bills & subscriptions, savings goals
# ---------------------------------------------------------------------------

class BillIn(BaseModel):
    name: str
    amount: float = 0
    due_day: int
    frequency: str = "monthly"
    start_month: int | None = None
    category: str = "Utilities & Phone"
    autopay: bool = False
    subscription: bool = False
    notes: str = ""


class SubFlagIn(BaseModel):
    merchant: str
    status: str
    note: str = ""


class SavingsIn(BaseModel):
    name: str
    target: float
    saved: float = 0
    account_id: str | None = None
    target_date: str | None = None
    goal_id: int | None = None


@router.get("/bills")
def bills(month: str | None = None):
    return _run(planning.bills_for_month, month)


@router.post("/bills")
def add_bill(body: BillIn):
    return _run(planning.save_bill, body.model_dump())


@router.patch("/bills/{bill_id}")
def update_bill(bill_id: int, body: BillIn):
    return _run(planning.save_bill, body.model_dump(), bill_id)


@router.delete("/bills/{bill_id}")
def delete_bill(bill_id: int):
    _run(planning.delete_bill, bill_id)
    return {"ok": True}


@router.put("/subscriptions")
def flag_subscription(body: SubFlagIn):
    return _run(planning.set_sub_flag, body.merchant, body.status, body.note)


@router.get("/savings")
def savings():
    return _run(planning.savings_overview)


@router.post("/savings")
def add_savings(body: SavingsIn):
    return _run(planning.save_savings, body.model_dump())


@router.patch("/savings/{goal_id}")
def update_savings(goal_id: int, body: SavingsIn):
    return _run(planning.save_savings, body.model_dump(), goal_id)


@router.delete("/savings/{goal_id}")
def delete_savings(goal_id: int):
    _run(planning.delete_savings, goal_id)
    return {"ok": True}
