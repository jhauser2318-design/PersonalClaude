// Home maintenance (under Health): recurring upkeep (home, car…) and important dates/documents
// (passport, license, registration, insurance, warranties).
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";

const CAT_ICON = { home: "🏠", car: "🚗", health: "🩺", other: "🔧" };
const KIND_ICON = { document: "📄", insurance: "🛡", warranty: "🧾", renewal: "🔁", other: "📌" };
let tab = "upkeep";

function dueText(it) {
  if (it.due_in == null) return "Never logged";
  if (it.due_in < 0) return `Overdue by ${-it.due_in} day${it.due_in === -1 ? "" : "s"}`;
  if (it.due_in === 0) return "Due today";
  return `Due ${fmtDate(it.next_due)}${it.due_in <= 60 ? ` · in ${it.due_in} days` : ""}`;
}
function dateText(d) {
  if (d.done) return "Handled";
  if (d.days_left < 0) return `Expired ${-d.days_left} days ago`;
  if (d.days_left === 0) return "Today";
  return `${new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · in ${d.days_left} days`;
}
const statusDot = { overdue: "var(--danger)", expired: "var(--danger)", soon: "var(--warning)", never: "var(--text-3)", ok: "var(--success)", done: "var(--text-3)" };

export async function render(view, arg) {
  if (arg === "dates" || arg === "upkeep") tab = arg;
  const o = await api.get("/home");
  view.innerHTML = `<div id="home-root">
    <div class="page-head"><div>
      <div class="eyebrow"><a href="#/area/health" class="crumb">Health</a> · home &amp; upkeep</div>
      <h1>Home maintenance</h1>
      <div class="status-chips">
        ${o.attention ? `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span><b>${o.attention}</b> need attention</span>` : `<span class="status-chip"><span class="dot" style="--c:var(--success)"></span>all good</span>`}
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${o.maintenance.length}</b> upkeep items</span>
        <span class="status-chip"><span class="dot" style="--c:#c084fc"></span><b>${o.dates.filter((d) => !d.done).length}</b> dates tracked</span>
      </div></div>
      <button class="btn primary" id="hm-add">${icon("plus")} ${tab === "upkeep" ? "Add upkeep item" : "Add date"}</button></div>
    <div class="segmented fin-tabs" role="tablist">
      <button data-tab="upkeep" class="${tab === "upkeep" ? "active" : ""}">Upkeep</button>
      <button data-tab="dates" class="${tab === "dates" ? "active" : ""}">Important dates &amp; documents</button>
    </div>
    ${tab === "upkeep" ? `
      <p class="sub" style="margin:0 0 14px;color:var(--text-3)">Things that need doing every so often. Mark one done and the next due date moves forward; you get a heads-up 3 days before.</p>
      ${o.maintenance.length ? `<div class="home-grid">${o.maintenance.map((it) => `
        <section class="card home-item ${it.status}" data-item="${it.id}">
          <div class="hi-top"><span class="hi-icon">${CAT_ICON[it.category]}</span>
            <div class="hi-main"><div class="fin-li-title">${esc(it.name)}</div><div class="fin-li-sub">${esc(it.every_text)}${it.last_done ? ` · last ${esc(fmtDate(it.last_done))}` : ""}</div></div>
            <button class="icon-btn" data-edit="${it.id}" aria-label="Edit">${icon("edit")}</button></div>
          <div class="hi-due"><span class="dot" style="--c:${statusDot[it.status]}"></span>${esc(dueText(it))}</div>
          <button class="btn small" data-done="${it.id}">${icon("tick")} Done today</button>
        </section>`).join("")}</div>`
        : `<div class="card empty">Nothing yet. Ideas: HVAC filter (every 3 months), oil change (every 6 months), smoke detector batteries (every year), dentist cleaning (every 6 months).</div>`}`
    : `
      <p class="sub" style="margin:0 0 14px;color:var(--text-3)">Expiry and renewal dates, with a reminder ahead of time, and where each document is kept.</p>
      ${o.dates.length ? `<section class="card fin-card"><ul class="fin-list">${o.dates.map((d) => `
        <li class="${d.done ? "is-hidden" : ""}"><span class="hi-icon">${KIND_ICON[d.kind]}</span>
          <div><div class="fin-li-title">${esc(d.name)} <span class="pill">${esc(d.kind)}</span></div>
            <div class="fin-li-sub"><span class="dot" style="--c:${statusDot[d.status]}"></span> ${esc(dateText(d))}${d.location ? ` · kept in ${esc(d.location)}` : ""}${d.remind_days ? ` · reminder ${d.remind_days} days before` : ""}</div></div>
          <button class="icon-btn" data-date="${d.id}" aria-label="Edit">${icon("edit")}</button></li>`).join("")}</ul></section>`
        : `<div class="card empty">Nothing yet. Ideas: passport, driver's license, car registration, renters/car insurance renewal, lease end, warranties.</div>`}`}
  </div>`;

  const root = view.querySelector("#home-root");
  const refresh = () => render(view);
  root.querySelector(".fin-tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; refresh(); } };
  root.querySelector("#hm-add").onclick = () => (tab === "upkeep" ? openItem({}, o, refresh) : openDate({}, o, refresh));
  root.addEventListener("click", async (e) => {
    const done = e.target.closest("[data-done]");
    if (done) {
      await api.post(`/home/maintenance/${done.dataset.done}/done`, {});
      toast("Done ✓ Next due date updated");
      return refresh();
    }
    const ed = e.target.closest("[data-edit]");
    if (ed) return openItem(o.maintenance.find((x) => x.id === Number(ed.dataset.edit)), o, refresh);
    const dd = e.target.closest("[data-date]");
    if (dd) return openDate(o.dates.find((x) => x.id === Number(dd.dataset.date)), o, refresh);
  });
}

function openItem(it, o, onChange) {
  const isNew = !it.id;
  const dlg = openDialog({
    title: isNew ? "New upkeep item" : esc(it.name), style: "--area:var(--accent)",
    body: `<form id="hi-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>What</span><input type="text" name="name" required value="${esc(it.name || "")}" placeholder="e.g. Change HVAC filter"></label>
        <label class="field"><span>Category</span><select name="category">${o.categories.map((c) => `<option value="${c}" ${c === it.category ? "selected" : ""}>${CAT_ICON[c]} ${c}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="field"><span>Every</span><input type="number" name="every_n" min="1" required value="${it.every_n || 3}"></label>
        <label class="field"><span>&nbsp;</span><select name="every_unit">${o.units.map((u) => `<option ${u === (it.every_unit || "months") ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Last done</span><input type="date" name="last_done" value="${esc(it.last_done || "")}"></label>
      <label class="field"><span>Notes</span><input type="text" name="notes" value="${esc(it.notes || "")}" placeholder="e.g. 16x25x1 filter, MERV 8"></label>
      ${it.log?.length ? `<div class="field"><span>History</span><ul class="fin-list">${it.log.map((l) => `
        <li><div><div class="fin-li-title">${esc(fmtDate(l.date))}${l.cost ? ` · $${l.cost}` : ""}</div>${l.note ? `<div class="fin-li-sub">${esc(l.note)}</div>` : ""}</div>
        <button type="button" class="icon-btn danger" data-del-log="${l.id}" aria-label="Delete">${icon("x")}</button></li>`).join("")}</ul></div>` : ""}
      ${isNew ? "" : `<div class="field"><span>Log it done</span><div class="ct-form">
        <input type="date" name="done_date" value="${todayISO()}"><input type="number" name="cost" min="0" step="0.01" placeholder="Cost (optional)">
        <button type="button" class="btn small" data-log>${icon("tick")} Done</button></div></div>`}
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="hi-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del-log]");
    if (del) { await api.del(`/home/maintenance/log/${del.dataset.delLog}`); del.closest("li").remove(); onChange(); }
    if (e.target.closest("[data-log]")) {
      await api.post(`/home/maintenance/${it.id}/done`, { date: form.done_date.value, cost: form.cost.value ? Number(form.cost.value) : null });
      dlg.close();
      toast("Logged ✓");
      onChange();
    }
  });
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${it.name}”?`)) return;
    await api.del(`/home/maintenance/${it.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value, category: form.category.value, every_n: Number(form.every_n.value),
      every_unit: form.every_unit.value, last_done: form.last_done.value || null, notes: form.notes.value };
    try {
      if (isNew) await api.post("/home/maintenance", body);
      else await api.patch(`/home/maintenance/${it.id}`, body);
      dlg.close();
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openDate(d, o, onChange) {
  const isNew = !d.id;
  const dlg = openDialog({
    title: isNew ? "New important date" : esc(d.name), style: "--area:#c084fc",
    body: `<form id="d-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>What</span><input type="text" name="name" required value="${esc(d.name || "")}" placeholder="e.g. Passport"></label>
        <label class="field"><span>Type</span><select name="kind">${o.kinds.map((k) => `<option value="${k}" ${k === d.kind ? "selected" : ""}>${KIND_ICON[k]} ${k}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="field"><span>Expires / due</span><input type="date" name="date" required value="${esc(d.date || "")}"></label>
        <label class="field"><span>Remind me (days before)</span><input type="number" name="remind_days" min="0" value="${d.remind_days ?? 30}"></label>
      </div>
      <label class="field"><span>Where it's kept</span><input type="text" name="location" value="${esc(d.location || "")}" placeholder="e.g. Fire safe, Google Drive"></label>
      <label class="field"><span>Notes</span><input type="text" name="notes" value="${esc(d.notes || "")}" placeholder="e.g. document number, how to renew"></label>
      ${isNew ? "" : `<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="done" ${d.done ? "checked" : ""}> <span>Renewed / handled</span></label>`}
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="d-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${d.name}”?`)) return;
    await api.del(`/home/dates/${d.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value, kind: form.kind.value, date: form.date.value, remind_days: Number(form.remind_days.value || 0),
      location: form.location.value, notes: form.notes.value, done: form.done?.checked || false };
    try {
      if (isNew) await api.post("/home/dates", body);
      else await api.patch(`/home/dates/${d.id}`, body);
      dlg.close();
      onChange();
    } catch (err) { showError(form, err); }
  });
}
