// Home screen: progress per area, what's due, what's overdue, recent updates.
import { api } from "../api.js";
import { bindGoals, bindTasks, goalGrid, taskList } from "../components.js";
import { areaStyle, areaTag, esc, fmtDateTime, progressBar } from "../ui.js";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export async function render(view) {
  const d = await api.get("/dashboard");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const overdueCount = d.overdue_tasks.length + d.overdue_goals.length;
  const allTasks = [...d.overdue_tasks, ...d.due_today, ...d.due_this_week];

  view.innerHTML = `
    <div class="page-head"><div>
      <h1>${greeting()}</h1>
      <p class="sub">${esc(today)} · ${d.due_today.length} due today${overdueCount ? ` · <span class="due overdue">${overdueCount} overdue</span>` : ""}</p>
    </div></div>

    <div class="area-grid">
      ${d.areas.map((a) => `
        <a class="card area-card" href="#/area/${a.id}" style="--area:${a.color}">
          <div class="ac-head"><span class="ac-name">${esc(a.icon)} ${esc(a.name)}</span><span class="ac-pct">${a.progress}%</span></div>
          ${progressBar(a.progress, a.id)}
          <div class="ac-meta">${a.goal_count} goal${a.goal_count === 1 ? "" : "s"} · ${a.open_tasks} open task${a.open_tasks === 1 ? "" : "s"}</div>
        </a>`).join("")}
    </div>

    <div class="dash-cols">
      <div id="dash-tasks">
        ${overdueCount ? `
          <div class="card attention" style="padding:14px;margin-top:28px">
            <h2 class="section">⚠ Overdue <span class="count">${overdueCount}</span></h2>
            ${d.overdue_tasks.length ? taskList(d.overdue_tasks) : ""}
            ${d.overdue_goals.length ? `<div style="margin-top:12px">${goalGrid(d.overdue_goals)}</div>` : ""}
          </div>` : ""}
        <h2 class="section">Due today <span class="count">${d.due_today.length}</span></h2>
        ${taskList(d.due_today, { empty: "Nothing due today. 🎉" })}
        <h2 class="section">Next 7 days <span class="count">${d.due_this_week.length}</span></h2>
        ${taskList(d.due_this_week, { empty: "Nothing scheduled this week." })}
      </div>

      <div>
        <h2 class="section">Recent updates</h2>
        <div class="card" style="padding:16px">
          <ul class="timeline">
            ${d.recent_notes.map((n) => `
              <li style="${areaStyle(n.area)}">
                <div class="n-when">${esc(fmtDateTime(n.created_at))}</div>
                <div class="n-goal">${areaTag(n.area)} ${esc(n.goal_title)}</div>
                <p class="n-text">${esc(n.text)}</p>
              </li>`).join("") || `<li class="empty" style="padding-left:0">No updates yet. Try typing “Went to the gym today” in the bar above.</li>`}
          </ul>
        </div>
        ${d.recently_done.length ? `
          <h2 class="section">Recently completed</h2>
          ${taskList(d.recently_done)}` : ""}
      </div>
    </div>`;

  bindTasks(view, [...allTasks, ...d.recently_done]);
  bindGoals(view.querySelector(".attention") || document.createElement("div"));
}
