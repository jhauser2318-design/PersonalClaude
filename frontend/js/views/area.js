// One life area (e.g. Health): its progress, goals and tasks on one page.
import { api } from "../api.js";
import { bindGoals, bindTasks, goalGrid, openGoalEditor, openTaskEditor, taskList } from "../components.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { bindRoutines, openRoutineEditor, routineList } from "../routines.js";
import { esc, ring } from "../ui.js";

export async function render(view, areaId) {
  const area = state.areaById[areaId];
  if (!area) { view.innerHTML = `<div class="empty">Unknown area.</div>`; return; }
  const [dash, goals, tasks, habits] = await Promise.all([
    api.get("/dashboard"), api.get(`/goals?area=${areaId}`), api.get(`/tasks?area=${areaId}`),
    api.get(`/habits?area=${areaId}`),
  ]);
  const routines = habits.filter((h) => h.active);
  const s = dash.areas.find((a) => a.id === areaId);
  const open = tasks.filter((t) => !t.done);
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Life area</div><h1>${esc(area.name)}</h1></div>
      <div class="btn-row">
        <button class="btn" id="new-routine">${icon("repeat")} Routine</button>
        <button class="btn" id="new-task">${icon("plus")} Task</button>
        <button class="btn primary" id="new-goal">${icon("plus")} Goal</button></div></div>
    <div class="card area-hero" style="--area:${area.color}">
      ${ring(s.progress, areaId, 96)}
      <div class="ah-stats">
        <div><b>${s.goal_count}</b>goals</div><div><b>${s.goals_done}</b>achieved</div>
        <div><b>${s.open_tasks}</b>open tasks</div>
        <div><b>${routines.filter((h) => h.done_today).length}/${routines.filter((h) => h.due_today).length}</b>routines today</div>
      </div>
    </div>
    ${areaId === "education" ? `<a class="card area-link" href="#/cpa" style="--area:${area.color}">${icon("book")}
      <div><b>CPA Exam Planner</b><div class="muted small">Exam dates, study hours vs plan, practice scores, credit window</div></div><span>→</span></a>` : ""}
    ${areaId === "health" ? `<div class="area-links"><a class="card area-link" href="#/workouts" style="--area:${area.color}">${icon("dumbbell")}
      <div><b>Workouts</b><div class="muted small">Sessions, records, body weight</div></div><span>→</span></a>
      <a class="card area-link" href="#/meals" style="--area:${area.color}">${icon("utensils")}
      <div><b>Meals</b><div class="muted small">This week's plan and recipes</div></div><span>→</span></a></div>` : ""}
    ${areaId === "social" ? `<a class="card area-link" href="#/people" style="--area:${area.color}">${icon("users")}
      <div><b>People</b><div class="muted small">Birthdays and staying in touch</div></div><span>→</span></a>` : ""}
    <h2 class="section">Goals <span class="count">${goals.length}</span><span class="line"></span></h2>
    <div id="area-goals">${goalGrid(goals, `No ${area.name.toLowerCase()} goals yet.`)}</div>
    <h2 class="section">Routines <span class="count">${routines.length}</span><span class="line"></span><a href="#/routines">Details →</a></h2>
    <div id="area-routines">${routineList(routines, `No ${area.name.toLowerCase()} routines yet.`)}</div>
    <h2 class="section">Open tasks <span class="count">${open.length}</span><span class="line"></span></h2>
    <div id="area-tasks">${taskList(open, { showArea: false, empty: `No open ${area.name.toLowerCase()} tasks.` })}</div>`;
  view.querySelector("#new-goal").addEventListener("click", () => openGoalEditor({ area: areaId }));
  view.querySelector("#new-task").addEventListener("click", () => openTaskEditor({ area: areaId }));
  bindGoals(view.querySelector("#area-goals"));
  bindTasks(view.querySelector("#area-tasks"), open);
  bindRoutines(view.querySelector("#area-routines"), routines);
  view.querySelector("#new-routine").addEventListener("click", () => openRoutineEditor({ area: areaId }));
}
