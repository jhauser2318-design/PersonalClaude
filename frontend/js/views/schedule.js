// Daily schedule: your own time blocks for the day (study, gym, deep work…).
// These stay in the app; only what you explicitly ask for goes to Google Calendar, and
// those are shown here faded, next to your blocks, so you can plan around them.
import { api } from "../api.js";
import { startFocus } from "../focus.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { areaOptions, esc, openDialog, showError, toast, todayISO } from "../ui.js";

const HOUR_PX = 56;
const SNAP = 15; // minutes: blocks snap to quarter hours while dragging
const LAST_MIN = 23 * 60 + 59;
let suppressClick = false; // a drag just ended: don't also treat it as a click
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
let current = null; // the day being shown (YYYY-MM-DD)

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
function shiftDay(iso, by) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + by);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function dayTitle(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const t = todayISO();
  return iso === t ? `Today · ${label}` : iso === shiftDay(t, 1) ? `Tomorrow · ${label}` : iso === shiftDay(t, -1) ? `Yesterday · ${label}` : label;
}

// Put overlapping items side by side: each gets a lane and the lane count of its group.
function lanes(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  let group = [], groupEnd = -1;
  const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => { g.lanes = n; }); group = []; };
  for (const it of sorted) {
    if (it.s >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    it.lane = lane;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  }
  if (group.length) flush();
  return sorted;
}

function eventItems(events, day) {
  return events.filter((e) => !e.all_day && e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day).map((e) => ({
    kind: "event", id: e.id, title: e.title, location: e.location,
    s: e.start.slice(0, 10) < day ? 0 : toMin(e.start.slice(11, 16)),
    e: e.end.slice(0, 10) > day ? 24 * 60 : toMin(e.end.slice(11, 16)),
  }));
}

function timeline(plan, day) {
  const blocks = plan.blocks.map((b) => ({ kind: "block", ...b, s: toMin(b.start), e: toMin(b.end) }));
  const events = eventItems(plan.events, day);
  const all = [...blocks, ...events];
  let first = 6, last = 23;
  for (const it of all) { first = Math.min(first, Math.floor(it.s / 60)); last = Math.max(last, Math.ceil(it.e / 60)); }
  last = Math.min(24, Math.max(last, first + 1));
  const top = (min) => ((min - first * 60) / 60) * HOUR_PX;
  const hours = [];
  for (let h = first; h <= last; h++) hours.push(h);
  const isToday = day === todayISO();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return `
    <div class="sched-timeline" style="height:${(last - first) * HOUR_PX}px" data-first="${first}">
      ${hours.map((h) => `<div class="sched-hour" style="top:${(h - first) * HOUR_PX}px"><span>${h === 24 ? "" : esc(fmtTime(fromMin(h * 60)))}</span></div>`).join("")}
      <div class="sched-lanes">
        ${lanes(all).map((it) => {
          const style = `top:${top(it.s)}px;height:${Math.max(22, top(it.e) - top(it.s) - 3)}px;left:calc(${(100 / it.lanes) * it.lane}% + 2px);width:calc(${100 / it.lanes}% - 4px)`;
          const short = it.e - it.s < 45;
          if (it.kind === "event") {
            return `<div class="sched-item sched-event ${short ? "short" : ""}" style="${style}" title="Google Calendar event">
              <div class="si-title">${icon("calendar")} ${esc(it.title)}</div>
              ${short ? "" : `<div class="si-time">${esc(fmtTime(fromMin(it.s)))}–${esc(fmtTime(fromMin(Math.min(it.e, 1439))))}${it.location ? ` · ${esc(it.location)}` : ""}</div>`}
            </div>`;
          }
          const color = state.areaById[it.area]?.color;
          return `<div class="sched-item sched-block ${it.done ? "done" : ""} ${short ? "short" : ""}" style="${style};${color ? `--area:${color}` : ""}" data-block="${it.id}" data-s="${it.s}" data-e="${it.e}">
            <span class="si-grip" data-grip title="Drag to move" aria-hidden="true">⋮⋮</span>
            <input type="checkbox" class="check" ${it.done ? "checked" : ""} aria-label="Mark “${esc(it.title)}” as done">
            <div class="si-main">
              <div class="si-title">${esc(it.title)}</div>
              ${short ? `<div class="si-time" hidden></div>` : `<div class="si-time">${esc(fmtTime(it.start))}–${esc(fmtTime(it.end))}${it.notes ? ` · ${esc(it.notes)}` : ""}</div>`}
            </div>
            ${isToday && !it.done ? `<button class="icon-btn si-focus" data-focus="${it.id}" title="Start a focus timer for this block" aria-label="Focus">${icon("timer")}</button>` : ""}
            <div class="si-resize" data-resize title="Drag to change the end time"></div>
          </div>`;
        }).join("")}
        ${isToday && nowMin >= first * 60 && nowMin <= last * 60 ? `<div class="sched-now" style="top:${top(nowMin)}px"><span></span></div>` : ""}
      </div>
    </div>`;
}

export async function render(view, arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) current = arg;
  if (!current) current = todayISO();
  const day = current;
  const [plan, habits, focus] = await Promise.all([
    api.get(`/schedule?day=${day}`), api.get("/habits"), api.get("/focus/today").catch(() => ({ minutes: 0 })),
  ]);
  const allDay = plan.events.filter((e) => e.all_day);
  const wd = (new Date(`${day}T12:00`).getDay() + 6) % 7;
  const tmplForDay = plan.templates.find((t) => t.weekdays.includes(wd));

  view.innerHTML = `<div id="sched-root">
    <div class="page-head"><div>
      <div class="eyebrow">Your day · stays in the app, not on Google Calendar</div>
      <h1>Schedule</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${plan.done}/${plan.total}</b> blocks done</span>
        ${plan.events.length ? `<span class="status-chip"><span class="dot" style="--c:#c084fc"></span><b>${plan.events.length}</b> calendar event${plan.events.length === 1 ? "" : "s"}</span>` : ""}
        ${day === todayISO() && focus.minutes ? `<span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span><b>${Math.round(focus.minutes)}</b> min focused today</span>` : ""}
        ${plan.template_used ? `<span class="status-chip"><span class="dot" style="--c:var(--accent)"></span>filled from <b>${esc(plan.template_used)}</b></span>` : ""}
      </div></div>
      <button class="btn primary" id="sc-add">${icon("plus")} Add block</button></div>

    <div class="sched-nav card">
      <button class="icon-btn" id="sc-prev" aria-label="Previous day">‹</button>
      <div class="sched-day"><b>${esc(dayTitle(day))}</b></div>
      <button class="icon-btn" id="sc-next" aria-label="Next day">›</button>
      <input type="date" id="sc-date" value="${day}" aria-label="Pick a day">
      ${day !== todayISO() ? `<button class="btn small" id="sc-today">Today</button>` : ""}
    </div>

    <div class="sched-cols">
      <section class="card sched-card">
        ${allDay.length ? `<div class="sched-allday">${allDay.map((e) => `<span class="chip">${icon("calendar")} ${esc(e.title)}</span>`).join("")}</div>` : ""}
        <div class="sched-palette">
          <span class="eyebrow">Drag onto your day</span>
          ${plan.presets.map((p, i) => `<button class="chip preset" data-preset="${i}" style="${state.areaById[p.area] ? `--area:${state.areaById[p.area].color}` : ""}">
            <span class="dot"></span>${esc(p.title)}<small>${p.minutes >= 60 ? `${p.minutes / 60}h` : `${p.minutes}m`}</small></button>`).join("")}
          <button class="icon-btn" id="sc-presets" title="Edit common blocks" aria-label="Edit common blocks">${icon("edit")}</button>
        </div>
        ${plan.blocks.length || plan.events.length ? "" : `<p class="muted small sched-hint">Nothing planned yet. Drag a block above onto a time, click an empty time, or tell the AI bar “Gym 6–7am, CPA study 7–9pm”.
          ${plan.templates.length ? "Or apply one of your typical days." : ""}</p>`}
        ${timeline(plan, day)}
      </section>
      <aside class="sched-side">
        <section class="card fin-card">
          <header><h2>Typical days</h2><span class="eyebrow">templates</span></header>
          <p class="muted small" style="margin:0 0 10px">A typical day fills in each new day automatically (for the weekdays you pick). Plan one day the way you like it, then save it.</p>
          ${plan.templates.length ? `<ul class="fin-list">${plan.templates.map((t) => `
            <li><div><div class="fin-li-title">${esc(t.name)}${tmplForDay?.id === t.id ? ` <span class="pill">this day</span>` : ""}</div>
              <div class="fin-li-sub">${t.weekdays.length ? t.weekdays.map((d) => WEEKDAYS[d]).join(" ") : "no days (apply by hand)"} · ${t.blocks.length} block${t.blocks.length === 1 ? "" : "s"}</div></div>
              <button class="btn small" data-apply="${t.id}">Apply</button>
              <button class="icon-btn" data-tedit="${t.id}" aria-label="Edit template">${icon("edit")}</button></li>`).join("")}</ul>`
            : `<div class="empty" style="padding:10px">No typical days yet.</div>`}
          <div class="fin-card-foot"><button class="btn small" id="sc-save-tmpl" ${plan.blocks.length ? "" : "disabled"}>${icon("plus")} Save this day as a typical day</button></div>
        </section>
        <section class="card fin-card">
          <header><h2>Copy</h2></header>
          <div class="btn-row">
            <button class="btn small" id="sc-copy-prev">Copy from the day before</button>
            <button class="btn small" id="sc-copy-next" ${plan.blocks.length ? "" : "disabled"}>Copy to the next day</button>
          </div>
        </section>
      </aside>
    </div></div>`;

  const root = view.querySelector("#sched-root");
  const go = (d) => { current = d; render(view); };
  const refresh = () => render(view);
  root.querySelector("#sc-prev").onclick = () => go(shiftDay(day, -1));
  root.querySelector("#sc-next").onclick = () => go(shiftDay(day, 1));
  root.querySelector("#sc-today")?.addEventListener("click", () => go(todayISO()));
  root.querySelector("#sc-date").onchange = (e) => e.target.value && go(e.target.value);
  root.querySelector("#sc-add").onclick = () => openBlockEditor({ date: day }, refresh);

  const byId = Object.fromEntries(plan.blocks.map((b) => [b.id, b]));
  root.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-focus]");
    if (f) {
      const b = byId[f.dataset.focus];
      const mins = Math.max(5, toMin(b.end) - Math.max(toMin(b.start), new Date().getHours() * 60 + new Date().getMinutes()));
      const habit = habits.find((h) => h.active && b.title.toLowerCase().includes(h.title.toLowerCase().split(" ")[0]));
      return startFocus({ minutes: Math.min(mins, 180), label: b.title, habitId: habit?.id || null });
    }
    if (suppressClick) return;
    const block = e.target.closest("[data-block]");
    if (block && !e.target.matches(".check")) return openBlockEditor(byId[block.dataset.block], refresh);
    const apply = e.target.closest("[data-apply]");
    if (apply) {
      const t = plan.templates.find((x) => x.id === Number(apply.dataset.apply));
      if (plan.blocks.length && !confirm(`Replace this day's blocks with “${t.name}”?`)) return;
      await api.post(`/schedule/templates/${t.id}/apply`, { date: day });
      toast(`Applied “${t.name}”`);
      return refresh();
    }
    const tedit = e.target.closest("[data-tedit]");
    if (tedit) return openTemplateEditor(plan.templates.find((x) => x.id === Number(tedit.dataset.tedit)), day, refresh);
    // Click on an empty spot in the timeline: new block at that hour.
    const tl = e.target.closest(".sched-lanes");
    if (tl && e.target === tl) {
      const first = Number(root.querySelector(".sched-timeline").dataset.first);
      const y = e.clientY - tl.getBoundingClientRect().top;
      const start = Math.min(23 * 60, first * 60 + Math.floor(y / HOUR_PX * 2) * 30);
      openBlockEditor({ date: day, start: fromMin(start), end: fromMin(start + 60) }, refresh);
    }
  });
  root.addEventListener("change", async (e) => {
    if (!e.target.matches(".sched-block .check")) return;
    await api.patch(`/schedule/blocks/${e.target.closest("[data-block]").dataset.block}`, { done: e.target.checked });
    refresh();
  });
  bindDrag(root, day, plan.presets, refresh);
  root.querySelector("#sc-presets").onclick = () => openPresetEditor(plan.presets, refresh);
  root.querySelector("#sc-save-tmpl").onclick = () => openTemplateEditor({ name: "", weekdays: [wd], blocks: plan.blocks }, day, refresh);
  root.querySelector("#sc-copy-prev").onclick = async () => {
    const prev = shiftDay(day, -1);
    if (plan.blocks.length && !confirm("Replace this day's blocks with the day before's?")) return;
    const r = await api.post("/schedule/copy", { from_date: prev, to_date: day, replace: true });
    toast(r.length ? `Copied ${r.length} block${r.length === 1 ? "" : "s"}` : "The day before had nothing planned");
    refresh();
  };
  root.querySelector("#sc-copy-next").onclick = async () => {
    const next = shiftDay(day, 1);
    await api.post("/schedule/copy", { from_date: day, to_date: next, replace: true });
    toast("Copied to the next day");
    go(next);
  };
}

export function openBlockEditor(b = {}, onChange = () => state.refresh()) {
  const isNew = !b.id;
  const dlg = openDialog({
    title: isNew ? "New time block" : "Edit time block",
    style: b.area && state.areaById[b.area] ? `--area:${state.areaById[b.area].color}` : "--area:var(--accent)",
    body: `
      <form id="blk-form" class="dlg-body" style="padding:0">
        <label class="field"><span>What</span>
          <input type="text" name="title" required value="${esc(b.title || "")}" placeholder="e.g. CPA study, Gym, Deep work"></label>
        <div class="row">
          <label class="field"><span>Start</span><input type="time" name="start" required value="${esc(b.start || "09:00")}"></label>
          <label class="field"><span>End</span><input type="time" name="end" required value="${esc(b.end || "10:00")}"></label>
        </div>
        <div class="row">
          <label class="field"><span>Day</span><input type="date" name="date" required value="${esc(b.date || todayISO())}"></label>
          <label class="field"><span>Life area (optional)</span>
            <select name="area"><option value="">None</option>${areaOptions(b.area)}</select></label>
        </div>
        <label class="field"><span>Notes (optional)</span>
          <input type="text" name="notes" value="${esc(b.notes || "")}" placeholder="e.g. FAR chapter 6, library"></label>
        ${isNew ? "" : `<label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="done" ${b.done ? "checked" : ""}> <span>Done</span></label>`}
        <p class="muted small" style="margin:0">Time blocks stay in this app. Nothing here goes to Google Calendar. To put something on it, use the Calendar page or say “…on my calendar” in the AI bar.</p>
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="blk-form">${isNew ? "Add" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.start.addEventListener("change", () => {
    // Keep the length when the start moves.
    if (!form.start.value) return;
    const len = b.start && b.end ? toMin(b.end) - toMin(b.start) : 60;
    if (!b.id || toMin(form.end.value) <= toMin(form.start.value)) form.end.value = fromMin(Math.min(24 * 60 - 1, toMin(form.start.value) + len));
  });
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    await api.del(`/schedule/blocks/${b.id}`);
    dlg.close();
    toast("Block removed");
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { title: form.title.value.trim(), start: form.start.value, end: form.end.value, date: form.date.value,
      area: form.area.value || null, notes: form.notes.value.trim() };
    if (!isNew) body.done = form.done.checked;
    try {
      if (isNew) await api.post("/schedule/blocks", body);
      else await api.patch(`/schedule/blocks/${b.id}`, body);
      dlg.close();
      toast(isNew ? "Block added" : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}

function openTemplateEditor(t, day, onChange) {
  const isNew = !t.id;
  const days = new Set(t.weekdays || []);
  const dlg = openDialog({
    title: isNew ? "Save as a typical day" : "Edit typical day",
    style: "--area:var(--accent)",
    body: `
      <form id="tmpl-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Name</span>
          <input type="text" name="name" required value="${esc(t.name || "")}" placeholder="e.g. Workday, Weekend, Study day"></label>
        <div class="field"><span>Use it automatically on</span>
          <div class="chips" id="tmpl-days">${WEEKDAYS.map((d, i) => `<button type="button" class="chip ${days.has(i) ? "active" : ""}" data-d="${i}">${d}</button>`).join("")}</div></div>
        <div class="field"><span>Blocks</span>
          <ul class="fin-list">${(t.blocks || []).map((b) => `<li><div><div class="fin-li-title">${esc(b.title)}</div>
            <div class="fin-li-sub">${esc(fmtTime(b.start))}–${esc(fmtTime(b.end))}</div></div></li>`).join("") || `<li><div class="muted small">No blocks</div></li>`}</ul></div>
        ${isNew ? "" : `<label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="update"> <span>Replace its blocks with the day I'm looking at</span></label>`}
        <p class="muted small" style="margin:0">New days are filled from it the first time you open them. Days you've already planned aren't changed.</p>
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="tmpl-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  dlg.querySelector("#tmpl-days").onclick = (e) => {
    const c = e.target.closest("[data-d]");
    if (!c) return;
    const d = Number(c.dataset.d);
    days.has(d) ? days.delete(d) : days.add(d);
    c.classList.toggle("active", days.has(d));
  };
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete the typical day “${t.name}”? Days already planned keep their blocks.`)) return;
    await api.del(`/schedule/templates/${t.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value.trim(), weekdays: [...days] };
    if (isNew || form.update?.checked) body.from_date = day;
    else body.blocks = t.blocks;
    try {
      if (isNew) await api.post("/schedule/templates", body);
      else await api.patch(`/schedule/templates/${t.id}`, body);
      dlg.close();
      toast("Typical day saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

// ---------------------------------------------------------------------------
// Dragging: move a block (grab it, or its ⋮⋮ grip on a phone), stretch it from
// its bottom edge, or drag a common block from the palette onto a time.
// ---------------------------------------------------------------------------

function bindDrag(root, day, presets, refresh) {
  const lanesEl = root.querySelector(".sched-lanes");
  const first = Number(root.querySelector(".sched-timeline").dataset.first);
  const perMin = HOUR_PX / 60;
  const snap = (m) => Math.round(m / SNAP) * SNAP;
  const minAt = (y) => first * 60 + (y - lanesEl.getBoundingClientRect().top) / perMin;
  const autoScroll = (y) => {
    if (y > window.innerHeight - 50) window.scrollBy(0, 14);
    else if (y < 130) window.scrollBy(0, -14);
  };
  const endDrag = () => { suppressClick = true; setTimeout(() => { suppressClick = false; }, 80); };

  // Existing blocks: move or resize.
  lanesEl.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".sched-block");
    if (!el || e.button > 0 || e.target.closest(".check, button")) return;
    const onHandle = e.target.closest("[data-grip], [data-resize]");
    if (e.pointerType !== "mouse" && !onHandle) return; // on a phone, dragging elsewhere scrolls the page
    const mode = e.target.closest("[data-resize]") ? "resize" : "move";
    const s0 = Number(el.dataset.s), e0 = Number(el.dataset.e);
    const top0 = el.offsetTop, h0 = el.offsetHeight, y0 = e.clientY;
    const timeEl = el.querySelector(".si-time");
    let moved = false, ns = s0, ne = e0;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dy = ev.clientY - y0;
      if (!moved && Math.abs(dy) < 5) return;
      moved = true;
      el.classList.add("dragging");
      const d = snap(dy / perMin);
      if (mode === "move") {
        ns = Math.max(0, Math.min(LAST_MIN - (e0 - s0), s0 + d));
        ne = ns + (e0 - s0);
        el.style.top = `${top0 + (ns - s0) * perMin}px`;
      } else {
        ne = Math.max(s0 + SNAP, Math.min(LAST_MIN, e0 + d));
        el.style.height = `${Math.max(22, h0 + (ne - e0) * perMin)}px`;
      }
      if (timeEl) { timeEl.hidden = false; timeEl.textContent = `${fmtTime(fromMin(ns))}–${fmtTime(fromMin(ne))}`; }
      autoScroll(ev.clientY);
    };
    const onUp = async () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (!moved) return;
      endDrag();
      if (ns === s0 && ne === e0) return refresh();
      try {
        await api.patch(`/schedule/blocks/${el.dataset.block}`, { start: fromMin(ns), end: fromMin(ne) });
        toast(`${mode === "move" ? "Moved" : "Now"} ${fmtTime(fromMin(ns))}–${fmtTime(fromMin(ne))}`);
      } catch (err) { toast(err.message, 5000); }
      refresh();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });

  // Common blocks: drag from the palette onto the timeline (or just click one).
  root.querySelector(".sched-palette").addEventListener("pointerdown", (e) => {
    const chip = e.target.closest("[data-preset]");
    if (!chip || e.button > 0) return;
    e.preventDefault();
    const p = presets[Number(chip.dataset.preset)];
    const color = state.areaById[p.area]?.color || "var(--accent)";
    const x0 = e.clientX, y0 = e.clientY;
    let ghost = null, drop = null, start = null;
    chip.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!ghost) {
        ghost = Object.assign(document.createElement("div"), { className: "sched-ghost" });
        ghost.style.setProperty("--area", color);
        document.body.appendChild(ghost);
        drop = Object.assign(document.createElement("div"), { className: "sched-drop" });
        drop.style.setProperty("--area", color);
        lanesEl.appendChild(drop);
      }
      const r = lanesEl.getBoundingClientRect();
      const over = ev.clientX >= r.left - 40 && ev.clientX <= r.right + 40 && ev.clientY >= r.top && ev.clientY <= r.bottom;
      start = over ? Math.max(0, Math.min(LAST_MIN - p.minutes, snap(minAt(ev.clientY)))) : null;
      ghost.textContent = start == null ? p.title : `${p.title} · ${fmtTime(fromMin(start))}`;
      ghost.style.left = `${ev.clientX + 14}px`;
      ghost.style.top = `${ev.clientY + 10}px`;
      drop.hidden = start == null;
      if (start != null) {
        drop.style.top = `${(start - first * 60) * perMin}px`;
        drop.style.height = `${Math.max(20, p.minutes * perMin - 3)}px`;
        drop.textContent = `${p.title} · ${fmtTime(fromMin(start))}–${fmtTime(fromMin(Math.min(LAST_MIN, start + p.minutes)))}`;
      }
      autoScroll(ev.clientY);
    };
    const onUp = async () => {
      chip.removeEventListener("pointermove", onMove);
      chip.removeEventListener("pointerup", onUp);
      chip.removeEventListener("pointercancel", onUp);
      ghost?.remove();
      drop?.remove();
      if (!ghost) { // a click: open it pre-filled at the next free-ish time
        const now = new Date();
        const at = day === todayISO() ? Math.min(LAST_MIN - p.minutes, snap(now.getHours() * 60 + now.getMinutes() + 7)) : 9 * 60;
        return openBlockEditor({ date: day, title: p.title, area: p.area, start: fromMin(at), end: fromMin(Math.min(LAST_MIN, at + p.minutes)) }, refresh);
      }
      if (start == null) return;
      try {
        await api.post("/schedule/blocks", { date: day, title: p.title, area: p.area, start: fromMin(start),
          end: fromMin(Math.min(LAST_MIN, start + p.minutes)) });
        toast(`${p.title} added at ${fmtTime(fromMin(start))}`);
      } catch (err) { toast(err.message, 5000); }
      refresh();
    };
    chip.addEventListener("pointermove", onMove);
    chip.addEventListener("pointerup", onUp);
    chip.addEventListener("pointercancel", onUp);
  });
}

function openPresetEditor(presets, onChange) {
  const row = (p = { title: "", minutes: 60, area: null }) => `<div class="preset-row">
    <input type="text" data-k="title" value="${esc(p.title)}" placeholder="Name" aria-label="Name">
    <input type="number" data-k="minutes" min="5" step="5" value="${p.minutes}" aria-label="Minutes">
    <select data-k="area" aria-label="Life area"><option value="">No area</option>${areaOptions(p.area)}</select>
    <button type="button" class="icon-btn danger" data-rm aria-label="Remove">${icon("x")}</button></div>`;
  const dlg = openDialog({
    title: "Common blocks", style: "--area:var(--accent)",
    body: `<form id="pre-form" class="dlg-body" style="padding:0">
      <p class="muted small" style="margin:0">The blocks you drag onto your day. Name · length in minutes · life area.</p>
      <div id="pre-rows">${presets.map(row).join("")}</div>
      <button type="button" class="btn small" id="pre-add" style="align-self:flex-start">${icon("plus")} Add one</button>
    </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="pre-form">Save</button></div>`,
  });
  const rows = dlg.querySelector("#pre-rows");
  dlg.querySelector("#pre-add").onclick = () => { rows.insertAdjacentHTML("beforeend", row()); rows.lastElementChild.querySelector("input").focus(); };
  rows.addEventListener("click", (e) => { if (e.target.closest("[data-rm]")) e.target.closest(".preset-row").remove(); });
  dlg.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const list = [...rows.querySelectorAll(".preset-row")].map((r) => ({
      title: r.querySelector('[data-k="title"]').value.trim(), minutes: Number(r.querySelector('[data-k="minutes"]').value || 60),
      area: r.querySelector('[data-k="area"]').value || null })).filter((p) => p.title);
    try {
      await api.put("/schedule/presets", { presets: list });
      dlg.close();
      toast("Common blocks saved");
      onChange();
    } catch (err) { showError(dlg.querySelector("form"), err); }
  });
}
