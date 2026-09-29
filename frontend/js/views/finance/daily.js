// Finances → Daily: a day's cash in and out.
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, openDialog, showError, toast, todayISO } from "../../ui.js";
import { kpi, renderTab } from "../finances.js";
import { catChip, money, signed, ui } from "./common.js";
import { answerCard } from "./reports.js";
import { openTxEditor, txRow } from "./transactions.js";

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

export async function renderDaily(box, root) {
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
