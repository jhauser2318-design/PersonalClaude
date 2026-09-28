// Fun & leisure: a log of fun things you did, and ideas for next time.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";

const money = (n) => (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const stars = (n) => (n ? `<span class="fun-stars" aria-label="${n} out of 5">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>` : "");
const monthName = (key) => new Date(`${key}-15T12:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

export async function render(view) {
  const o = await api.get("/fun");
  const cat = Object.fromEntries(o.categories.map((c) => [c.id, c]));
  const byMonth = [];
  for (const e of o.log) {
    const key = e.date.slice(0, 7);
    if (!byMonth.length || byMonth[byMonth.length - 1].key !== key) byMonth.push({ key, items: [] });
    byMonth[byMonth.length - 1].items.push(e);
  }
  const maxCat = Math.max(1, ...o.by_category.map((c) => c.count));
  const maxMonth = Math.max(1, ...o.months.map((m) => m.count));

  view.innerHTML = `<div id="fun-root">
    <div class="page-head"><div>
      <div class="eyebrow">Life · fun &amp; leisure</div>
      <h1>Fun</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:#f472b6"></span><b>${o.this_month}</b> fun thing${o.this_month === 1 ? "" : "s"} this month</span>
        ${o.avg_rating ? `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span>avg <b>${o.avg_rating}</b> ★</span>` : ""}
        ${o.days_since != null ? `<span class="status-chip"><span class="dot" style="--c:${o.days_since >= 10 ? "var(--danger)" : "var(--success)"}"></span>last one <b>${o.days_since === 0 ? "today" : `${o.days_since} day${o.days_since === 1 ? "" : "s"} ago`}</b></span>` : ""}
        ${o.spent_this_month ? `<span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${money(o.spent_this_month)}</b> spent this month</span>` : ""}
      </div></div>
      <button class="btn primary" id="fun-add">${icon("plus")} Log something fun</button></div>
    <p class="sub" style="margin:-8px 0 18px;color:var(--text-3)">Tip: tell the AI bar “Went bowling with Sam last night, so fun” or “I want to try axe throwing”.</p>
    ${o.days_since != null && o.days_since >= 10 && o.ideas.length ? `<div class="fin-alert">It's been ${o.days_since} days since you logged something fun. How about: <b>${esc(o.ideas[Math.floor(Math.random() * o.ideas.length)].title)}</b>?</div>` : ""}
    <div class="fun-cols">
      <section class="card fin-card">
        <header><h2>What you did</h2><span class="eyebrow">${o.log.length} logged</span></header>
        ${byMonth.length ? byMonth.map((m) => `
          <h3 class="rv-h3">${esc(monthName(m.key))} · ${m.items.length}</h3>
          <ul class="fin-list">${m.items.map((e) => `
            <li class="fun-row" data-entry="${e.id}"><span class="fun-emoji" title="${esc(cat[e.category]?.name || "")}">${cat[e.category]?.icon || "✨"}</span>
              <div><div class="fin-li-title">${esc(e.title)} ${stars(e.rating)}</div>
                <div class="fin-li-sub">${esc(fmtDate(e.date))}${e.with_whom ? ` · with ${esc(e.with_whom)}` : ""}${e.place ? ` · ${esc(e.place)}` : ""}${e.cost ? ` · ${money(e.cost)}` : ""}</div>
                ${e.notes ? `<div class="fin-li-sub">${esc(e.notes)}</div>` : ""}</div>
              <button class="icon-btn" aria-label="Edit">${icon("edit")}</button></li>`).join("")}</ul>`).join("")
          : `<div class="empty">Nothing logged yet. What did you do for fun recently?</div>`}
      </section>
      <div class="fun-side">
        <section class="card fin-card">
          <header><h2>💡 Ideas</h2><span class="eyebrow">things to try</span></header>
          <form class="ct-form" id="idea-form">
            <input type="text" name="title" placeholder="e.g. Try indoor climbing" aria-label="New idea" required>
            <select name="category" aria-label="Category">${o.categories.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join("")}</select>
            <button class="btn small" type="submit">${icon("plus")} Add</button>
          </form>
          ${o.ideas.length ? `<ul class="fin-list">${o.ideas.map((i) => `
            <li><span class="fun-emoji">${cat[i.category]?.icon || "✨"}</span><div><div class="fin-li-title">${esc(i.title)}</div>${i.notes ? `<div class="fin-li-sub">${esc(i.notes)}</div>` : ""}</div>
              <button class="btn small" data-did="${i.id}">${icon("tick")} Did it</button>
              <button class="icon-btn danger" data-rm-idea="${i.id}" aria-label="Remove idea">${icon("x")}</button></li>`).join("")}</ul>`
            : `<div class="empty" style="padding:12px">No ideas yet. Add things you want to try.</div>`}
        </section>
        ${o.favorites.length ? `<section class="card fin-card">
          <header><h2>Favorites</h2><span class="eyebrow">last 12 months</span></header>
          <ul class="fin-list">${o.favorites.map((e) => `<li><span class="fun-emoji">${cat[e.category]?.icon || "✨"}</span>
            <div><div class="fin-li-title">${esc(e.title)}</div><div class="fin-li-sub">${esc(fmtDate(e.date))}</div></div>${stars(e.rating)}</li>`).join("")}</ul>
        </section>` : ""}
        ${o.by_category.length ? `<section class="card fin-card">
          <header><h2>What you do most</h2><span class="eyebrow">last 12 months</span></header>
          <ul class="fun-bars">${o.by_category.map((c) => `<li><span>${cat[c.category]?.icon || ""} ${esc(cat[c.category]?.name || c.category)}</span>
            <i><b style="width:${(100 * c.count) / maxCat}%"></b></i><em>${c.count}</em></li>`).join("")}</ul>
          <div class="fun-months" role="img" aria-label="Fun things per month">${o.months.map((m) => `
            <span title="${esc(monthName(m.month))}: ${m.count}"><b style="height:${Math.max(3, (100 * m.count) / maxMonth)}%"></b></span>`).join("")}</div>
          <div class="muted small">Per month, last 12 months</div>
        </section>` : ""}
      </div>
    </div></div>`;

  const root = view.querySelector("#fun-root");
  const refresh = () => render(view);
  root.querySelector("#fun-add").onclick = () => openEntry({}, o, refresh);
  root.querySelector("#idea-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    await api.post("/fun/ideas", { title: f.title.value, category: f.category.value });
    toast("Idea added");
    refresh();
  });
  root.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-entry]");
    if (row) return openEntry(o.log.find((x) => x.id === Number(row.dataset.entry)), o, refresh);
    const did = e.target.closest("[data-did]");
    if (did) {
      const idea = o.ideas.find((x) => x.id === Number(did.dataset.did));
      return openEntry({ title: idea.title, category: idea.category, idea_id: idea.id }, o, refresh);
    }
    const rm = e.target.closest("[data-rm-idea]");
    if (rm) { await api.del(`/fun/ideas/${rm.dataset.rmIdea}`); refresh(); }
  });
}

function openEntry(e, o, onChange) {
  const isNew = !e.id;
  let rating = e.rating || 0;
  const dlg = openDialog({
    title: e.idea_id ? "You did it! 🎉" : isNew ? "Log something fun" : "Edit", style: "--area:#f472b6",
    body: `<form id="fun-form" class="dlg-body" style="padding:0">
      <label class="field"><span>What did you do?</span><input type="text" name="title" required value="${esc(e.title || "")}" placeholder="e.g. Bowling with Sam" ${e.idea_id ? "readonly" : ""}></label>
      <div class="row">
        <label class="field"><span>When</span><input type="date" name="date" value="${esc(e.date || todayISO())}"></label>
        <label class="field"><span>Kind</span><select name="category" ${e.idea_id ? "disabled" : ""}>${o.categories.map((c) =>
          `<option value="${c.id}" ${c.id === (e.category || "other") ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}</select></label>
      </div>
      <div class="field"><span>How fun was it?</span><div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" data-star="${n}" aria-label="${n} star${n === 1 ? "" : "s"}">★</button>`).join("")}</div></div>
      <div class="row">
        <label class="field"><span>With (optional)</span><input type="text" name="with_whom" value="${esc(e.with_whom || "")}" placeholder="e.g. Sam, Jordan"></label>
        <label class="field"><span>Where (optional)</span><input type="text" name="place" value="${esc(e.place || "")}"></label>
      </div>
      <div class="row">
        <label class="field"><span>Cost (optional)</span><input type="number" name="cost" min="0" step="1" value="${e.cost ?? ""}"></label>
        <label class="field"><span>Notes (optional)</span><input type="text" name="notes" value="${esc(e.notes || "")}"></label>
      </div>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="fun-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  const starsEl = dlg.querySelector("#star-input");
  const showStars = () => starsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= rating));
  starsEl.onclick = (ev) => { const b = ev.target.closest("[data-star]"); if (b) { rating = Number(b.dataset.star) === rating ? 0 : Number(b.dataset.star); showStars(); } };
  showStars();
  if (!e.idea_id) form.title.focus();
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${e.title}”?`)) return;
    await api.del(`/fun/${e.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const body = { title: form.title.value, date: form.date.value, category: form.category.value, rating: rating || null,
      with_whom: form.with_whom.value, place: form.place.value, cost: form.cost.value ? Number(form.cost.value) : null, notes: form.notes.value };
    try {
      if (e.idea_id) await api.post(`/fun/ideas/${e.idea_id}/done`, body);
      else if (isNew) await api.post("/fun", body);
      else await api.patch(`/fun/${e.id}`, body);
      dlg.close();
      toast(isNew ? "Logged 🎉" : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
