// Finances → Loans: payoff dates and "what if I pay more".
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, openDialog, showError, toast } from "../../ui.js";
import { renderTab } from "../finances.js";
import { money } from "./common.js";

// ===========================================================================
// Loans: balances, payoff date and "what if I pay more"
// ===========================================================================

const monthName = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }); };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const yearsMonths = (n) => n >= 12 ? `${Math.floor(n / 12)} yr${Math.floor(n / 12) === 1 ? "" : "s"}${n % 12 ? ` ${n % 12} mo` : ""}` : plural(n, "month");

export async function renderLoans(box, root) {
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
