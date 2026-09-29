// Finances: bank and credit card accounts (via SimpleFIN), cash flow,
// budgets, transactions and AI reports. Each tab lives in views/finance/.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, showError, toast } from "../ui.js";
import { renderBills, renderSavings } from "./finance/planning.js";
import { renderBudgets } from "./finance/budgets.js";
import { ago, catColor, money, monthLabel, shiftMonth, signed, thisMonth, ui } from "./finance/common.js";
import { renderDaily } from "./finance/daily.js";
import { renderLoans } from "./finance/loans.js";
import { renderReports } from "./finance/reports.js";
import { renderRules } from "./finance/rules.js";
import { openAccountEditor, openDisconnect, renderTransactions } from "./finance/transactions.js";

const TABS = [
  ["overview", "Overview"], ["daily", "Daily"], ["transactions", "Transactions"], ["budgets", "Budgets"],
  ["bills", "Bills"], ["savings", "Savings"], ["loans", "Loans"], ["rules", "Rules"], ["reports", "Reports & questions"],
];
let pollTimer;
// ===========================================================================
// Page
// ===========================================================================

export async function render(view, arg) {
  if (arg && TABS.some(([id]) => id === arg)) ui.tab = arg;
  clearTimeout(pollTimer);
  const status = await api.get("/finances/status");
  if (!status.connected) return renderSetup(view, status);
  if (!status.transactions && (status.syncing || !status.last_error)) return renderFirstSync(view, status);

  // Refresh from SimpleFIN in the background if the last sync is old.
  if (!status.syncing) api.post("/finances/sync-if-stale").then((r) => { if (r.started) poll(view); }).catch(() => {});
  else poll(view);

  view.innerHTML = `<div id="fin-root">
    <div class="page-head"><div>
      <div class="eyebrow">Money · via SimpleFIN</div>
      <h1>Finances</h1>
      <div class="status-chips" id="fin-chips">${chips(status)}</div></div>
      <div class="fin-head-actions">
        <button class="btn" id="fin-sync">${icon("refresh")} Sync now</button>
      </div></div>
    ${status.last_error ? `<div class="fin-alert danger">${esc(status.last_error)}</div>` : ""}
    ${status.messages?.length ? `<div class="fin-alert">${status.messages.map((m) => `<div>${esc(m)}</div>`).join("")}
      <div class="muted small">Fix connection problems on the SimpleFIN Bridge website; the app picks the fix up on the next sync.</div></div>` : ""}
    <div class="segmented fin-tabs" role="tablist">${TABS.map(([id, label]) =>
      `<button data-tab="${id}" class="${ui.tab === id ? "active" : ""}" role="tab">${label}</button>`).join("")}</div>
    <div id="fin-tab"></div></div>`;
  const root = view.querySelector("#fin-root");
  root.querySelector(".fin-tabs").onclick = (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    ui.tab = b.dataset.tab;
    root.querySelectorAll(".fin-tabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderTab(root);
  };
  root.querySelector("#fin-sync").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `${icon("loader")} Syncing…`;
    try {
      const r = await api.post("/finances/sync");
      toast(r.busy ? "A sync is already running" : `Synced · ${r.new || 0} new transaction${r.new === 1 ? "" : "s"}`, 4000);
      if (r.categorize_error) toast(r.categorize_error, 8000);
    } catch (err) { toast(err.message, 8000); }
    render(view);
  };
  await renderTab(root);
}

export function chips(status) {
  return `
    <span class="status-chip"><span class="dot" style="--c:${status.last_error ? "var(--danger)" : "var(--success)"}"></span>synced <b>${esc(ago(status.last_sync))}</b></span>
    ${status.syncing ? `<span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span>syncing…</span>` : ""}
    <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${status.transactions}</b> transactions</span>`;
}

// While a background sync runs, check back and redraw when it's done.
function poll(view) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (!view.querySelector("#fin-root, #fin-setup")) return; // left the page
    try {
      const s = await api.get("/finances/status");
      if (s.syncing) return poll(view);
      render(view);
    } catch (e) { /* try again next time */ }
  }, 3000);
}

export async function renderTab(root) {
  const box = root.querySelector("#fin-tab");
  box.innerHTML = `<div class="card empty">Loading…</div>`;
  const fn = { overview: renderOverview, daily: renderDaily, transactions: renderTransactions, budgets: renderBudgets,
    loans: renderLoans, rules: renderRules, reports: renderReports, bills: renderBills, savings: renderSavings }[ui.tab];
  try { await fn(box, root); } catch (err) { box.innerHTML = `<div class="card empty">${esc(err.message)}</div>`; }
}

// ===========================================================================
// Connecting
// ===========================================================================

function renderSetup(view, status) {
  view.innerHTML = `<div id="fin-setup">
    <div class="page-head"><div><div class="eyebrow">Money</div><h1>Finances</h1>
      <p class="sub">Connect your bank and credit card accounts to see cash flow, budgets and AI reports.</p></div></div>
    <div class="card fin-setup">
      <h2>Connect with SimpleFIN</h2>
      <ol>
        <li>Open <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noopener">SimpleFIN Bridge</a> and sign in
          (your banks and cards are already linked there).</li>
        <li>Create a new <b>Setup Token</b> for an app (look for “New app connection” or “Setup token”)
          and copy it. It's a long string of letters and numbers.</li>
        <li>Paste it below and click <b>Connect</b>.</li>
      </ol>
      <form id="fin-connect">
        <label class="field"><span>SimpleFIN Setup Token</span>
          <textarea name="token" rows="3" required placeholder="aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS8…" spellcheck="false"></textarea></label>
        <button class="btn primary" type="submit">${icon("link")} Connect</button>
      </form>
      <p class="fin-fine">A setup token works once. The app trades it for a private, <b>read-only</b> link that can see balances
        and transactions but can't move money. It's saved only on this computer (<code>data/simplefin.json</code>),
        never uploaded. ${status.transactions ? "Your previously synced data is still here." : ""}</p>
    </div></div>`;
  const form = view.querySelector("#fin-connect");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true; btn.innerHTML = `${icon("loader")} Connecting…`;
    try {
      await api.post("/finances/connect", { token: form.token.value });
      toast("Connected! Pulling in your accounts…", 4000);
      render(view);
    } catch (err) {
      showError(form, err);
      btn.disabled = false; btn.innerHTML = `${icon("link")} Connect`;
    }
  });
}

function renderFirstSync(view, status) {
  view.innerHTML = `<div id="fin-root">
    <div class="page-head"><div><div class="eyebrow">Money</div><h1>Finances</h1></div></div>
    <div class="card fin-setup fin-syncing">
      <div class="fin-spinner">${icon("loader")}</div>
      <h2>${status.syncing ? "Pulling in your accounts…" : "Connected"}</h2>
      <p>${status.syncing ? "Reading about 90 days of transactions from SimpleFIN, then sorting them into categories with AI. This usually takes under a minute."
        : "No transactions yet."}</p>
      ${status.syncing ? "" : `<button class="btn primary" id="fin-first">${icon("refresh")} Sync now</button>`}
    </div></div>`;
  view.querySelector("#fin-first")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try { await api.post("/finances/sync"); } catch (err) { toast(err.message, 8000); }
    render(view);
  });
  if (status.syncing) poll(view);
}

// ===========================================================================
// Overview
// ===========================================================================

async function renderOverview(box, root) {
  ui.month ||= thisMonth();
  const data = await api.get(`/finances/overview?month=${ui.month}`);
  const m = data.month;
  const firstMonth = (data.first_date || "").slice(0, 7);
  const budgetLeft = m.budget_total ? m.budget_total - m.budgeted_spent : null;
  const recurringTotal = data.recurring.reduce((s, r) => s + r.amount, 0);

  box.innerHTML = `
    <div class="fin-month">
      <button class="icon-btn" data-month="-1" aria-label="Previous month" ${firstMonth && ui.month <= firstMonth ? "disabled" : ""}>‹</button>
      <b>${esc(monthLabel(ui.month))}</b>
      <button class="icon-btn" data-month="1" aria-label="Next month" ${ui.month >= thisMonth() ? "disabled" : ""}>›</button>
      ${m.is_current ? `<span class="muted small">day ${m.day} of ${m.days}</span>` : ""}
    </div>
    <div class="fin-kpis">
      ${kpi("Money in", money(m.income), "var(--success)", "income, not counting transfers")}
      ${kpi("Money out", money(m.spending), "var(--accent)", "spending after refunds")}
      ${kpi("Net cash flow", signed(m.net), m.net >= 0 ? "var(--success)" : "var(--danger)", m.net >= 0 ? "you kept this much" : "spent more than came in")}
      ${budgetLeft != null
        ? kpi("Budget left", money(budgetLeft), budgetLeft >= 0 ? "var(--accent-2)" : "var(--danger)", `of ${money(m.budget_total, false)} budgeted`)
        : kpi("Net worth (cash − cards)", signed(data.balances.net), "var(--accent-2)", "across your linked accounts")}
    </div>
    ${data.uncategorized ? `<div class="fin-alert">${data.uncategorized} transaction${data.uncategorized === 1 ? " isn't" : "s aren't"} sorted into a category yet.
      <button class="btn small" id="fin-cat">${icon("sparkle")} Sort with AI</button></div>` : ""}
    <div class="fin-grid">
      <section class="card fin-card">
        <header><h2>Cash flow</h2><span class="eyebrow">last 4 months</span></header>
        ${cashflowChart(data.cashflow)}
      </section>
      <section class="card fin-card">
        <header><h2>Balances</h2><span class="eyebrow">today</span></header>
        ${balancesCard(data)}
      </section>
      <section class="card fin-card fin-wide">
        <header><h2>Where the money went</h2><span class="eyebrow">${esc(monthLabel(ui.month))}${m.budget_total ? " · vs budget" : ""}</span></header>
        ${categoryBars(m)}
      </section>
      <section class="card fin-card">
        <header><h2>Recurring charges</h2><span class="eyebrow">${data.recurring.length ? `≈ ${money(recurringTotal, false)}/month` : "subscriptions & bills"}</span></header>
        ${data.recurring.length ? `<ul class="fin-list">${data.recurring.map((r) => `
          <li><div><div class="fin-li-title">${esc(r.merchant)}</div>
            <div class="fin-li-sub">${esc(r.category)} · next ≈ ${esc(fmtDate(r.next_date))}</div></div>
            <b class="mono">${money(r.amount)}</b></li>`).join("")}</ul>`
          : `<div class="empty">Nothing repeating yet. Recurring charges show up once they've appeared in two different months.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Top merchants</h2><span class="eyebrow">${esc(monthLabel(ui.month, true))}</span></header>
        ${m.top_merchants.length ? `<ul class="fin-list">${m.top_merchants.map((r) => `
          <li><div><div class="fin-li-title">${esc(r.merchant)}</div>
            <div class="fin-li-sub">${esc(r.category)} · ${r.count}×</div></div>
            <b class="mono">${money(r.spent)}</b></li>`).join("")}</ul>` : `<div class="empty">No spending this month.</div>`}
      </section>
    </div>`;

  box.querySelectorAll("[data-month]").forEach((b) => {
    b.onclick = () => { ui.month = shiftMonth(ui.month, Number(b.dataset.month)); renderTab(root); };
  });
  box.querySelectorAll("[data-cat]").forEach((b) => {
    b.onclick = () => {
      ui.filters = { period: ui.month, account_id: "", category: b.dataset.cat, search: "" };
      root.querySelector('[data-tab="transactions"]').click();
    };
  });
  box.querySelectorAll("[data-account]").forEach((b) => {
    b.onclick = () => openAccountEditor(data.accounts.find((a) => a.id === b.dataset.account), () => renderTab(root));
  });
  box.querySelector("#fin-cat")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true; e.currentTarget.innerHTML = `${icon("loader")} Sorting…`;
    try { const r = await api.post("/finances/categorize"); toast(`Sorted ${r.sorted} merchant${r.sorted === 1 ? "" : "s"}`); }
    catch (err) { toast(err.message, 8000); }
    renderTab(root);
  });
  box.querySelector("#fin-disconnect")?.addEventListener("click", () => openDisconnect(root));
}

export function kpi(label, value, color, sub) {
  return `<div class="card fin-kpi" style="--c:${color}"><div class="eyebrow">${esc(label)}</div>
    <div class="fin-kpi-value">${esc(value)}</div><div class="fin-kpi-sub">${esc(sub)}</div></div>`;
}

function cashflowChart(rows) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.spending]));
  const h = (v) => `${Math.max(0, (v / max) * 100).toFixed(1)}%`;
  return `
    <div class="fin-legend"><span><i style="--c:var(--success)"></i>In</span><span><i style="--c:var(--accent)"></i>Out</span></div>
    <div class="fin-cash">${rows.map((r) => `
      <div class="fin-cash-col" title="${esc(monthLabel(r.month))}: in ${money(r.income)}, out ${money(r.spending)}">
        <div class="fin-cash-net ${r.net >= 0 ? "pos" : "neg"}">${r.count ? `${r.net >= 0 ? "+" : "−"}${esc(money(Math.abs(r.net), false))}` : "–"}</div>
        <div class="fin-cash-bars">
          <span class="in" style="height:${h(r.income)}"></span>
          <span class="out" style="height:${h(r.spending)}"></span>
        </div>
        <div class="fin-cash-label">${esc(monthLabel(r.month, true))}${r.month === thisMonth() ? "*" : ""}</div>
      </div>`).join("")}</div>
    <div class="fin-fine">Net shown above each month. * this month so far.</div>`;
}

function balancesCard(data) {
  const b = data.balances;
  return `
    <div class="fin-bal-top">
      <div><div class="eyebrow">Cash</div><b>${money(b.cash)}</b></div>
      <div><div class="eyebrow">Card balances</div><b>${money(b.debt)}</b></div>
      ${b.loans ? `<div><div class="eyebrow">Loans</div><b>${money(b.loans)}</b></div>` : ""}
      <div><div class="eyebrow">Net</div><b class="${b.net >= 0 ? "pos" : "neg"}">${signed(b.net)}</b></div>
    </div>
    <ul class="fin-list">${data.accounts.map((a) => `
      <li class="${a.hidden ? "is-hidden" : ""}">
        <div><div class="fin-li-title">${esc(a.display_name)}${a.hidden ? ` <span class="pill">hidden</span>` : ""}</div>
          <div class="fin-li-sub">${esc(a.org)} · ${esc(a.kind)}${a.balance_date ? ` · as of ${esc(fmtDate(a.balance_date))}` : ""}</div></div>
        <b class="mono ${a.balance < 0 ? "neg" : ""}">${money(a.balance)}</b>
        <button class="icon-btn" data-account="${esc(a.id)}" aria-label="Edit account">${icon("edit")}</button></li>`).join("")}</ul>
    <div class="fin-card-foot"><button class="btn small" id="fin-disconnect">Connection…</button></div>`;
}

function categoryBars(m) {
  const rows = m.categories.filter((r) => r.spent > 0 || r.budget);
  if (!rows.length) return `<div class="empty">No spending in this month.</div>`;
  const max = Math.max(...rows.map((r) => Math.max(r.spent, r.budget || 0)));
  const pace = m.is_current ? m.day / m.days : 1;
  return `<div class="fin-bars">${rows.map((r) => {
    const w = (v) => `${((v / max) * 100).toFixed(1)}%`;
    const state = r.status === "over" ? "over" : r.status === "ahead" ? "ahead" : "";
    return `
      <button class="fin-bar ${state}" data-cat="${esc(r.category)}" style="--c:${catColor(r.category)}">
        <span class="fin-bar-name">${esc(r.category)}</span>
        <span class="fin-bar-track">
          <span class="fin-bar-fill" style="width:${w(Math.max(r.spent, 0))}"></span>
          ${r.budget ? `<span class="fin-bar-budget" style="left:${w(r.budget)}" title="Budget ${money(r.budget, false)}"></span>` : ""}
          ${r.budget && m.is_current ? `<span class="fin-bar-pace" style="left:${w(r.budget * pace)}" title="Where you'd be on pace today"></span>` : ""}
        </span>
        <span class="fin-bar-value mono">${money(r.spent, false)}${r.budget ? `<small> / ${money(r.budget, false)}</small>` : ""}</span>
      </button>`;
  }).join("")}</div>
  <div class="fin-fine">Click a category to see its transactions.${m.budget_total ? " The white tick is your budget" + (m.is_current ? "; the faint tick is where you'd be on pace today." : ".") : " Set budgets on the Budgets tab."}</div>`;
}
