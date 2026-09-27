// One life area (e.g. Health): its progress, goals and tasks on one page.
import { api } from "../api.js";
import { bindGoals, bindTasks, goalGrid, openGoalEditor, openTaskEditor, taskList } from "../components.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { esc, progressBar } from "../ui.js";

export async function render(view, areaId) {
  const area = state.areaById[areaId];
  if (!area) { view.innerHTML = `<div class="empty">Unknown area.</div>`; return; }
  const [dash, goals, tasks] = await Promise.all([
    api.get("/dashboard"), api.get(`/goals?area=${areaId}`), api.get(`/tasks?area=${areaId}`),
  ]);
  const s = dash.areas.find((a) => a.id === areaId);
  const open = tasks.filter((t) => !t.done);
  view.innerHTML = `
    <div class="page-head"><div><h1>${esc(area.icon)} ${esc(area.name)}</h1></div>
      <div class="btn-row">
        <button class="btn" id="new-task">${icon("plus")} Task</button>
        <button class="btn primary" id="new-goal">${icon("plus")} Goal</button></div></div>
    <div class="card area-hero" style="--area:${area.color}">
      <div class="ah-pct">${s.progress}%</div>
      <div class="ah-bar">${progressBar(s.progress, areaId)}
        <div style="font-size:13px;color:var(--text-2);margin-top:6px">Average progress of active goals</div></div>
      <div class="ah-stats"><div><b>${s.goal_count}</b>goals</div><div><b>${s.goals_done}</b>achieved</div>
        <div><b>${s.open_tasks}</b>open tasks</div></div>
    </div>
    <h2 class="section">Goals <span class="count">${goals.length}</span></h2>
    <div id="area-goals">${goalGrid(goals, `No ${area.name.toLowerCase()} goals yet.`)}</div>
    <h2 class="section">Open tasks <span class="count">${open.length}</span></h2>
    <div id="area-tasks">${taskList(open, { showArea: false, empty: `No open ${area.name.toLowerCase()} tasks.` })}</div>`;
  view.querySelector("#new-goal").addEventListener("click", () => openGoalEditor({ area: areaId }));
  view.querySelector("#new-task").addEventListener("click", () => openTaskEditor({ area: areaId }));
  bindGoals(view.querySelector("#area-goals"));
  bindTasks(view.querySelector("#area-tasks"), open);
}
