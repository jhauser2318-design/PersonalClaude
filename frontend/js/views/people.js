// People: relationships, birthdays, and "it's been a while" nudges.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";

const KIND_ICON = { call: "📞", text: "💬", met: "☕", email: "✉", talked: "🗣" };

function bdayText(p) {
  if (p.birthday_in == null) return "";
  const when = p.birthday_in === 0 ? "today 🎂" : p.birthday_in === 1 ? "tomorrow" : `in ${p.birthday_in} days`;
  return `${when}${p.turning ? ` · turns ${p.turning}` : ""}`;
}
function lastText(p) {
  if (!p.last_contact) return "No contact logged";
  const d = p.days_since;
  return `${KIND_ICON[p.last_kind] || ""} ${d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`}`;
}
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function personCard(p) {
  return `
    <button class="card person-card ${p.due ? "is-due" : ""}" data-person="${p.id}">
      <span class="avatar">${esc(initials(p.name))}</span>
      <span class="pc-main">
        <span class="pc-name">${esc(p.name)} ${p.relation ? `<span class="pill">${esc(p.relation)}</span>` : ""}</span>
        <span class="pc-sub">${esc(lastText(p))}${p.cadence_days ? ` · every&nbsp;${p.cadence_days}&nbsp;days` : ""}</span>
        ${p.birthday ? `<span class="pc-sub">🎂 ${esc(new Date(`2000-${p.birthday.slice(5)}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}${p.birthday_in <= 30 ? ` (${esc(bdayText(p))})` : ""}</span>` : ""}
      </span>
    </button>`;
}

export async function render(view) {
  const d = await api.get("/people");
  view.innerHTML = `<div id="ppl-root">
    <div class="page-head"><div>
      <div class="eyebrow">Relationships</div>
      <h1>People</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${d.people.length}</b> people</span>
        ${d.due.length ? `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span><b>${d.due.length}</b> to reach out to</span>` : ""}
        ${d.birthdays.length ? `<span class="status-chip"><span class="dot" style="--c:#f472b6"></span><b>${d.birthdays.length}</b> birthday${d.birthdays.length === 1 ? "" : "s"} in 30 days</span>` : ""}
      </div></div>
      <button class="btn primary" id="ppl-add">${icon("plus")} Add person</button></div>
    <p class="sub" style="margin:-8px 0 18px;color:var(--text-3)">Tip: tell the AI bar “Called Mom about the trip” or “Add Jake, friend, birthday June 3, reach out every 2 weeks”.</p>
    <div class="fu-lower" style="margin-top:0">
      <section class="card fin-card">
        <header><h2>Reach out</h2><span class="eyebrow">it's been a while</span></header>
        ${d.due.length ? `<ul class="fin-list">${d.due.map((p) => `
          <li><div><div class="fin-li-title">${esc(p.name)}</div><div class="fin-li-sub">${esc(lastText(p))} · every ${p.cadence_days} days</div></div>
            <div class="btn-row">${["call", "text", "met"].map((k) => `<button class="btn small" data-quick="${p.id}:${k}" title="Log a ${k}">${KIND_ICON[k]}</button>`).join("")}</div></li>`).join("")}</ul>`
          : `<div class="empty">You're all caught up. Set “reach out every…” on someone to get nudges.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Upcoming birthdays</h2><span class="eyebrow">next 30 days</span></header>
        ${d.birthdays.length ? `<ul class="fin-list">${d.birthdays.map((p) => `
          <li><div><div class="fin-li-title">🎂 ${esc(p.name)}</div><div class="fin-li-sub">${esc(fmtDate(p.next_birthday))} · ${esc(bdayText(p))}</div></div>
            <button class="btn small" data-person="${p.id}">Open</button></li>`).join("")}</ul>`
          : `<div class="empty">No birthdays in the next 30 days.</div>`}
      </section>
    </div>
    <h2 class="section" style="margin-top:22px">Everyone <span class="count">${d.people.length}</span><span class="line"></span></h2>
    ${d.people.length ? `<div class="people-grid">${d.people.map(personCard).join("")}</div>`
      : `<div class="card empty">No one added yet. Start with family and close friends.</div>`}
  </div>`;

  const root = view.querySelector("#ppl-root");
  const refresh = () => render(view);
  root.querySelector("#ppl-add").onclick = () => openPersonEditor({}, d, refresh);
  root.addEventListener("click", async (e) => {
    const q = e.target.closest("[data-quick]");
    if (q) {
      const [id, kind] = q.dataset.quick.split(":");
      await api.post(`/people/${id}/contact`, { kind });
      toast("Logged ✓");
      return refresh();
    }
    const p = e.target.closest("[data-person]");
    if (p) openPersonDetail(Number(p.dataset.person), d, refresh);
  });
}

async function openPersonDetail(id, d, onChange) {
  const p = await api.get(`/people/${id}`);
  const dlg = openDialog({
    title: esc(p.name), style: "--area:#fbbf24",
    body: `
      <div class="detail-meta">
        ${p.relation ? `<span class="pill">${esc(p.relation)}</span>` : ""}
        ${p.birthday ? `<span class="pill">🎂 ${esc(p.birthday.startsWith("0000") ? p.birthday.slice(5) : p.birthday)}</span>` : ""}
        ${p.cadence_days ? `<span class="pill">every ${p.cadence_days} days</span>` : ""}
        ${p.phone ? `<a class="pill" href="tel:${esc(p.phone)}">📞 ${esc(p.phone)}</a>` : ""}
        ${p.email ? `<a class="pill" href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ""}
      </div>
      ${p.notes ? `<p class="person-notes">${esc(p.notes)}</p>` : ""}
      <form id="ct-form" class="ct-form">
        <select name="kind">${d.kinds.map((k) => `<option value="${k}">${KIND_ICON[k]} ${k}</option>`).join("")}</select>
        <input type="date" name="date" value="${todayISO()}" aria-label="When">
        <input type="text" name="note" placeholder="What about? (optional)" aria-label="Note">
        <button class="btn primary small" type="submit">Log</button>
      </form>
      <ul class="fin-list">${p.interactions.map((i) => `
        <li><div><div class="fin-li-title">${KIND_ICON[i.kind] || ""} ${esc(i.kind)}${i.note ? ` · ${esc(i.note)}` : ""}</div>
          <div class="fin-li-sub">${esc(fmtDate(i.date))}</div></div>
          <button class="icon-btn danger" data-del="${i.id}" aria-label="Delete">${icon("x")}</button></li>`).join("") || `<li><div class="muted small">Nothing logged yet.</div></li>`}</ul>`,
    foot: `<button class="btn danger" data-delete>${icon("trash")} Delete</button>
      <div class="right"><button class="btn" data-edit>${icon("edit")} Edit</button><button class="btn" data-close>Close</button></div>`,
  });
  const form = dlg.querySelector("#ct-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api.post(`/people/${id}/contact`, { kind: form.kind.value, date: form.date.value, note: form.note.value });
    dlg.close();
    toast("Logged ✓");
    onChange();
    openPersonDetail(id, d, onChange);
  });
  dlg.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { await api.del(`/people/contact/${del.dataset.del}`); del.closest("li").remove(); onChange(); }
  });
  dlg.querySelector("[data-edit]").onclick = () => { dlg.close(); openPersonEditor(p, d, onChange); };
  dlg.querySelector("[data-delete]").onclick = async () => {
    if (!confirm(`Delete ${p.name} and their history?`)) return;
    await api.del(`/people/${id}`);
    dlg.close();
    onChange();
  };
}

function openPersonEditor(p, d, onChange) {
  const isNew = !p.id;
  const bday = p.birthday || "";
  const unknownYear = bday.startsWith("0000");
  const dlg = openDialog({
    title: isNew ? "Add person" : `Edit ${esc(p.name)}`, style: "--area:#fbbf24",
    body: `<form id="p-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Name</span><input type="text" name="name" required value="${esc(p.name || "")}"></label>
        <label class="field"><span>Relation</span><select name="relation"><option value="">—</option>${d.relations.map((r) =>
          `<option ${r === p.relation ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="field"><span>Birthday</span><input type="date" name="birthday" value="${unknownYear ? `2000-${bday.slice(5)}` : esc(bday)}"></label>
        <label class="field"><span>Reach out every (days)</span><input type="number" name="cadence_days" min="1" placeholder="e.g. 14" value="${p.cadence_days || ""}"></label>
      </div>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="noyear" ${unknownYear ? "checked" : ""}> <span>I don't know the birth year</span></label>
      <div class="row">
        <label class="field"><span>Phone</span><input type="text" name="phone" inputmode="tel" value="${esc(p.phone || "")}"></label>
        <label class="field"><span>Email</span><input type="text" name="email" inputmode="email" value="${esc(p.email || "")}"></label>
      </div>
      <label class="field"><span>Notes</span><textarea name="notes" placeholder="Partner and kids' names, likes, gift ideas…">${esc(p.notes || "")}</textarea></label>
    </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="p-form">${isNew ? "Add" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.name.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let birthday = form.birthday.value || null;
    if (birthday && form.noyear.checked) birthday = birthday.slice(5);
    const body = { name: form.name.value, relation: form.relation.value, birthday, phone: form.phone.value, email: form.email.value,
      notes: form.notes.value, cadence_days: form.cadence_days.value ? Number(form.cadence_days.value) : null };
    try {
      if (isNew) await api.post("/people", body);
      else await api.patch(`/people/${p.id}`, body);
      dlg.close();
      toast(isNew ? "Added" : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
