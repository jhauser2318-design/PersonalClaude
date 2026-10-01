// Routines (recurring tasks): quick check-off rows, full cards with a
// 12-week history grid, and the add/edit dialog.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { areaOptions, areaStyle, areaTag, esc, fmtDate, openDialog, showError, toast, todayISO } from "./ui.js";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtAmount(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function orb(h, big = false) {
  let cls = "";
  let style = "";
  if (h.done_today) cls = "done";
  else if (h.logged_today && h.target_amount) {
    cls = "partial";
    style = `--p:${Math.min(100, Math.round((100 * (h.amount_today || 0)) / h.target_amount))}`;
  }
  const label = h.done_today ? `Undo “${h.title}” for today` : `Mark “${h.title}” done for today`;
  return `<button class="orb-check ${cls} ${big ? "big" : ""}" data-toggle style="${style}" aria-label="${esc(label)}" title="${esc(label)}">${icon("tick")}</button>`;
}

function streakBadge(h) {
  if (!h.streak) return `<span class="streak cold">${icon("flame")}0</span>`;
  const unit = h.frequency === "times_per_week" ? "wk" : "d";
  return `<span class="streak" title="Current streak">${icon("flame")}${h.streak}${unit}</span>`;
}

function progressText(h) {
  if (h.frequency === "times_per_week") return `${h.week_done}/${h.times_per_week} this week`;
  if (h.target_amount) return `${fmtAmount(h.amount_today || 0)}/${fmtAmount(h.target_amount)} ${esc(h.unit || "")} today`;
  return esc(h.schedule_text);
}

// ---------- Compact row (dashboard, tasks page, area page) ----------
export function routineRow(h) {
  return `<li class="routine-row ${h.done_today ? "is-done" : ""}" data-habit-id="${h.id}" style="${areaStyle(h.area)}">
    ${orb(h)}
    <div class="r-main">
      <div class="r-title">${esc(h.title)}</div>
      <div class="r-meta">${areaTag(h.area)}<span>${progressText(h)}</span>${h.remind_at ? `<span title="Daily reminder">🔔 ${esc(h.remind_at)}</span>` : ""}</div>
    </div>
    ${streakBadge(h)}
  </li>`;
}

export function routineList(habits, empty = "No routines due today.") {
  if (!habits.length) return `<div class="card empty">${esc(empty)}</div>`;
  return `<ul class="routine-list card">${habits.map(routineRow).join("")}</ul>`;
}

// ---------- Full card (routines page) ----------
export function routineCard(h) {
  const stat = (v, l, hot = false) => `<div class="stat"><div class="v ${hot ? "hot" : ""}">${v}</div><div class="l">${l}</div></div>`;
  const weekly = h.frequency === "times_per_week";
  const unitSuffix = weekly ? "wk" : "d";
  const thisWeek = h.target_amount
    ? fmtAmount(h.week_amount)
    : weekly ? `${h.week_done}/${h.times_per_week}` : `${h.history.slice(-7).filter((d) => d.state === "done").length}/7`;
  const weekLabel = h.target_amount ? `${esc(h.unit || "total")} this wk` : "This week";
  return `
  <article class="card routine ${h.active ? "" : "paused"}" data-habit-id="${h.id}" style="${areaStyle(h.area)}">
    <div class="rt-head">
      ${orb(h, true)}
      <div class="rt-titles">
        <h3 class="rt-title">${esc(h.title)}</h3>
        <div class="rt-sub">${areaTag(h.area)}<span>${esc(h.schedule_text)}</span>
          ${h.goal_title ? `<span>↳ ${esc(h.goal_title)}</span>` : ""}
          ${h.remind_at ? `<span title="Daily reminder">🔔 ${esc(h.remind_at)}</span>` : ""}
          ${h.active ? "" : `<span class="pill paused">Paused</span>`}</div>
      </div>
      <div class="rt-actions">
        <button class="icon-btn" data-backfill title="Check off a past day" aria-label="Check off a past day">${icon("calendar")}</button>
        <button class="icon-btn" data-pause title="${h.active ? "Pause" : "Resume"}" aria-label="${h.active ? "Pause" : "Resume"} routine">${icon(h.active ? "pause" : "play")}</button>
        <button class="icon-btn" data-edit title="Edit" aria-label="Edit routine">${icon("edit")}</button>
      </div>
    </div>
    <div class="stats">
      ${stat(`${h.streak}${unitSuffix}`, "Streak", h.streak > 0)}
      ${stat(`${h.best_streak}${unitSuffix}`, "Best")}
      ${stat(h.rate_30d == null ? "–" : `${h.rate_30d}%`, "30 days")}
      ${stat(thisWeek, weekLabel)}
    </div>
    ${h.target_amount ? `
      <form class="log-amount" data-log-amount>
        <input type="number" name="amount" min="0" step="0.25" placeholder="${fmtAmount(h.target_amount)}" aria-label="Amount to add">
        <span class="unit">${esc(h.unit || "")}</span>
        <button class="btn small" type="submit">${icon("plus")} Log</button>
        <span class="unit" style="margin-left:auto">today: ${fmtAmount(h.amount_today || 0)}/${fmtAmount(h.target_amount)}</span>
      </form>` : ""}
    <div class="heat-wrap" aria-label="Last 12 weeks">
      <div class="heat-days">${DAY_LETTERS.map((d, i) => `<span>${i % 2 === 0 ? d : ""}</span>`).join("")}</div>
      <div class="heat">${h.history.map((d) => d.state === "future" ? `<span class="future"></span>`
        : `<button type="button" class="${d.state}" data-day="${d.date}" title="${d.date}${d.amount != null ? ` · ${fmtAmount(d.amount)} ${esc(h.unit || "")}` : ""}${d.state === "missed" ? " · missed" : ""} · tap to change"
            aria-label="${esc(h.title)}, ${d.date}: ${d.state}"></button>`).join("")}</div>
      <div class="heat-caption">LAST<br>12 WEEKS<br><span class="heat-tip">tap a day<br>to fix it</span></div>
    </div>
  </article>`;
}

// ---------- Clicks (works for both rows and cards) ----------
export function bindRoutines(container, habits, onChange = () => state.refresh()) {
  const byId = Object.fromEntries(habits.map((h) => [h.id, h]));
  container.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-habit-id]");
    if (!el) return;
    const h = byId[el.dataset.habitId];
    if (!h) return;
    try {
      if (e.target.closest("[data-toggle]")) {
        if (h.done_today) {
          await api.del(`/habits/${h.id}/log`);
          toast(`“${h.title}” unchecked for today`);
        } else {
          const updated = await api.post(`/habits/${h.id}/log`, {});
          toast(updated.streak > 1 ? `🔥 ${updated.streak} streak! Nice.` : `“${h.title}” done ✓`);
        }
        onChange();
      } else if (e.target.closest("[data-day]")) {
        openDayLog(h, e.target.closest("[data-day]").dataset.day, onChange);
      } else if (e.target.closest("[data-backfill]")) {
        const y = new Date(Date.now() - 864e5);
        openDayLog(h, `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`, onChange);
      } else if (e.target.closest("[data-edit]")) {
        openRoutineEditor(h, onChange);
      } else if (e.target.closest("[data-pause]")) {
        await api.patch(`/habits/${h.id}`, { active: !h.active });
        toast(h.active ? "Routine paused" : "Routine resumed");
        onChange();
      }
    } catch (err) { toast(err.message); }
  });
  container.addEventListener("submit", async (e) => {
    const form = e.target.closest("[data-log-amount]");
    if (!form) return;
    e.preventDefault();
    const h = byId[form.closest("[data-habit-id]").dataset.habitId];
    const add = Number(form.amount.value || h.target_amount);
    if (!(add > 0)) return;
    try {
      await api.post(`/habits/${h.id}/log`, { amount: (h.amount_today || 0) + add });
      toast(`Logged ${fmtAmount(add)} ${h.unit || ""}`);
      onChange();
    } catch (err) { toast(err.message); }
  });
}

// ---------- Add / edit dialog ----------
export async function openRoutineEditor(h = {}, onChange = () => state.refresh()) {
  const isNew = !h.id;
  const goals = await api.get("/goals");
  const days = new Set((h.days || "").split(",").filter(Boolean).map(Number));
  const freq = h.frequency || "daily";
  const dlg = openDialog({
    title: isNew ? "New routine" : "Edit routine",
    style: areaStyle(h.area || state.areas[0].id),
    body: `
      <form id="routine-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Name</span>
          <input type="text" name="title" required value="${esc(h.title)}" placeholder="e.g. CPA study, Go to the gym, Skincare"></label>
        <div class="row">
          <label class="field"><span>Area</span><select name="area">${areaOptions(h.area)}</select></label>
          <label class="field"><span>Part of goal (optional)</span>
            <select name="goal_id"><option value="">— None —</option>
            ${goals.map((g) => `<option value="${g.id}" data-area="${g.area}" ${g.id === h.goal_id ? "selected" : ""}>${esc(g.title)}</option>`).join("")}
            </select></label>
        </div>
        <div class="field"><span>How often</span>
          <div class="segmented" id="freq">
            <button type="button" data-freq="daily">Every day</button>
            <button type="button" data-freq="weekdays">Specific days</button>
            <button type="button" data-freq="times_per_week">Times per week</button>
          </div>
        </div>
        <div class="field" data-for="weekdays"><span>On these days</span>
          <div class="day-toggles">${DAY_NAMES.map((d, i) =>
            `<label><input type="checkbox" name="day" value="${i}" ${days.has(i) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div>
        </div>
        <label class="field" data-for="times_per_week"><span>Times per week</span>
          <input type="number" name="times_per_week" min="1" max="7" value="${h.times_per_week || 3}"></label>
        <div class="row">
          <label class="field"><span>Daily target (optional)</span>
            <input type="number" name="target_amount" min="0" step="0.25" value="${h.target_amount ?? ""}" placeholder="e.g. 2"></label>
          <label class="field"><span>Unit</span>
            <input type="text" name="unit" value="${esc(h.unit || "")}" placeholder="e.g. hours, pages, km"></label>
        </div>
        <label class="field"><span>Daily reminder (optional) · only if it isn't done yet</span>
          <input type="time" name="remind_at" value="${esc(h.remind_at || "")}"></label>
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="routine-form">${isNew ? "Add routine" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  let frequency = freq;
  const showFreq = () => {
    dlg.querySelectorAll("#freq button").forEach((b) => b.classList.toggle("active", b.dataset.freq === frequency));
    dlg.querySelectorAll("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== frequency; });
  };
  dlg.querySelector("#freq").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { frequency = b.dataset.freq; showFreq(); }
  });
  showFreq();
  form.goal_id.addEventListener("change", () => {
    const area = form.goal_id.selectedOptions[0]?.dataset.area;
    if (area) { form.area.value = area; dlg.setAttribute("style", areaStyle(area)); }
  });
  form.area.addEventListener("change", () => dlg.setAttribute("style", areaStyle(form.area.value)));
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete the routine “${h.title}” and all its history?`)) return;
    await api.del(`/habits/${h.id}`);
    dlg.close();
    toast("Routine deleted");
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: form.title.value.trim(),
      area: form.area.value,
      goal_id: form.goal_id.value ? Number(form.goal_id.value) : null,
      frequency,
      days: [...form.querySelectorAll("input[name=day]:checked")].map((c) => Number(c.value)),
      times_per_week: frequency === "times_per_week" ? Number(form.times_per_week.value) : null,
      target_amount: form.target_amount.value ? Number(form.target_amount.value) : null,
      unit: form.unit.value.trim() || null,
    };
    const remind = form.remind_at.value || null;
    if (isNew ? remind : remind !== (h.remind_at || null)) body.remind_at = remind;
    try {
      if (isNew) await api.post("/habits", body);
      else await api.patch(`/habits/${h.id}`, body);
      dlg.close();
      toast(isNew ? "Routine added" : "Routine saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}

// ---------- Check off (or fix) any past day ----------
export function openDayLog(h, day, onChange = () => state.refresh()) {
  const amountBased = !!h.target_amount;
  const dlg = openDialog({
    title: esc(h.title), style: areaStyle(h.area),
    body: `<form id="day-log" class="dlg-body" style="padding:0">
      <label class="field"><span>Day</span><input type="date" name="date" value="${esc(day)}" max="${todayISO()}" required></label>
      <p class="day-status muted small" style="margin:0">Loading…</p>
      ${amountBased ? `<label class="field"><span>How much (${esc(h.unit || "")}, goal ${fmtAmount(h.target_amount)})</span>
        <input type="number" name="amount" min="0" step="0.25" value="${fmtAmount(h.target_amount)}"></label>` : ""}
      <label class="field"><span>Note (optional)</span><input type="text" name="note" placeholder="e.g. did it at lunch"></label>
    </form>`,
    foot: `<button class="btn danger" data-unlog hidden>Undo this day</button>
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="day-log">${icon("tick")} Mark done</button></div>`,
  });
  const form = dlg.querySelector("form");
  const status = dlg.querySelector(".day-status");
  const unlog = dlg.querySelector("[data-unlog]");
  const save = dlg.querySelector('[type="submit"]');
  const load = async () => {
    const d = form.date.value;
    if (!d) return;
    status.textContent = "Loading…";
    try {
      const log = await api.get(`/habits/${h.id}/log?date=${d}`);
      const logged = log.logged !== false;
      status.textContent = logged
        ? `${fmtDate(d)}: checked off${log.amount != null && amountBased ? ` (${fmtAmount(log.amount)} ${h.unit || ""})` : ""} ✓`
        : `${fmtDate(d)}: not checked off yet.`;
      unlog.hidden = !logged;
      save.innerHTML = `${icon("tick")} ${logged ? "Save" : "Mark done"}`;
      if (amountBased) form.amount.value = fmtAmount(logged && log.amount != null ? log.amount : h.target_amount);
      form.note.value = logged ? log.note || "" : "";
    } catch (err) { status.textContent = err.message; }
  };
  form.date.addEventListener("change", load);
  load();
  unlog.onclick = async () => {
    try {
      await api.del(`/habits/${h.id}/log?date=${form.date.value}`);
      dlg.close();
      toast(`“${h.title}” unchecked for ${fmtDate(form.date.value)}`);
      onChange();
    } catch (err) { showError(form, err); }
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { date: form.date.value, note: form.note.value.trim() };
    if (amountBased) body.amount = Number(form.amount.value || 0);
    try {
      await api.post(`/habits/${h.id}/log`, body);
      dlg.close();
      toast(`“${h.title}” checked off for ${fmtDate(body.date)} ✓`);
      onChange();
    } catch (err) { showError(form, err); }
  });
}
