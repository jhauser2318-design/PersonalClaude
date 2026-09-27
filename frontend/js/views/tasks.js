// Tasks screen: all tasks grouped by when they're due.
import { api } from "../api.js";
import { bindTasks, openTaskEditor, taskList } from "../components.js";
import { icon } from "../icons.js";
import { daysFromToday } from "../ui.js";
import { areaChips } from "./goals.js";

let areaFilter = "";
let showDone = false;

function group(tasks) {
  const groups = { Overdue: [], Today: [], "Next 7 days": [], Later: [], "No due date": [] };
  for (const t of tasks) {
    if (!t.due_date) groups["No due date"].push(t);
    else {
      const d = daysFromToday(t.due_date);
      if (d < 0) groups.Overdue.push(t);
      else if (d === 0) groups.Today.push(t);
      else if (d <= 7) groups["Next 7 days"].push(t);
      else groups.Later.push(t);
    }
  }
  return groups;
}

export async function render(view) {
  const tasks = await api.get(`/tasks${areaFilter ? `?area=${areaFilter}` : ""}`);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const groups = group(open);
  view.innerHTML = `
    <div class="page-head"><div><h1>Tasks</h1>
      <p class="sub">${open.length} open · ${done.length} done</p></div>
      <button class="btn primary" id="new-task">${icon("plus")} New task</button></div>
    <div class="toolbar">${areaChips(areaFilter)}
      <label style="display:flex;gap:6px;align-items:center;font-size:14px;color:var(--text-2)">
        <input type="checkbox" id="show-done" ${showDone ? "checked" : ""}> Show completed</label></div>
    <div id="tasks">
      ${open.length ? "" : `<div class="card empty">No open tasks. Add one, or type e.g. “Add a work task to email Sarah by Friday”.</div>`}
      ${Object.entries(groups).filter(([, list]) => list.length).map(([name, list], i) => `
        <h2 class="section" style="${i === 0 ? "margin-top:0" : ""}${name === "Overdue" ? ";color:var(--danger)" : ""}">${name} <span class="count">${list.length}</span></h2>
        ${taskList(list)}`).join("")}
      ${showDone && done.length ? `<h2 class="section">Completed <span class="count">${done.length}</span></h2>${taskList(done)}` : ""}
    </div>`;
  view.querySelector(".chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    areaFilter = chip.dataset.area;
    render(view);
  });
  view.querySelector("#show-done").addEventListener("change", (e) => { showDone = e.target.checked; render(view); });
  view.querySelector("#new-task").addEventListener("click", () => openTaskEditor({ area: areaFilter || undefined }));
  bindTasks(view.querySelector("#tasks"), tasks);
}
