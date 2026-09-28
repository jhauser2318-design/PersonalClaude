// Routines page: every recurring task with its streak, stats and history.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { bindRoutines, openRoutineEditor, routineCard } from "../routines.js";
import { areaChips } from "./goals.js";

let areaFilter = "";

export async function render(view) {
  const habits = await api.get(`/habits${areaFilter ? `?area=${areaFilter}` : ""}`);
  const active = habits.filter((h) => h.active);
  const dueToday = active.filter((h) => h.due_today);
  const doneToday = dueToday.filter((h) => h.done_today).length;
  const paused = habits.filter((h) => !h.active);
  const best = Math.max(0, ...active.map((h) => h.streak));
  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Recurring · tracked daily</div>
      <h1>Routines</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${doneToday}/${dueToday.length}</b> done today</span>
        <span class="status-chip"><span class="dot" style="--c:var(--warning)"></span>longest streak <b>${best}</b></span>
        <span class="status-chip"><span class="dot"></span><b>${active.length}</b> active</span>
      </div></div>
      <button class="btn primary" id="new-routine">${icon("plus")} New routine</button></div>
    <div class="toolbar">${areaChips(areaFilter)}</div>
    <div id="routines">
      ${active.length ? `<div class="routine-grid">${active.map(routineCard).join("")}</div>`
        : `<div class="card empty">No routines yet. Click “New routine”, or type e.g. “Set up a daily CPA study routine, 2 hours a day”.</div>`}
      ${paused.length ? `<h2 class="section">Paused <span class="count">${paused.length}</span><span class="line"></span></h2>
        <div class="routine-grid">${paused.map(routineCard).join("")}</div>` : ""}
    </div>`;
  view.querySelector(".chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    areaFilter = chip.dataset.area;
    render(view);
  });
  view.querySelector("#new-routine").addEventListener("click", () => openRoutineEditor({ area: areaFilter || undefined }));
  bindRoutines(view.querySelector("#routines"), habits);
}
