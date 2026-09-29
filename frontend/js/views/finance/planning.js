// Finances → Bills (a month calendar of bills and subscriptions) and
// Savings (goals with how much to put away each month).
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../../ui.js";

const money = (n, cents = true) => (n ?? 0).toLocaleString(undefined, {
  style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
});
const SRC = { detected: "found in your transactions", loan: "loan payment", manual: "added by you" };
const SUB_LABEL = { keep: "Keep", cancel: "Cancel it", cancelled: "Cancelled", ignore: "Not a subscription" };
let month = null;

function shiftMonth(m, by) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function renderBills(box) {
  const b = await api.get(`/finances/bills${month ? `?month=${month}` : ""}`);
  month = b.month;
  const [y, mo] = b.month.split("-").map(Number);
  const today = todayISO();
  const byDay = {};
  for (const it of b.items) (byDay[Number(it.date.slice(8))] ||= []).push(it);
  const cells = [];
  for (let i = 0; i < b.first_weekday; i++) cells.push(`<div class="bc-cell empty"></div>`);
  for (let d = 1; d <= b.days; d++) {
    const iso = `${b.month}-${String(d).padStart(2, "0")}`;
    const items = byDay[d] || [];
    cells.push(`<div class="bc-cell ${iso === today ? "today" : ""} ${iso < today ? "past" : ""}">
      <div class="bc-day">${d}</div>
      ${items.slice(0, 3).map((it) => `<div class="bc-bill ${it.source}" title="${esc(it.name)} · ${money(it.amount)} · ${SRC[it.source]}">
        <span>${esc(it.name)}</span><b>${money(it.amount, false)}</b></div>`).join("")}
      ${items.length > 3 ? `<div class="bc-more">+${items.length - 3} more</div>` : ""}
    </div>`);
  }
  const subs = b.subscriptions;
  box.innerHTML = `
    <div class="fin-kpis">
      <div class="card fin-kpi" style="--c:var(--accent)"><div class="eyebrow">Bills this month</div><div class="fin-kpi-value">${money(b.total, false)}</div><div class="fin-kpi-sub">${b.items.length} bills</div></div>
      <div class="card fin-kpi" style="--c:var(--warning)"><div class="eyebrow">Still to come</div><div class="fin-kpi-value">${money(b.remaining, false)}</div><div class="fin-kpi-sub">from today on</div></div>
      <div class="card fin-kpi" style="--c:#c084fc"><div class="eyebrow">Subscriptions</div><div class="fin-kpi-value">${money(subs.monthly, false)}<small>/mo</small></div><div class="fin-kpi-sub">${money(subs.yearly, false)} a year</div></div>
      <div class="card fin-kpi" style="--c:var(--success)"><div class="eyebrow">Marked to cancel</div><div class="fin-kpi-value">${money(subs.cancel_savings, false)}<small>/yr</small></div><div class="fin-kpi-sub">${subs.to_cancel.length} to cancel</div></div>
    </div>
    <section class="card fin-card">
      <header>
        <div class="fin-month"><button class="icon-btn" id="bc-prev" aria-label="Previous month">‹</button>
          <h2>${esc(new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</h2>
          <button class="icon-btn" id="bc-next" aria-label="Next month">›</button></div>
        <button class="btn small primary" id="bill-add">${icon("plus")} Add a bill</button>
      </header>
      <div class="bill-cal">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="bc-head">${d}</div>`).join("")}
        ${cells.join("")}
      </div>
      <ul class="fin-list bill-list">${b.items.map((it) => `
        <li><div><div class="fin-li-title">${esc(it.name)}${it.autopay ? ` <span class="pill">autopay</span>` : ""}${it.status === "cancel" ? ` <span class="pill high">cancel</span>` : ""}</div>
          <div class="fin-li-sub">${esc(fmtDate(it.date))} · ${esc(it.category)} · ${SRC[it.source]}</div></div>
          <b class="bill-amt">${money(it.amount)}</b>
          ${it.source === "manual" ? `<button class="icon-btn" data-bill="${it.ref}" aria-label="Edit">${icon("edit")}</button>` : ""}
          ${it.source === "detected" ? `<button class="icon-btn" data-notbill="${esc(it.ref)}" title="Not a bill: hide it" aria-label="Not a bill">${icon("x")}</button>` : ""}</li>`).join("") || `<li><div class="muted small">No bills this month.</div></li>`}</ul>
      <p class="fin-fine">Repeating charges are found automatically from your transactions (✕ hides one that isn't a bill). Add ones that don't show up (rent paid by check, yearly insurance) with <b>Add a bill</b>. You get a reminder 2 days before each bill when notifications are on.</p>
    </section>
    <section class="card fin-card" style="margin-top:14px">
      <header><h2>Subscriptions</h2><span class="eyebrow">yearly cost · highest first</span></header>
      ${subs.items.length ? `<ul class="fin-list">${subs.items.map((s) => `
        <li class="${["cancelled", "ignore"].includes(s.status) ? "is-hidden" : ""}"><div>
          <div class="fin-li-title">${esc(s.name)}</div>
          <div class="fin-li-sub">${money(s.amount)}/mo · <b>${money(s.yearly, false)}/yr</b> · ${esc(s.category)}${s.next_date ? ` · next ${esc(fmtDate(s.next_date))}` : ""}</div></div>
          ${s.source === "detected" ? `<select data-sub="${esc(s.name)}" aria-label="What to do with ${esc(s.name)}">${Object.entries(SUB_LABEL).map(([k, v]) =>
            `<option value="${k}" ${k === s.status ? "selected" : ""}>${v}</option>`).join("")}</select>` : `<span class="pill">added by you</span>`}</li>`).join("")}</ul>`
        : `<div class="empty">No subscriptions found yet. They show up after a couple of months of transactions.</div>`}
    </section>`;

  const refresh = () => renderBills(box);
  box.querySelector("#bc-prev").onclick = () => { month = shiftMonth(month, -1); refresh(); };
  box.querySelector("#bc-next").onclick = () => { month = shiftMonth(month, 1); refresh(); };
  box.querySelector("#bill-add").onclick = () => openBill({}, b, refresh);
  box.querySelectorAll("[data-bill]").forEach((el) => {
    el.onclick = () => openBill(b.bills.find((x) => x.id === Number(el.dataset.bill)), b, refresh);
  });
  box.querySelectorAll("[data-notbill]").forEach((el) => {
    el.onclick = async () => {
      await api.put("/finances/subscriptions", { merchant: el.dataset.notbill, status: "ignore" });
      toast(`${el.dataset.notbill} hidden from bills`);
      refresh();
    };
  });
  box.querySelectorAll("[data-sub]").forEach((sel) => {
    sel.onchange = async () => {
      await api.put("/finances/subscriptions", { merchant: sel.dataset.sub, status: sel.value });
      toast(sel.value === "cancel" ? "Added to your cancel list" : "Saved");
      refresh();
    };
  });
}

function openBill(bill, b, onChange) {
  const isNew = !bill.id;
  const dlg = openDialog({
    title: isNew ? "Add a bill" : esc(bill.name), style: "--area:var(--accent)",
    body: `<form id="bill-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Name</span><input type="text" name="name" required value="${esc(bill.name || "")}" placeholder="e.g. Rent, Car insurance"></label>
        <label class="field"><span>Amount</span><input type="number" name="amount" min="0" step="0.01" required value="${bill.amount ?? ""}"></label>
      </div>
      <div class="row">
        <label class="field"><span>Due day of month</span><input type="number" name="due_day" min="1" max="31" required value="${bill.due_day ?? 1}"></label>
        <label class="field"><span>How often</span><select name="frequency">${b.frequencies.map((f) => `<option ${f === bill.frequency ? "selected" : ""}>${f}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="field"><span>Due in (month, for quarterly/yearly)</span><select name="start_month">${Array.from({ length: 12 }, (_, i) =>
          `<option value="${i + 1}" ${(bill.start_month || new Date().getMonth() + 1) === i + 1 ? "selected" : ""}>${new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" })}</option>`).join("")}</select></label>
        <label class="field"><span>Category</span><select name="category">${b.categories.filter((c) => !["Income", "Transfer"].includes(c)).map((c) =>
          `<option ${c === (bill.category || "Utilities & Phone") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      </div>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="autopay" ${bill.autopay ? "checked" : ""}> <span>Paid automatically (autopay)</span></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="subscription" ${bill.subscription ? "checked" : ""}> <span>It's a subscription</span></label>
      <label class="field"><span>Notes</span><input type="text" name="notes" value="${esc(bill.notes || "")}"></label>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="bill-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    await api.del(`/finances/bills/${bill.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value, amount: Number(form.amount.value), due_day: Number(form.due_day.value), frequency: form.frequency.value,
      start_month: Number(form.start_month.value), category: form.category.value, autopay: form.autopay.checked,
      subscription: form.subscription.checked, notes: form.notes.value };
    try {
      if (isNew) await api.post("/finances/bills", body);
      else await api.patch(`/finances/bills/${bill.id}`, body);
      dlg.close();
      toast("Bill saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

export async function renderSavings(box) {
  const [s, goals] = await Promise.all([api.get("/finances/savings"), api.get("/goals")]);
  box.innerHTML = `
    <div class="fin-kpis">
      <div class="card fin-kpi" style="--c:var(--success)"><div class="eyebrow">Saved</div><div class="fin-kpi-value">${money(s.total_saved, false)}</div><div class="fin-kpi-sub">of ${money(s.total_target, false)}</div></div>
      <div class="card fin-kpi" style="--c:var(--accent)"><div class="eyebrow">Put away each month</div><div class="fin-kpi-value">${money(s.monthly_needed, false)}</div><div class="fin-kpi-sub">to hit every target date</div></div>
    </div>
    <section class="card fin-card">
      <header><h2>Savings goals</h2><button class="btn small primary" id="sv-add">${icon("plus")} New savings goal</button></header>
      ${s.goals.length ? `<div class="sv-grid">${s.goals.map((g) => `
        <div class="sv-goal">
          <div class="sv-top"><div><div class="fin-li-title">${esc(g.name)}</div>
            <div class="fin-li-sub">${g.linked ? `from ${esc(g.account_name)} · updates with each sync` : "updated by hand"}${g.goal_id ? " · linked to a goal" : ""}</div></div>
            <button class="icon-btn" data-sv="${g.id}" aria-label="Edit">${icon("edit")}</button></div>
          <div class="sv-amounts"><b>${money(g.saved, false)}</b> of ${money(g.target, false)} <span class="muted">· ${g.pct}%</span></div>
          <div class="progress" style="--area:var(--success)"><span style="width:${g.pct}%"></span></div>
          <div class="fin-li-sub">${g.left <= 0 ? "🎉 Reached!" : g.monthly_needed ? `${money(g.monthly_needed, false)}/month for ${g.months_left} month${g.months_left === 1 ? "" : "s"} to reach it by ${esc(fmtDate(g.target_date))}` : `${money(g.left, false)} to go · add a target date to see a monthly amount`}</div>
        </div>`).join("")}</div>`
        : `<div class="empty">No savings goals yet. Ideas: emergency fund (3–6 months of spending), CPA exam fees, a trip, a car.</div>`}
    </section>`;
  const refresh = () => renderSavings(box);
  box.querySelector("#sv-add").onclick = () => openSavings({}, s, goals, refresh);
  box.querySelectorAll("[data-sv]").forEach((el) => {
    el.onclick = () => openSavings(s.goals.find((g) => g.id === Number(el.dataset.sv)), s, goals, refresh);
  });
}

function openSavings(g, s, goals, onChange) {
  const isNew = !g.id;
  const dlg = openDialog({
    title: isNew ? "New savings goal" : esc(g.name), style: "--area:var(--success)",
    body: `<form id="sv-form" class="dlg-body" style="padding:0">
      <label class="field"><span>Name</span><input type="text" name="name" required value="${esc(g.name || "")}" placeholder="e.g. Emergency fund"></label>
      <div class="row">
        <label class="field"><span>Target</span><input type="number" name="target" min="1" step="1" required value="${g.target ?? ""}"></label>
        <label class="field"><span>Target date (optional)</span><input type="date" name="target_date" value="${esc(g.target_date || "")}"></label>
      </div>
      <label class="field"><span>Count the balance of…</span><select name="account_id"><option value="">Nothing (I'll update it by hand)</option>${s.accounts.map((a) =>
        `<option value="${esc(a.id)}" ${a.id === g.account_id ? "selected" : ""}>${esc(a.name)} (${money(a.balance, false)})</option>`).join("")}</select></label>
      <label class="field" id="sv-saved"><span>Saved so far</span><input type="number" name="saved" min="0" step="1" value="${g.linked ? "" : g.saved ?? 0}"></label>
      <label class="field"><span>Link to a goal (its progress follows this)</span><select name="goal_id"><option value="">None</option>${goals.map((x) =>
        `<option value="${x.id}" ${x.id === g.goal_id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="sv-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  const showSaved = () => { dlg.querySelector("#sv-saved").hidden = !!form.account_id.value; };
  form.account_id.onchange = showSaved;
  showSaved();
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    await api.del(`/finances/savings/${g.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value, target: Number(form.target.value), saved: Number(form.saved.value || 0),
      account_id: form.account_id.value || null, target_date: form.target_date.value || null,
      goal_id: form.goal_id.value ? Number(form.goal_id.value) : null };
    try {
      if (isNew) await api.post("/finances/savings", body);
      else await api.patch(`/finances/savings/${g.id}`, body);
      dlg.close();
      toast("Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
