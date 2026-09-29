// Finances → Transactions: the list, editing a transaction or an account.
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, fmtDate, openDialog, showError, toast } from "../../ui.js";
import { render } from "../finances.js";
import { catChip, money, monthBounds, monthLabel, shiftMonth, signed, thisMonth, ui } from "./common.js";

// ===========================================================================
// Transactions
// ===========================================================================

export async function renderTransactions(box, root) {
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

export function txRow(r) {
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

export function openTxEditor(tx, categories, onChange) {
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

export function openAccountEditor(acc, onChange) {
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

export function openDisconnect(root) {
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
