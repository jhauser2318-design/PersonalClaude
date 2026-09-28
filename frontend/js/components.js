// Goal cards, task rows, and the add/edit/detail dialogs.
// Every screen uses these, so goals and tasks look and behave the same everywhere.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import {
  PRIORITY_LABELS, STATUS_LABELS, areaOptions, areaStyle, areaTag, dueState, esc,
  fmtDate, fmtDateTime, openDialog, progressBar, showError, toast,
} from "./ui.js";

// ===========================================================================
// Tasks
// ===========================================================================

export function taskRow(t, { showGoal = true, showArea = true } = {}) {
  const due = dueState(t.due_date, t.done);
  const meta = [
    showArea ? areaTag(t.area) : "",
    t.due_date ? `<span class="due ${due}">${due === "overdue" ? "Overdue · " : ""}${esc(fmtDate(t.due_date))}</span>` : "",
    t.priority !== "low" && !t.done ? `<span class="pill ${t.priority}">${PRIORITY_LABELS[t.priority]}</span>` : "",
    showGoal && t.goal_title ? `<span>↳ ${esc(t.goal_title)}</span>` : "",
    t.remind_at && !t.done ? `<span title="Reminder">🔔 ${esc(fmtDateTime(t.remind_at))}</span>` : "",
  ].filter(Boolean).join("");
  return `
    <li class="task ${t.done ? "done" : ""} ${due === "overdue" ? "is-overdue" : ""}" data-task-id="${t.id}" style="${areaStyle(t.area)}">
      <input type="checkbox" class="check" ${t.done ? "checked" : ""} aria-label="Mark “${esc(t.title)}” as done">
      <div class="t-main" role="button" tabindex="0">
        <div class="t-title">${esc(t.title)}</div>
        ${meta ? `<div class="t-meta">${meta}</div>` : ""}
      </div>
      <div class="t-actions">
        <button class="icon-btn" data-edit aria-label="Edit task">${icon("edit")}</button>
        <button class="icon-btn danger" data-delete aria-label="Delete task">${icon("trash")}</button>
      </div>
    </li>`;
}

export function taskList(tasks, opts) {
  if (!tasks.length) return `<div class="card empty">${esc(opts?.empty || "Nothing here.")}</div>`;
  return `<ul class="task-list card">${tasks.map((t) => taskRow(t, opts)).join("")}</ul>`;
}

// Hooks up clicks inside `container` for any task rows it contains.
export function bindTasks(container, tasks, onChange = () => state.refresh()) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  container.addEventListener("change", async (e) => {
    if (!e.target.matches(".task .check")) return;
    const id = e.target.closest(".task").dataset.taskId;
    try {
      await api.patch(`/tasks/${id}`, { done: e.target.checked });
      if (e.target.checked) toast("Nice! Task done ✓");
      onChange();
    } catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
  });
  const open = (e) => {
    const row = e.target.closest(".task");
    if (!row || e.target.matches(".check")) return;
    const task = byId[row.dataset.taskId];
    if (!task) return;
    if (e.target.closest("[data-delete]")) return deleteTask(task, onChange);
    if (e.target.closest("[data-edit]") || e.target.closest(".t-main")) openTaskEditor(task, onChange);
  };
  container.addEventListener("click", open);
  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".t-main")) open(e);
  });
}

async function deleteTask(task, onChange) {
  if (!confirm(`Delete the task “${task.title}”?`)) return;
  await api.del(`/tasks/${task.id}`);
  toast("Task deleted");
  onChange();
}

export async function openTaskEditor(task = {}, onChange = () => state.refresh()) {
  const isNew = !task.id;
  const goals = await api.get("/goals");
  const goalOpts = goals.map((g) =>
    `<option value="${g.id}" data-area="${g.area}" ${g.id === task.goal_id ? "selected" : ""}>${esc(g.title)} (${esc(state.areaById[g.area]?.name)})</option>`).join("");
  const dlg = openDialog({
    title: isNew ? "New task" : "Edit task",
    style: areaStyle(task.area || state.areas[0].id),
    body: `
      <form id="task-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Title</span>
          <input type="text" name="title" required value="${esc(task.title)}" placeholder="e.g. Email Sarah about the budget"></label>
        <div class="row">
          <label class="field"><span>Area</span><select name="area">${areaOptions(task.area)}</select></label>
          <label class="field"><span>Priority</span><select name="priority">
            ${["low", "medium", "high"].map((p) => `<option value="${p}" ${p === (task.priority || "medium") ? "selected" : ""}>${PRIORITY_LABELS[p]}</option>`).join("")}
          </select></label>
        </div>
        <div class="row">
          <label class="field"><span>Due date (optional)</span>
            <input type="date" name="due_date" value="${esc(task.due_date || "")}"></label>
          <label class="field"><span>Part of goal (optional)</span>
            <select name="goal_id"><option value="">— None —</option>${goalOpts}</select></label>
        </div>
        <label class="field"><span>Remind me (optional) · a notification on this computer</span>
          <input type="datetime-local" name="remind_at" value="${esc(task.remind_at || "")}"></label>
        ${isNew ? "" : `<label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="done" ${task.done ? "checked" : ""}> <span>Done</span></label>`}
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="task-form">${isNew ? "Add task" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  // Choosing a goal also picks that goal's area.
  form.goal_id.addEventListener("change", () => {
    const area = form.goal_id.selectedOptions[0]?.dataset.area;
    if (area) form.area.value = area;
  });
  form.area.addEventListener("change", () => dlg.setAttribute("style", areaStyle(form.area.value)));
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    dlg.close();
    await deleteTask(task, onChange);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: form.title.value.trim(),
      area: form.area.value,
      priority: form.priority.value,
      due_date: form.due_date.value || null,
      goal_id: form.goal_id.value ? Number(form.goal_id.value) : null,
    };
    const remind = form.remind_at.value || null;
    if (isNew ? remind : remind !== (task.remind_at || null)) body.remind_at = remind;
    if (!isNew) body.done = form.done.checked;
    try {
      if (isNew) await api.post("/tasks", body);
      else await api.patch(`/tasks/${task.id}`, body);
      dlg.close();
      toast(isNew ? "Task added" : "Task saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}

// ===========================================================================
// Goals
// ===========================================================================

export function goalCard(g) {
  const overdue = dueState(g.target_date, g.status === "done" || g.status === "paused") === "overdue";
  const meta = [
    g.target_date ? `<span class="due ${overdue ? "overdue" : ""}">${overdue ? "Overdue · " : "🎯 "}${esc(fmtDate(g.target_date))}</span>` : "",
    g.task_count ? `<span>☑ ${g.tasks_done}/${g.task_count} tasks</span>` : "",
    g.last_note_at ? `<span>Updated ${esc(fmtDate(g.last_note_at.slice(0, 10)))}</span>` : "",
  ].filter(Boolean).join("");
  return `
    <article class="card goal st-${g.status}" data-goal-id="${g.id}" style="${areaStyle(g.area)}" tabindex="0">
      <div class="g-top">
        <h3 class="g-title">${esc(g.title)}</h3>
        <span class="pill ${g.status}">${STATUS_LABELS[g.status]}</span>
      </div>
      ${g.description ? `<p class="g-desc">${esc(g.description)}</p>` : ""}
      <div class="g-prog">${progressBar(g.progress, g.area)}<span>${g.progress}%</span></div>
      <div class="g-meta">${areaTag(g.area)}${meta}</div>
    </article>`;
}

export function goalGrid(goals, emptyText = "No goals yet.") {
  if (!goals.length) return `<div class="card empty">${esc(emptyText)}</div>`;
  return `<div class="goal-grid">${goals.map(goalCard).join("")}</div>`;
}

export function bindGoals(container) {
  const open = (e) => {
    const card = e.target.closest(".goal");
    if (card) openGoalDetail(Number(card.dataset.goalId));
  };
  container.addEventListener("click", open);
  container.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
}

export function openGoalEditor(goal = {}, onSaved) {
  const isNew = !goal.id;
  const area = goal.area || state.areas[0].id;
  const progress = goal.progress ?? 0;
  const dlg = openDialog({
    title: isNew ? "New goal" : "Edit goal",
    style: areaStyle(area),
    body: `
      <form id="goal-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Title</span>
          <input type="text" name="title" required value="${esc(goal.title)}" placeholder="e.g. Run a 5K"></label>
        <label class="field"><span>Description</span>
          <textarea name="description" placeholder="What does success look like?">${esc(goal.description)}</textarea></label>
        <div class="row">
          <label class="field"><span>Area</span><select name="area">${areaOptions(area)}</select></label>
          <label class="field"><span>Target date (optional)</span>
            <input type="date" name="target_date" value="${esc(goal.target_date || "")}"></label>
        </div>
        <div class="row">
          <label class="field"><span>Status</span><select name="status">
            ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${k === (goal.status || "not_started") ? "selected" : ""}>${v}</option>`).join("")}
          </select></label>
          <label class="field"><span>Progress</span>
            <div class="range-row"><input type="range" name="progress" min="0" max="100" step="5" value="${progress}">
            <output>${progress}%</output></div></label>
        </div>
      </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="goal-form">${isNew ? "Create goal" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.progress.addEventListener("input", () => { form.querySelector("output").textContent = `${form.progress.value}%`; });
  form.area.addEventListener("change", () => dlg.setAttribute("style", areaStyle(form.area.value)));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      area: form.area.value,
      target_date: form.target_date.value || null,
      status: form.status.value,
      progress: Number(form.progress.value),
    };
    try {
      const saved = isNew ? await api.post("/goals", body) : await api.patch(`/goals/${goal.id}`, body);
      dlg.close();
      toast(isNew ? "Goal created" : "Goal saved");
      state.refresh();
      if (onSaved) onSaved(saved);
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}

// The goal "detail" dialog: progress slider, notes history, linked tasks.
export async function openGoalDetail(goalId) {
  const dlg = openDialog({ title: "Loading…", body: "" });

  async function render() {
    let goal, tasks;
    try {
      [goal, tasks] = await Promise.all([api.get(`/goals/${goalId}`), api.get(`/tasks?goal_id=${goalId}`)]);
    } catch (err) {
      dlg.querySelector(".dlg-body").innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
      return;
    }
    dlg.setAttribute("style", `${areaStyle(goal.area)};width:min(640px, calc(100vw - 24px))`);
    dlg.querySelector(".dlg-head h2").textContent = goal.title;
    const overdue = dueState(goal.target_date, goal.status === "done" || goal.status === "paused") === "overdue";
    dlg.querySelector(".dlg-body").innerHTML = `
      <div class="detail-meta">
        ${areaTag(goal.area)} <span class="pill ${goal.status}">${STATUS_LABELS[goal.status]}</span>
        ${goal.target_date ? `<span class="due ${overdue ? "overdue" : ""}" style="font-size:13px">${overdue ? "Overdue · target" : "Target"} ${esc(fmtDate(goal.target_date))}</span>` : ""}
      </div>
      ${goal.description ? `<p class="detail-desc">${esc(goal.description)}</p>` : ""}
      <label class="field"><span>Progress</span>
        <div class="range-row"><input type="range" id="gd-progress" min="0" max="100" step="5" value="${goal.progress}">
        <output>${goal.progress}%</output></div></label>

      <div>
        <h2 class="section" style="margin:4px 0 10px">Tasks <span class="count">${tasks.filter((t) => t.done).length}/${tasks.length}</span>
          <button class="btn small" id="gd-add-task" style="margin-left:auto">${icon("plus")} Add task</button></h2>
        <div id="gd-tasks">${taskList(tasks, { showGoal: false, showArea: false, empty: "No tasks linked to this goal yet." })}</div>
      </div>

      <div>
        <h2 class="section" style="margin:4px 0 10px">Updates & notes <span class="count">${goal.notes.length}</span></h2>
        <form class="note-form" id="gd-note-form">
          <input type="text" name="text" placeholder="What happened? e.g. Ran 3 km today" aria-label="New note">
          <button class="btn primary" type="submit">Add</button>
        </form>
        <ul class="timeline" style="margin-top:14px">
          ${goal.notes.map((n) => `
            <li><div class="n-row"><div class="n-body">
              <div class="n-when">${esc(fmtDateTime(n.created_at))}${n.source === "command" ? " · via command bar" : ""}</div>
              <p class="n-text">${esc(n.text)}</p></div>
              <button class="icon-btn danger" data-del-note="${n.id}" aria-label="Delete note">${icon("trash")}</button></div></li>`).join("")
            || `<li style="padding-left:0" class="empty">No updates yet.</li>`}
        </ul>
      </div>`;

    let foot = dlg.querySelector(".dlg-foot");
    if (!foot) {
      foot = document.createElement("div");
      foot.className = "dlg-foot";
      dlg.appendChild(foot);
    }
    foot.innerHTML = `<button class="btn danger" data-delete-goal>${icon("trash")} Delete goal</button>
      <div class="right"><button class="btn" data-edit-goal>${icon("edit")} Edit</button>
      <button class="btn primary" data-close>Done</button></div>`;

    const slider = dlg.querySelector("#gd-progress");
    slider.addEventListener("input", () => { slider.nextElementSibling.textContent = `${slider.value}%`; });
    slider.addEventListener("change", async () => {
      await api.patch(`/goals/${goalId}`, { progress: Number(slider.value) });
      toast("Progress updated");
      state.refresh();
      render();
    });
    dlg.querySelector("#gd-note-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;
      await api.post(`/goals/${goalId}/notes`, { text });
      state.refresh();
      render();
    });
    dlg.querySelectorAll("[data-del-note]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this note?")) return;
      await api.del(`/notes/${b.dataset.delNote}`);
      state.refresh();
      render();
    }));
    const tasksBox = dlg.querySelector("#gd-tasks");
    bindTasks(tasksBox, tasks, () => { state.refresh(); render(); });
    dlg.querySelector("#gd-add-task").addEventListener("click", () =>
      openTaskEditor({ goal_id: goal.id, area: goal.area }, () => { state.refresh(); render(); }));
    foot.querySelector("[data-edit-goal]").onclick = () => { dlg.close(); openGoalEditor(goal, () => openGoalDetail(goalId)); };
    foot.querySelector("[data-delete-goal]").onclick = async () => {
      if (!confirm(`Delete the goal “${goal.title}” and all its notes? Its tasks will be kept but unlinked.`)) return;
      await api.del(`/goals/${goalId}`);
      dlg.close();
      toast("Goal deleted");
      state.refresh();
    };
  }
  await render();
}
