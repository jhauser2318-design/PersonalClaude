// Journal: write a few lines each night. One entry per day, saved as you type.
// Entries stay on your PC and are never sent to the AI unless you ask it to add something.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, toast, todayISO } from "../ui.js";

const PROMPTS = ["How did today go?", "What went well?", "What's on your mind?", "What are you grateful for?",
  "What did you learn today?", "What would make tomorrow great?"];
const MOOD_NAMES = { 1: "Rough", 2: "Meh", 3: "Okay", 4: "Good", 5: "Great" };
let day = null;
let query = "";
let pending = null; // { day, body } waiting to be saved
let timer = null;

function shift(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const longDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const words = (t) => (t.match(/\S+/g) || []).length;

async function flush() {
  clearTimeout(timer);
  if (!pending) return null;
  const p = pending;
  pending = null;
  return api.put(`/journal/${p.day}`, { body: p.body });
}
// Don't lose the last few words when you leave the page or close the app.
window.addEventListener("hashchange", () => { flush().catch(() => {}); });
window.addEventListener("pagehide", () => {
  if (!pending) return;
  fetch(`/api/journal/${pending.day}`, { method: "PUT", keepalive: true, credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: pending.body }) });
  pending = null;
});

export async function render(view, arg) {
  await flush().catch(() => {});
  const today = todayISO();
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) day = arg > today ? today : arg;
  if (!day || day > today) day = today;
  const [o, e] = await Promise.all([api.get(`/journal?q=${encodeURIComponent(query)}`), api.get(`/journal/${day}`)]);
  const isToday = day === today;
  const prompt = PROMPTS[Number(day.slice(-2)) % PROMPTS.length];
  const times = ["", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"];

  view.innerHTML = `<div id="jr-root">
    <div class="page-head"><div>
      <div class="eyebrow">Life · every night</div>
      <h1>Journal</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:${o.written_today ? "var(--success)" : "var(--warning)"}"></span>${o.written_today ? "<b>written</b> today" : "not written yet today"}</span>
        ${o.streak ? `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span>🔥 <b>${o.streak}</b> night${o.streak === 1 ? "" : "s"} in a row</span>` : ""}
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${o.this_month}</b> this month · ${o.total} total</span>
      </div></div>
      <label class="jr-remind" title="A notification at night if you haven't written yet">${icon("bell")}
        <select id="jr-remind" aria-label="Nightly reminder">${times.map((t) => `<option value="${t}" ${t === o.remind_at ? "selected" : ""}>${t ? `Remind me at ${t}` : "No reminder"}</option>`).join("")}</select></label>
    </div>
    <div class="jr-cols">
      <section class="card jr-editor">
        <div class="jr-nav">
          <button class="icon-btn" id="jr-prev" aria-label="Previous day">‹</button>
          <div class="jr-day"><b>${esc(isToday ? "Tonight" : longDate(day))}</b><span>${isToday ? esc(longDate(day)) : ""}</span></div>
          <button class="icon-btn" id="jr-next" aria-label="Next day" ${isToday ? "disabled" : ""}>›</button>
          <input type="date" id="jr-date" value="${day}" max="${today}" aria-label="Pick a day">
        </div>
        <div class="jr-moods" role="group" aria-label="How was the day?">
          <span class="muted small">How was the day?</span>
          ${Object.entries(o.moods).map(([n, emo]) => `<button type="button" data-mood="${n}" class="${Number(n) === e.mood ? "on" : ""}" title="${MOOD_NAMES[n]}" aria-label="${MOOD_NAMES[n]}" aria-pressed="${Number(n) === e.mood}">${emo}</button>`).join("")}
        </div>
        <textarea id="jr-body" placeholder="${esc(prompt)}" aria-label="Journal entry">${esc(e.body || "")}</textarea>
        <div class="jr-foot">
          <span class="muted small" id="jr-status">${e.updated_at ? `Saved · ${words(e.body)} words` : "Saves as you type"}</span>
          ${e.updated_at ? `<button class="btn small danger" id="jr-delete">${icon("trash")} Delete entry</button>` : ""}
        </div>
      </section>
      <div class="jr-side">
        ${o.look_back ? `<section class="card fin-card jr-lookback" data-day="${o.look_back.date}">
          <header><h2>${esc(o.look_back.label)}</h2><span class="eyebrow">${esc(fmtDate(o.look_back.date))} ${o.look_back.mood_emoji}</span></header>
          <p>${esc(o.look_back.body.slice(0, 280))}${o.look_back.body.length > 280 ? "…" : ""}</p></section>` : ""}
        <section class="card fin-card">
          <header><h2>Past entries</h2><span class="eyebrow">${o.entries.length}${o.entries.length >= 60 ? "+" : ""}</span></header>
          <form id="jr-search" class="jr-search"><input type="search" name="q" value="${esc(query)}" placeholder="Search your journal" aria-label="Search your journal"></form>
          ${o.entries.length ? `<ul class="jr-list">${o.entries.map((x) => `
            <li><button type="button" data-day="${x.date}" class="${x.date === day ? "on" : ""}">
              <span class="jr-li-head"><b>${esc(fmtDate(x.date))}</b>${x.mood_emoji ? `<span>${x.mood_emoji}</span>` : ""}<em>${x.words} words</em></span>
              <span class="jr-li-text">${esc(x.preview) || "<i>mood only</i>"}</span></button></li>`).join("")}</ul>`
            : `<div class="empty">${query ? "No entries match." : "No entries yet. Tonight's the first one."}</div>`}
        </section>
      </div>
    </div></div>`;

  const root = view.querySelector("#jr-root");
  const go = async (d) => { await flush().catch(() => {}); location.hash = `#/journal/${d}`; };
  const body = root.querySelector("#jr-body");
  const status = root.querySelector("#jr-status");
  if (!e.body && window.matchMedia("(min-width: 800px)").matches) body.focus();

  const save = async () => {
    try {
      const r = await flush();
      if (r) status.textContent = r.updated_at ? `Saved · ${words(r.body)} words` : "Empty entries aren't kept";
    } catch (err) { status.textContent = `Couldn't save: ${err.message}`; }
  };
  body.addEventListener("input", () => {
    pending = { day, body: body.value };
    status.textContent = "Saving…";
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  });
  body.addEventListener("blur", save);

  root.querySelector("#jr-prev").onclick = () => go(shift(day, -1));
  root.querySelector("#jr-next").onclick = () => go(shift(day, 1));
  root.querySelector("#jr-date").onchange = (ev) => ev.target.value && go(ev.target.value);
  root.querySelector(".jr-moods").onclick = async (ev) => {
    const b = ev.target.closest("[data-mood]");
    if (!b) return;
    await flush().catch(() => {});
    const n = Number(b.dataset.mood);
    await api.put(`/journal/${day}`, n === e.mood ? { clear_mood: true } : { mood: n });
    render(view, day);
  };
  root.querySelector("#jr-delete")?.addEventListener("click", async () => {
    if (!confirm(`Delete your entry for ${fmtDate(day)}? This can't be undone.`)) return;
    pending = null;
    await api.del(`/journal/${day}`);
    toast("Entry deleted");
    render(view, day);
  });
  root.querySelector("#jr-remind").onchange = async (ev) => {
    await api.put("/journal/settings", { remind_at: ev.target.value });
    toast(ev.target.value ? `You'll get a nudge at ${ev.target.value} if you haven't written yet` : "Nightly reminder off");
  };
  root.querySelector("#jr-search").addEventListener("submit", (ev) => { ev.preventDefault(); query = ev.target.q.value; render(view, day); });
  root.querySelector("#jr-search input").addEventListener("search", (ev) => { if (!ev.target.value && query) { query = ""; render(view, day); } });
  root.querySelector(".jr-side").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-day]");
    if (b && b.dataset.day !== day) go(b.dataset.day);
  });
}
