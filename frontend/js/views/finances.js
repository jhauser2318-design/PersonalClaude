// Finances: bank and credit card accounts (via SimpleFIN), cash flow,
// budgets, transactions and AI reports.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";
import { renderBills, renderSavings } from "./finance-planning.js";

const TABS = [
  ["overview", "Overview"], ["daily", "Daily"], ["transactions", "Transactions"], ["budgets", "Budgets"],
  ["bills", "Bills"], ["savings", "Savings"], ["loans", "Loans"], ["rules", "Rules"], ["reports", "Reports & questions"],
];
const ui = { tab: "overview", month: null, day: null, filters: { period: "", account_id: "", category: "", search: "" },
  chat: [], ruleDraft: "", rulesChanged: false };
let pollTimer;

const money = (n, cents = true) => (n ?? 0).toLocaleString(undefined, {
  style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
});
const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
const monthLabel = (m, short = false) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, short ? { month: "short" } : { month: "long", year: "numeric" });
};
const thisMonth = () => todayISO().slice(0, 7);
function shiftMonth(m, by) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(m) {
  const [y, mo] = m.split("-").map(Number);
  return [`${m}-01`, `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`];
}
function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return fmtDate(iso.slice(0, 10));
}

// Category colors: a fixed hue per category so charts stay consistent.
const CAT_COLORS = {
  "Housing": "#818cf8", "Utilities & Phone": "#60a5fa", "Groceries": "#34d399", "Dining & Coffee": "#fb923c",
  "Transportation": "#22d3ee", "Gas": "#38bdf8", "Shopping": "#c084fc", "Entertainment": "#f472b6",
  "Subscriptions": "#a78bfa", "Health & Fitness": "#4ade80", "Personal Care": "#f9a8d4", "Travel": "#2dd4bf",
  "Education": "#facc15", "Insurance": "#94a3b8", "Fees & Interest": "#fb7185", "Debt Payments": "#f97316", "Gifts & Donations": "#fbbf24",
  "Other": "#9ca3af", "Uncategorized": "#6b7280", "Income": "#34d399", "Transfer": "#64748b",
};
const catColor = (c) => CAT_COLORS[c] || "#9ca3af";
const catChip = (c) => `<span class="fin-cat" style="--c:${catColor(c)}"><span class="dot"></span>${esc(c)}</span>`;

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

function chips(status) {
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

async function renderTab(root) {
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

function kpi(label, value, color, sub) {
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

// ===========================================================================
// Transactions
// ===========================================================================

async function renderTransactions(box, root) {
  const [cats, overview] = await Promise.all([api.get("/finances/categories"), api.get("/finances/overview")]);
  const months = [];
  const first = (overview.first_date || thisMonth()).slice(0, 7);
  for (let m = thisMonth(); m >= first && months.length < 12; m = shiftMonth(m, -1)) months.push(m);
  const f = ui.filters;
  box.innerHTML = `
    <div class="fin-filters card">
      <select id="f-period"><option value="">All (last ${months.length} months)</option>
        ${months.map((m) => `<option value="${m}" ${f.period === m ? "selected" : ""}>${esc(monthLabel(m))}</option>`).join("")}</select>
      <select id="f-account"><option value="">All accounts</option>
        ${overview.accounts.map((a) => `<option value="${esc(a.id)}" ${f.account_id === a.id ? "selected" : ""}>${esc(a.display_name)} (${esc(a.org)})</option>`).join("")}</select>
      <select id="f-category"><option value="">All categories</option>
        ${[...cats.all, "Uncategorized"].map((c) => `<option ${f.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="f-search" placeholder="Search…" value="${esc(f.search)}">
    </div>
    <div id="tx-list"></div>`;
  const list = box.querySelector("#tx-list");
  const load = async () => {
    const params = new URLSearchParams();
    if (f.period) { const [s, e] = monthBounds(f.period); params.set("start", s); params.set("end", e); }
    if (f.account_id) params.set("account_id", f.account_id);
    if (f.category) params.set("category", f.category);
    if (f.search) params.set("search", f.search);
    const rows = await api.get(`/finances/transactions?${params}`);
    const moneyIn = rows.filter((r) => r.amount > 0 && r.category !== "Transfer").reduce((s, r) => s + r.amount, 0);
    const moneyOut = rows.filter((r) => r.amount < 0 && r.category !== "Transfer").reduce((s, r) => s - r.amount, 0);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    list.innerHTML = `
      <div class="fin-tx-sum muted small">${rows.length} transaction${rows.length === 1 ? "" : "s"} · in <b class="pos">${money(moneyIn)}</b> · out <b>${money(moneyOut)}</b> <span class="muted">(transfers not counted)</span></div>
      ${rows.length ? `<ul class="card fin-tx">${rows.map(txRow).join("")}</ul>` : `<div class="card empty">No transactions match.</div>`}`;
    list.querySelectorAll(".fin-tx li").forEach((li) => {
      li.onclick = () => openTxEditor(byId[li.dataset.id], cats.all, load);
    });
  };
  const bind = (id, key, ev = "change") => box.querySelector(id).addEventListener(ev, (e) => { f[key] = e.target.value; load(); });
  bind("#f-period", "period"); bind("#f-account", "account_id"); bind("#f-category", "category");
  let t;
  box.querySelector("#f-search").addEventListener("input", (e) => {
    clearTimeout(t); t = setTimeout(() => { f.search = e.target.value.trim(); load(); }, 250);
  });
  await load();
}

function txRow(r) {
  const showDesc = r.description && r.description.toLowerCase() !== (r.merchant || "").toLowerCase();
  return `
    <li data-id="${esc(r.id)}" role="button" tabindex="0" class="${r.category === "Transfer" ? "is-transfer" : ""}">
      <div class="fin-tx-date mono">${esc(fmtDate(r.posted))}</div>
      <div class="fin-tx-main">
        <div class="fin-li-title">${esc(r.merchant || r.description)}${r.pending ? ` <span class="pill">pending</span>` : ""}</div>
        <div class="fin-li-sub">${showDesc ? `${esc(r.description)} · ` : ""}${esc(r.account_name)}${r.note ? ` · “${esc(r.note)}”` : ""}</div>
      </div>
      <div class="fin-tx-cat">${catChip(r.category)}${r.category_source === "you" ? `<span class="fin-you" title="You set this">✎</span>` : ""}</div>
      <div class="fin-tx-amt mono ${r.amount > 0 ? "pos" : ""}">${signed(r.amount)}</div>
    </li>`;
}

function openTxEditor(tx, categories, onChange) {
  const dlg = openDialog({
    title: "Transaction",
    body: `
      <form id="tx-form" class="dlg-body" style="padding:0">
        <div class="fin-tx-head">
          <div><div class="fin-li-title">${esc(tx.merchant)}</div>
            <div class="fin-li-sub">${esc(tx.description)}<br>${esc(tx.account_name)} · ${esc(fmtDate(tx.posted))}${tx.pending ? " · pending" : ""}</div></div>
          <b class="mono ${tx.amount > 0 ? "pos" : ""}">${signed(tx.amount)}</b>
        </div>
        <label class="field"><span>Category</span>
          <select name="category">${categories.map((c) => `<option ${c === tx.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="fin-check"><input type="checkbox" name="similar" checked>
          <span>Use this for all similar transactions (${esc(tx.merchant)}, ${tx.amount > 0 ? "money in" : "money out"}), now and in the future</span></label>
        <label class="field"><span>Note (optional)</span>
          <input type="text" name="note" value="${esc(tx.note || "")}" placeholder="e.g. Split with Sam"></label>
        ${tx.category === "Transfer" ? `<p class="fin-fine">Transfers are money moving between your own accounts (like paying a card). They don't count as income or spending.</p>` : ""}
      </form>`,
    foot: `<button class="btn" data-make-rule>${icon("sparkle")} Make a rule…</button>
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="tx-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-make-rule]").addEventListener("click", () => {
    ui.ruleDraft = `Transactions from “${tx.merchant}” (bank description like “${tx.description}”) are ${form.category.value}.`;
    dlg.close();
    document.querySelector('.fin-tabs [data-tab="rules"]')?.click();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const changed = form.category.value !== tx.category;
    try {
      await api.patch(`/finances/transactions/${encodeURIComponent(tx.id)}`, {
        category: changed || form.similar.checked ? form.category.value : null,
        apply_to_similar: form.similar.checked,
        note: form.note.value,
      });
      dlg.close();
      toast("Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openAccountEditor(acc, onChange) {
  const dlg = openDialog({
    title: "Account",
    body: `
      <form id="acc-form" class="dlg-body" style="padding:0">
        <p class="fin-fine" style="margin-top:0">${esc(acc.org)} · ${esc(acc.name)}</p>
        <label class="field"><span>Nickname (optional)</span>
          <input type="text" name="nickname" value="${esc(acc.nickname || "")}" placeholder="${esc(acc.name)}"></label>
        <label class="field"><span>Type</span>
          <select name="kind">${["checking", "savings", "credit", "loan", "other"].map((k) =>
            `<option value="${k}" ${k === acc.kind ? "selected" : ""}>${k === "credit" ? "credit card" : k}</option>`).join("")}</select></label>
        <label class="fin-check"><input type="checkbox" name="hidden" ${acc.hidden ? "checked" : ""}>
          <span>Hide this account (leave it out of balances, totals and reports)</span></label>
      </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="acc-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/finances/accounts/${encodeURIComponent(acc.id)}`, {
        nickname: form.nickname.value, kind: form.kind.value, hidden: form.hidden.checked,
      });
      dlg.close();
      toast("Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openDisconnect(root) {
  const dlg = openDialog({
    title: "SimpleFIN connection",
    body: `<p>Disconnecting stops syncing. The app forgets its access link; you can connect again later with a new Setup Token.
      To fully revoke access, also remove this app on the SimpleFIN Bridge website.</p>
      <label class="fin-check"><input type="checkbox" id="del-data"><span>Also delete all synced finance data from this computer</span></label>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn danger" id="do-disconnect">Disconnect</button></div>`,
  });
  dlg.querySelector("#do-disconnect").onclick = async () => {
    await api.post("/finances/disconnect", { delete_data: dlg.querySelector("#del-data").checked });
    dlg.close();
    toast("Disconnected");
    render(root.parentElement);
  };
}

// ===========================================================================
// Daily: a day's cash in and out (yesterday by default)
// ===========================================================================

const dayLabel = (iso, opts = { weekday: "long", month: "short", day: "numeric" }) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};
function shiftDay(iso, by) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + by);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function renderDaily(box, root) {
  const yesterday = shiftDay(todayISO(), -1);
  ui.day ||= yesterday;
  const [d, cats] = await Promise.all([api.get(`/finances/day?date=${ui.day}`), api.get("/finances/categories")]);
  const vsAvg = d.avg_daily_spending ? Math.round(100 * (d.spending - d.avg_daily_spending) / d.avg_daily_spending) : null;
  const mtd = d.month_to_date;
  const byId = Object.fromEntries(d.transactions.map((t) => [t.id, t]));

  box.innerHTML = `
    <div class="fin-month">
      <button class="icon-btn" data-day="-1" aria-label="Previous day" ${d.first_date && ui.day <= d.first_date ? "disabled" : ""}>‹</button>
      <b>${esc(dayLabel(ui.day))}</b>
      <button class="icon-btn" data-day="1" aria-label="Next day" ${ui.day >= todayISO() ? "disabled" : ""}>›</button>
      ${ui.day !== yesterday ? `<button class="btn small" data-yesterday>Yesterday</button>` : `<span class="muted small">yesterday</span>`}
      <button class="btn small primary" id="day-explain" style="margin-left:auto">${icon("sparkle")} Explain this day</button>
    </div>
    <div class="fin-kpis">
      ${kpi("Earned (daily share)", money(d.earned), "var(--success)", `income ≈ ${money(d.income_rate.monthly, false)}/month, spread per day`)}
      ${kpi("Money out", money(d.spending), "var(--accent)", vsAvg == null ? "spending after refunds"
        : `${vsAvg >= 0 ? "▲" : "▼"} ${Math.abs(vsAvg)}% vs a normal day (${money(d.avg_daily_spending, false)})`)}
      ${kpi("Net for the day", signed(d.net_normalized), d.net_normalized >= 0 ? "var(--success)" : "var(--danger)",
        d.net_normalized >= 0 ? "spent less than you earn per day" : "spent more than you earn per day")}
      ${kpi("Month so far", signed(mtd.net_normalized), mtd.net_normalized >= 0 ? "var(--accent-2)" : "var(--danger)",
        `earned ${money(mtd.earned, false)} · spent ${money(mtd.spending, false)} · day ${mtd.days}`)}
    </div>
    <div class="fin-cashline">Income per day: <b class="mono">${money(d.income_rate.daily)}</b>
      <span class="muted">${d.income_rate.source === "set" ? "from the monthly amount you set"
        : d.income_rate.streams.length ? `from ${esc(d.income_rate.streams.map((x) => `${x.name} (${money(x.amount, false)} every ${x.every})`).join(", "))}`
        : "no regular income found yet"}</span>
      <button class="fin-link" id="income-set">${d.income_rate.source === "set" ? "change" : "set it yourself"}</button>
      ${d.income ? `<span>· Deposited this day: <b class="mono pos">${signed(d.income)}</b></span>` : ""}</div>
    ${d.cash ? `<div class="fin-cashline">Cash in checking &amp; savings: <b class="mono">${money(d.cash.start)}</b> → <b class="mono">${money(d.cash.end)}</b>
      <span class="mono ${d.cash.change >= 0 ? "pos" : "neg"}">(${signed(d.cash.change)})</span></div>` : ""}
    <div id="day-answer"></div>
    <div class="fin-grid">
      <section class="card fin-card fin-wide">
        <header><h2>Daily spending</h2><span class="eyebrow">last 30 days · click a day</span></header>
        ${dailyChart(d.series, ui.day, d.avg_daily_spending, d.income_rate.daily)}
      </section>
      <section class="card fin-card">
        <header><h2>Where it went</h2><span class="eyebrow">${esc(dayLabel(ui.day, { month: "short", day: "numeric" }))}</span></header>
        ${d.categories.filter((c) => c.spent > 0).length ? `<ul class="fin-list">${d.categories.filter((c) => c.spent > 0).map((c) => `
          <li><div>${catChip(c.category)}</div><span class="muted small">${c.count}×</span><b class="mono">${money(c.spent)}</b></li>`).join("")}</ul>`
          : `<div class="empty">No spending this day.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Money in</h2><span class="eyebrow">actual deposits</span></header>
        ${d.income_items.length ? `<ul class="fin-list">${d.income_items.map((t) => `
          <li><div><div class="fin-li-title">${esc(t.merchant)}</div><div class="fin-li-sub">${esc(t.account_name)}</div></div>
          <b class="mono pos">${signed(t.amount)}</b></li>`).join("")}</ul>` : `<div class="empty">No income this day.</div>`}
      </section>
    </div>
    <h2 class="section">All transactions <span class="count">${d.transactions.length}</span><span class="line"></span></h2>
    ${d.transactions.length ? `<ul class="card fin-tx">${d.transactions.map(txRow).join("")}</ul>`
      : `<div class="card empty">No transactions on this day. Banks usually post weekend purchases on Monday.</div>`}`;

  const go = (day) => { ui.day = day; renderTab(root); };
  box.querySelectorAll("[data-day]").forEach((b) => { b.onclick = () => go(shiftDay(ui.day, Number(b.dataset.day))); });
  box.querySelector("[data-yesterday]")?.addEventListener("click", () => go(yesterday));
  box.querySelectorAll("[data-pick]").forEach((b) => { b.onclick = () => go(b.dataset.pick); });
  box.querySelectorAll(".fin-tx li").forEach((li) => { li.onclick = () => openTxEditor(byId[li.dataset.id], cats.all, () => renderTab(root)); });
  box.querySelector("#income-set").addEventListener("click", () => openIncomeEditor(d.income_rate, () => renderTab(root)));
  box.querySelector("#day-explain").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const out = box.querySelector("#day-answer");
    btn.disabled = true;
    out.innerHTML = `<div class="card fin-answer loading"><p>${icon("loader")} Looking at ${esc(dayLabel(ui.day))}…</p></div>`;
    try {
      const r = await api.post("/finances/ask", { report: "day", day: ui.day });
      out.innerHTML = answerCard({ title: `${dayLabel(ui.day)} · cash analysis`, answer: r.answer, changes: r.changes });
    } catch (err) { out.innerHTML = `<div class="card fin-answer"><p class="error-msg">${esc(err.message)}</p></div>`; }
    btn.disabled = false;
  });
}

function dailyChart(series, selected, avg, rate = 0) {
  const max = Math.max(1, avg * 1.5, rate * 1.25, ...series.map((r) => r.spending));
  const ratePct = Math.min(100, (rate / max) * 100);
  const avgPct = Math.min(100, (avg / max) * 100); // bars are 150px tall, sitting 20px above the bottom
  return `
    <div class="fin-legend"><span><i style="--c:var(--accent)"></i>Spending</span><span><i style="--c:var(--success)"></i>Income that day</span>
      ${avg ? `<span><i class="dash"></i>Normal day ≈ ${money(avg, false)}</span>` : ""}
      ${rate ? `<span><i class="line" style="--c:var(--series-2)"></i>Income per day ${money(rate, false)}</span>` : ""}</div>
    <div class="fin-days">
      ${avg ? `<div class="fin-days-avg" style="bottom:${(20 + avgPct * 1.5).toFixed(1)}px"></div>` : ""}
      ${rate ? `<div class="fin-days-rate" style="bottom:${(20 + ratePct * 1.5).toFixed(1)}px"><span>income/day ${money(rate, false)}</span></div>` : ""}
      ${series.map((r) => `
        <button class="fin-day ${r.date === selected ? "sel" : ""}" data-pick="${r.date}"
          title="${esc(dayLabel(r.date, { weekday: "short", month: "short", day: "numeric" }))}: out ${money(r.spending)}${r.income ? `, in ${money(r.income)}` : ""}">
          <span class="fin-day-in">${r.income ? `+${money(r.income, false)}` : ""}</span>
          <span class="fin-day-bar"><span style="height:${((r.spending / max) * 100).toFixed(1)}%"></span></span>
          <span class="fin-day-label">${Number(r.date.slice(8))}</span>
        </button>`).join("")}
    </div>`;
}

function openIncomeEditor(rate, onChange) {
  const dlg = openDialog({
    title: "Income per day",
    body: `
      <form id="inc-form" class="dlg-body" style="padding:0">
        <p style="margin:0">The Daily view spreads your income evenly over the days it covers, so a payday doesn't look like a huge day
          and the days in between don't look like losses.</p>
        ${rate.source === "auto" ? `<p class="fin-fine" style="margin:0">Worked out from your deposits: ${rate.streams.length
          ? rate.streams.map((x) => `${esc(x.name)}: ${money(x.amount)} every ${esc(x.every)} = ${money(x.per_day)}/day`).join("; ")
          : "no regular income found yet"}.</p>` : ""}
        <label class="field"><span>Monthly take-home pay (optional)</span>
          <input type="number" name="monthly" min="0" step="10" value="${rate.source === "set" ? rate.monthly : ""}" placeholder="${Math.round(rate.monthly) || "e.g. 5300"}"></label>
        <p class="fin-fine" style="margin:0">Leave it empty to keep working it out from your deposits.</p>
      </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="inc-form">Save</button></div>`,
  });
  const f = dlg.querySelector("form");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.put("/finances/income", { monthly: f.monthly.value === "" ? null : Number(f.monthly.value) });
      dlg.close(); toast("Saved"); onChange();
    } catch (err) { showError(f, err); }
  });
}

// ===========================================================================
// Loans: balances, payoff date and "what if I pay more"
// ===========================================================================

const monthName = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const yearsMonths = (n) => n >= 12 ? `${Math.floor(n / 12)} yr${Math.floor(n / 12) === 1 ? "" : "s"}${n % 12 ? ` ${n % 12} mo` : ""}` : plural(n, "month");

async function renderLoans(box, root) {
  const data = await api.get("/finances/loans");
  const full = data.loans.filter((l) => l.id && l.payment);
  box.innerHTML = `
    <section class="card fin-card" style="margin-bottom:14px">
      <header><h2>Loans &amp; payoff</h2><button class="btn small primary" id="loan-add">${icon("plus")} Add a loan</button></header>
      <p class="fin-fine" style="margin-top:0">See when each loan will be paid off and what paying extra would save. If your lender is linked in
        SimpleFIN Bridge (for example SoFi), its balance updates by itself: add the APR and monthly payment once. Otherwise add it here by hand.
        Ask the AI bar things like “If I pay $300 extra a month on my SoFi loan, when is it paid off?”.</p>
    </section>
    ${data.loans.filter((l) => l.needs_details).map((l) => `
      <section class="card loan-card"><div class="loan-head"><div><h2>${esc(l.name)}</h2>
        <div class="fin-li-sub">${esc(l.lender)} · linked · balance ${money(l.balance)}</div></div>
        <button class="btn small primary" data-link="${esc(l.account_id)}">Add APR &amp; payment</button></div></section>`).join("")}
    ${data.loans.filter((l) => l.id && !l.payment).map((l) => `
      <section class="card loan-card"><div class="loan-head"><div><h2>${esc(l.name)}</h2>
        <div class="fin-li-sub">balance ${money(l.balance)} · add the monthly payment to see a forecast</div></div>
        <button class="btn small" data-edit-loan="${l.id}">${icon("edit")} Edit</button></div></section>`).join("")}
    ${full.map(loanCard).join("")}
    ${data.loans.length ? "" : `<div class="card empty">No loans yet. Click <b>Add a loan</b>, or link your lender in SimpleFIN Bridge.</div>`}`;

  const byId = Object.fromEntries(data.loans.filter((l) => l.id).map((l) => [l.id, l]));
  const refresh = () => renderTab(root);
  box.querySelector("#loan-add").onclick = () => openLoanEditor({}, refresh);
  box.querySelectorAll("[data-link]").forEach((b) => {
    const l = data.loans.find((x) => x.account_id === b.dataset.link && x.needs_details);
    b.onclick = () => openLoanEditor({ name: l.name, lender: l.lender, account_id: l.account_id, balance: l.balance, linked: true }, refresh);
  });
  box.querySelectorAll("[data-edit-loan]").forEach((b) => { b.onclick = () => openLoanEditor(byId[b.dataset.editLoan], refresh); });
  box.querySelectorAll(".loan-card[data-loan]").forEach((card) => bindLoanCard(card, byId[card.dataset.loan]));
}

function loanCard(l) {
  const f = l.forecast;
  return `
    <section class="card loan-card" data-loan="${l.id}">
      <div class="loan-head">
        <div><h2>${esc(l.name)}</h2><div class="fin-li-sub">${esc(l.lender || "")}${l.linked ? " · balance updates from your bank" : ""}</div></div>
        <button class="btn small" data-edit-loan="${l.id}">${icon("edit")} Edit</button>
      </div>
      <div class="loan-stats">
        <div><span class="eyebrow">Balance</span><b>${money(l.balance)}</b></div>
        <div><span class="eyebrow">APR</span><b>${l.apr}%</b></div>
        <div><span class="eyebrow">Monthly payment</span><b>${money(l.payment)}</b></div>
        <div><span class="eyebrow">Interest per month now</span><b>${money(l.balance * l.apr / 1200)}</b></div>
      </div>
      <p class="loan-now">${f.never ? `⚠️ At ${money(l.payment)}/month the payment doesn't cover the interest, so the balance never goes down.`
        : `On your current payment: paid off <b>${monthName(f.payoff)}</b> (${yearsMonths(f.months)}), with <b>${money(f.total_interest, false)}</b> of interest still to pay.`}</p>
      <div class="loan-whatif">
        <label class="field"><span>Extra per month: <b class="mono" data-extra-out>$0</b></span>
          <input type="range" min="0" max="${Math.max(500, Math.ceil(l.payment * 2 / 50) * 50)}" step="25" value="0" data-extra></label>
        <label class="field"><span>One-time payment now</span>
          <input type="number" min="0" step="100" placeholder="0" data-lump></label>
      </div>
      <p class="loan-result" data-result>Move the slider or enter a one-time payment to see how much sooner it's paid off.</p>
      <div class="loan-chart" data-chart></div>
    </section>`;
}

function bindLoanCard(card, loan) {
  const extra = card.querySelector("[data-extra]");
  const lump = card.querySelector("[data-lump]");
  let timer;
  const update = async () => {
    card.querySelector("[data-extra-out]").textContent = money(Number(extra.value), false);
    const f = await api.post(`/finances/loans/${loan.id}/forecast`, { extra: Number(extra.value), lump: Number(lump.value || 0) });
    const res = card.querySelector("[data-result]");
    const changed = Number(extra.value) || Number(lump.value || 0);
    if (f.scenario.never) res.innerHTML = "That still doesn't cover the interest.";
    else if (!changed) res.innerHTML = "Move the slider or enter a one-time payment to see how much sooner it's paid off.";
    else res.innerHTML = `Paid off <b>${monthName(f.scenario.payoff)}</b>: <b>${yearsMonths(f.months_saved)}</b> sooner and
      <b>${money(f.interest_saved, false)}</b> less interest (${money(f.scenario.monthly_payment, false)}/month${Number(lump.value) ? ` + ${money(Number(lump.value), false)} now` : ""}).`;
    const chartEl = card.querySelector("[data-chart]");
    // Drawn at its real width, so text stays the same size on any screen.
    const dims = { w: Math.max(300, chartEl.clientWidth || 720), h: 230, l: 64, r: 140, t: 14, b: 28 };
    if (dims.w < 520) dims.r = 16;
    chartEl.innerHTML = loanChart(f, !!changed, dims);
    bindChartHover(chartEl, f, !!changed, dims);
  };
  extra.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 120); });
  lump.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 300); });
  card.querySelector("[data-edit-loan]").onclick = () => openLoanEditor(loan, () => document.querySelector('.fin-tabs [data-tab="loans"]').click());
  update();
}

// Balance over time: current plan (series 1) vs with extra payments (series 2).
function loanChart(f, showPlan, CH) {
  const base = f.baseline.never ? f.baseline.schedule : f.baseline.schedule;
  const plan = f.scenario.schedule;
  const n = Math.max(base.length, showPlan ? plan.length : 0) - 1 || 1;
  const max = Math.max(...base, 1);
  const x = (i) => CH.l + (i / n) * (CH.w - CH.l - CH.r);
  const y = (v) => CH.t + (1 - v / max) * (CH.h - CH.t - CH.b);
  const path = (pts) => pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((p) => max * p);
  const now = new Date();
  const yearTicks = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    if (d.getMonth() === 0) yearTicks.push([i, d.getFullYear()]);
  }
  const step = Math.ceil(yearTicks.length / 8) || 1;
  const narrow = CH.r < 60; // on a phone the legend and the sentence above name the lines instead
  const endLabel = (pts, text) => narrow ? "" : `<text class="end-label" x="${x(pts.length - 1) + 6}" y="${Math.max(12, y(pts[pts.length - 1]) - 6)}">${esc(text)}</text>`;
  return `
    <div class="fin-legend"><span><i class="line" style="--c:var(--series-1)"></i>Current plan</span>
      ${showPlan ? `<span><i class="line" style="--c:var(--series-2)"></i>With extra payments</span>` : ""}</div>
    <svg viewBox="0 0 ${CH.w} ${CH.h}" width="${CH.w}" height="${CH.h}" role="img" aria-label="Loan balance over time">
      ${ticks.map((v) => `<line class="grid" x1="${CH.l}" x2="${CH.w - CH.r}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis-label" x="${CH.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(money(v, false))}</text>`).join("")}
      ${yearTicks.filter((_, i) => i % step === 0).map(([i, yr]) => `<text class="axis-label" x="${x(i)}" y="${CH.h - 8}" text-anchor="middle">${yr}</text>`).join("")}
      <path d="${path(base)}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
      ${showPlan ? `<path d="${path(plan)}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round"/>` : ""}
      ${f.baseline.never ? "" : endLabel(base, `Current · ${monthName(f.baseline.payoff)}`)}
      ${showPlan && !f.scenario.never && !narrow ? `<text class="end-label" x="${x(plan.length - 1) + 6}" y="${CH.h - CH.b - 6}">Extra · ${esc(monthName(f.scenario.payoff))}</text>` : ""}
      <line class="hover-line" x1="0" x2="0" y1="${CH.t}" y2="${CH.h - CH.b}" visibility="hidden"/>
      <rect class="hit" x="${CH.l}" y="0" width="${CH.w - CH.l - CH.r}" height="${CH.h}" fill="transparent"/>
    </svg>
    <div class="loan-tip" hidden></div>`;
}

function bindChartHover(el, f, showPlan, CH) {
  const svg = el.querySelector("svg");
  const tip = el.querySelector(".loan-tip");
  const line = el.querySelector(".hover-line");
  const base = f.baseline.schedule;
  const plan = f.scenario.schedule;
  const n = Math.max(base.length, showPlan ? plan.length : 0) - 1 || 1;
  const hide = () => { tip.hidden = true; line.setAttribute("visibility", "hidden"); };
  const move = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * CH.w;
    const i = Math.max(0, Math.min(n, Math.round(((vx - CH.l) / (CH.w - CH.l - CH.r)) * n)));
    const px = CH.l + (i / n) * (CH.w - CH.l - CH.r);
    line.setAttribute("x1", px); line.setAttribute("x2", px); line.setAttribute("visibility", "visible");
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i);
    tip.innerHTML = `<b>${esc(d.toLocaleDateString(undefined, { month: "short", year: "numeric" }))}</b><br>
      <i style="--c:var(--series-1)"></i>Current plan ${money(base[Math.min(i, base.length - 1)] ?? 0, false)}
      ${showPlan ? `<br><i style="--c:var(--series-2)"></i>With extra ${money(plan[Math.min(i, plan.length - 1)] ?? 0, false)}` : ""}`;
    tip.hidden = false;
    const left = (px / CH.w) * r.width;
    tip.style.left = `${Math.min(r.width - tip.offsetWidth, Math.max(0, left + 12))}px`;
    tip.style.top = "30px";
  };
  svg.addEventListener("pointermove", (e) => move(e.clientX));
  svg.addEventListener("pointerleave", hide);
}

function openLoanEditor(l, onChange) {
  const isNew = !l.id;
  const dlg = openDialog({
    title: isNew ? "Add a loan" : "Edit loan",
    body: `
      <form id="loan-form" class="dlg-body" style="padding:0">
        <div class="row">
          <label class="field"><span>Name</span><input type="text" name="name" required value="${esc(l.name || "")}" placeholder="e.g. SoFi student loan"></label>
          <label class="field"><span>Lender (optional)</span><input type="text" name="lender" value="${esc(l.lender || "")}" placeholder="e.g. SoFi"></label>
        </div>
        <div class="row">
          <label class="field"><span>Balance ($)</span><input type="number" name="balance" min="0" step="0.01" value="${l.balance ?? ""}" ${l.linked ? "disabled" : "required"}></label>
          <label class="field"><span>Interest rate (APR %)</span><input type="number" name="apr" min="0" max="60" step="0.01" value="${l.apr ?? ""}" placeholder="e.g. 5.49" required></label>
        </div>
        <div class="row">
          <label class="field"><span>Monthly payment ($)</span><input type="number" name="payment" min="0" step="0.01" value="${l.payment || ""}" required></label>
          <label class="field"><span>Due day (optional)</span><input type="number" name="due_day" min="1" max="31" value="${l.due_day ?? ""}" placeholder="e.g. 15"></label>
        </div>
        ${l.linked ? `<p class="fin-fine" style="margin:0">The balance comes from your linked account and updates on each sync.</p>` : ""}
        <p class="fin-fine" style="margin:0">Find the APR and payment in the SoFi app or website under your loan's details.</p>
      </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="loan-form">Save</button></div>`,
  });
  const f = dlg.querySelector("form");
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${l.name}”?`)) return;
    await api.del(`/finances/loans/${l.id}`); dlg.close(); toast("Deleted"); onChange();
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: f.name.value, lender: f.lender.value, apr: Number(f.apr.value), payment: Number(f.payment.value),
      due_day: f.due_day.value ? Number(f.due_day.value) : null };
    if (!l.linked) body.balance = Number(f.balance.value);
    if (l.account_id) body.account_id = l.account_id;
    try {
      if (isNew) await api.post("/finances/loans", body); else await api.patch(`/finances/loans/${l.id}`, body);
      dlg.close(); toast("Loan saved"); onChange();
    } catch (err) { showError(f, err); }
  });
}

// ===========================================================================
// Rules: plain-English rules the AI follows
// ===========================================================================

const RULE_EXAMPLES = [
  "Zelle payments to Mike are my rent (Housing).",
  "Transfers to my Capital One 360 Savings are savings, not spending (Transfer).",
  "Venmo payments under $30 are usually food with friends (Dining & Coffee).",
  "Anything from Evergy or Spire is Utilities & Phone.",
  "Amazon orders are Shopping unless the description mentions Whole Foods (then Groceries).",
];

async function renderRules(box, root) {
  const data = await api.get("/finances/rules");
  box.innerHTML = `
    <section class="card fin-card">
      <header><h2>Your rules</h2><span class="eyebrow">plain English · followed by the AI</span></header>
      <p class="fin-fine" style="margin-top:0">Write rules the way you'd explain them to a person. The AI follows them when it sorts
        transactions into categories and when it answers your money questions. Your own one-off fixes on the Transactions tab
        still win. You can also tell the AI bar: “Always put Venmo to Mike in Housing”.</p>
      <form id="rule-form" class="fin-rule-form">
        <textarea name="text" rows="2" placeholder="e.g. Zelle payments to Mike are my rent (Housing)." required>${esc(ui.ruleDraft)}</textarea>
        <button class="btn primary" type="submit">${icon("plus")} Add rule</button>
      </form>
      <div class="chips fin-rule-examples">${RULE_EXAMPLES.map((x) => `<button class="chip" data-example="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    </section>
    <section class="card fin-card" style="margin-top:14px">
      <header><h2>${data.rules.length} rule${data.rules.length === 1 ? "" : "s"}</h2>
        <button class="btn small ${ui.rulesChanged ? "primary" : ""}" id="rules-apply" ${data.resorting ? "disabled" : ""}>
          ${icon("refresh")} ${data.resorting ? "Re-sorting…" : "Re-sort past transactions with my rules"}</button></header>
      ${ui.rulesChanged ? `<p class="fin-fine" style="margin-top:0">New transactions always follow your rules. To apply changes to transactions you already have, click Re-sort.</p>` : ""}
      ${data.rules.length ? `<ul class="fin-list fin-rules">${data.rules.map((r) => `
        <li class="${r.enabled ? "" : "is-hidden"}" data-rule="${r.id}">
          <input type="checkbox" class="fin-rule-on" ${r.enabled ? "checked" : ""} aria-label="Rule on">
          <div class="fin-rule-text">${esc(r.text)}</div>
          <button class="icon-btn" data-edit-rule aria-label="Edit rule">${icon("edit")}</button>
          <button class="icon-btn danger" data-del-rule aria-label="Delete rule">${icon("trash")}</button></li>`).join("")}</ul>`
        : `<div class="empty">No rules yet. Add one above or pick an example to start from.</div>`}
    </section>`;
  const form = box.querySelector("#rule-form");
  const changed = (msg) => { ui.rulesChanged = true; ui.ruleDraft = ""; toast(msg); renderTab(root); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api.post("/finances/rules", { text: form.text.value }); changed("Rule added"); }
    catch (err) { showError(form, err); }
  });
  form.text.addEventListener("input", () => { ui.ruleDraft = form.text.value; });
  box.querySelectorAll("[data-example]").forEach((b) => b.addEventListener("click", () => {
    form.text.value = b.dataset.example; ui.ruleDraft = b.dataset.example; form.text.focus();
  }));
  box.querySelectorAll("[data-rule]").forEach((li) => {
    const id = li.dataset.rule;
    const rule = data.rules.find((r) => String(r.id) === id);
    li.querySelector(".fin-rule-on").addEventListener("change", async (e) => {
      await api.patch(`/finances/rules/${id}`, { enabled: e.target.checked });
      changed(e.target.checked ? "Rule on" : "Rule paused");
    });
    li.querySelector("[data-del-rule]").addEventListener("click", async () => {
      if (!confirm(`Delete this rule?\n\n${rule.text}`)) return;
      await api.del(`/finances/rules/${id}`);
      changed("Rule deleted");
    });
    li.querySelector("[data-edit-rule]").addEventListener("click", () => {
      const dlg = openDialog({
        title: "Edit rule",
        body: `<form id="rule-edit" class="dlg-body" style="padding:0"><textarea name="text" rows="3" required>${esc(rule.text)}</textarea></form>`,
        foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="rule-edit">Save</button></div>`,
      });
      const f = dlg.querySelector("form");
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api.patch(`/finances/rules/${id}`, { text: f.text.value }); dlg.close(); changed("Rule saved"); }
        catch (err) { showError(f, err); }
      });
    });
  });
  box.querySelector("#rules-apply").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `${icon("loader")} Re-sorting… (can take a minute)`;
    try {
      const r = await api.post("/finances/rules/apply");
      toast(r.busy ? "Already re-sorting in the background" : `Re-sorted ${r.sorted} merchant${r.sorted === 1 ? "" : "s"} with your rules`, 5000);
      ui.rulesChanged = false;
    } catch (err) { toast(err.message, 8000); }
    renderTab(root);
  });
}

// ===========================================================================
// Budgets
// ===========================================================================

async function renderBudgets(box, root) {
  const data = await api.get("/finances/budgets");
  const m = data.month;
  const spent = Object.fromEntries(m.categories.map((r) => [r.category, r.spent]));
  const pace = m.day / m.days;
  const total = Object.values(data.budgets).reduce((s, v) => s + v, 0);
  const hasSuggestions = Object.keys(data.suggested).some((c) => !data.budgets[c]);
  box.innerHTML = `
    <div class="fin-budget-head card">
      <div><div class="eyebrow">${esc(monthLabel(m.month))} · day ${m.day} of ${m.days}</div>
        <div class="fin-kpi-value">${money(m.budgeted_spent, false)} <small>of ${money(total, false)} budgeted</small></div>
        <div class="fin-fine">Monthly budgets repeat every month. Leave a category empty for no budget.
          Income so far this month: ${money(m.income, false)}.</div></div>
      ${hasSuggestions ? `<button class="btn" id="fin-suggest">${icon("sparkle")} Fill in from my average spending</button>` : ""}
    </div>
    <ul class="card fin-budgets">${data.categories.map((c) => {
      const b = data.budgets[c];
      const s = spent[c] || 0;
      const pct = b ? Math.min(100, (s / b) * 100) : 0;
      const state = b && s > b ? "over" : b && s > b * pace * 1.1 ? "ahead" : "";
      return `
        <li class="${state}" style="--c:${catColor(c)}">
          <div class="fin-b-name"><span class="dot"></span>${esc(c)}</div>
          <div class="fin-b-bar">${b ? `<span style="width:${pct.toFixed(1)}%"></span><i style="left:${(pace * 100).toFixed(1)}%"></i>` : ""}</div>
          <div class="fin-b-spent mono">${money(s, false)}${b ? `<small> ${state === "over" ? `over by ${money(s - b, false)}` : `${money(b - s, false)} left`}</small>` : ""}</div>
          <label class="fin-b-input"><span>$</span><input type="number" min="0" step="10" data-budget="${esc(c)}" value="${b ?? ""}"
            placeholder="${data.suggested[c] ? data.suggested[c] : "–"}" aria-label="Monthly budget for ${esc(c)}"></label>
        </li>`;
    }).join("")}</ul>
    <p class="fin-fine">Ask the AI bar things like “Set my dining budget to $300” or “Am I on track this month?”. The faint tick on each bar is where you'd be on pace today.</p>`;
  box.querySelectorAll("[data-budget]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      try {
        await api.put(`/finances/budgets/${encodeURIComponent(inp.dataset.budget)}`,
          { amount: inp.value === "" ? null : Number(inp.value) });
        toast("Budget saved");
        renderTab(root);
      } catch (err) { toast(err.message); }
    });
  });
  box.querySelector("#fin-suggest")?.addEventListener("click", async () => {
    for (const [c, v] of Object.entries(data.suggested)) {
      if (!data.budgets[c]) await api.put(`/finances/budgets/${encodeURIComponent(c)}`, { amount: v });
    }
    toast("Budgets filled in from your average monthly spending. Adjust any you like.", 5000);
    renderTab(root);
  });
}

// ===========================================================================
// Reports & questions
// ===========================================================================

const REPORTS = [
  ["month", "This month so far", "Spending, budget pace and how the month compares."],
  ["last_month", "Last month", "Full recap of last month vs the month before."],
  ["quarter", "Last 90 days", "Trends, recurring charges and rising categories."],
];

async function renderReports(box) {
  box.innerHTML = `
    <div class="fin-report-picks">${REPORTS.map(([id, title, sub]) => `
      <button class="card fin-report-pick" data-report="${id}">
        <span class="fin-li-title">${icon("sparkle")} ${esc(title)}</span><span class="fin-li-sub">${esc(sub)}</span></button>`).join("")}</div>
    <form class="card fin-ask" id="fin-ask">
      <input type="text" name="q" placeholder="Ask about your money, e.g. “How much did I spend on Amazon since July?”" autocomplete="off">
      <button class="btn primary" type="submit">${icon("send")} Ask</button>
    </form>
    <div id="fin-answers">${ui.chat.map(answerCard).join("")}</div>`;
  const answers = box.querySelector("#fin-answers");
  const run = async (payload, title) => {
    const holder = document.createElement("div");
    holder.innerHTML = `<div class="card fin-answer loading"><div class="eyebrow">${esc(title)}</div><p>${icon("loader")} Crunching your numbers…</p></div>`;
    answers.prepend(holder);
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      const history = payload.report ? [] : ui.chat.slice(0, 2).reverse().flatMap((c) => c.q ? [
        { role: "user", content: c.q }, { role: "assistant", content: c.answer }] : []);
      const r = await api.post("/finances/ask", { ...payload, history });
      const entry = { title, q: payload.question || "", answer: r.answer, changes: r.changes };
      ui.chat.unshift(entry);
      ui.chat = ui.chat.slice(0, 10);
      holder.innerHTML = answerCard(entry);
    } catch (err) {
      holder.innerHTML = `<div class="card fin-answer"><div class="eyebrow">${esc(title)}</div><p class="error-msg">${esc(err.message)}</p></div>`;
    }
    box.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  };
  box.querySelectorAll("[data-report]").forEach((b) => {
    b.onclick = () => run({ report: b.dataset.report }, REPORTS.find((r) => r[0] === b.dataset.report)[1] + " report");
  });
  box.querySelector("#fin-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    e.target.q.value = "";
    run({ question: q }, q);
  });
}

function answerCard(c) {
  return `<article class="card fin-answer">
    <div class="eyebrow">${esc(c.title)}</div>
    ${formatReport(c.answer)}
    ${c.changes?.length ? `<ul class="fin-changes">${c.changes.map((x) => `<li>✓ ${esc(x)}</li>`).join("")}</ul>` : ""}
  </article>`;
}

// "## Heading", "- bullet" and paragraphs -> HTML (everything else escaped).
function formatReport(text) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.join("")}</ul>`); list = []; };
  for (const raw of (text || "").split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "$1");
    const h = line.match(/^\s*#{1,4}\s+(.*)/);
    const li = line.match(/^\s*[-•*]\s+(.*)/);
    if (h) { flush(); out.push(`<h3>${esc(h[1])}</h3>`); }
    else if (li) list.push(`<li>${esc(li[1])}</li>`);
    else { flush(); if (line.trim()) out.push(`<p>${esc(line)}</p>`); }
  }
  flush();
  return out.join("");
}
