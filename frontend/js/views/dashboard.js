// Home screen: the "command center". Area progress, today's routines,
// what's due, what's overdue, and recent activity.
import { api } from "../api.js";
import { bindGoals, bindTasks, goalGrid, taskList } from "../components.js";
import { bindRoutines, routineList } from "../routines.js";
import { eventTime, openEventEditor } from "./calendar.js";
import { areaStyle, areaTag, esc, fmtDateTime, ring } from "../ui.js";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export async function render(view) {
  const [d, habits, cal] = await Promise.all([
    api.get("/dashboard"), api.get("/habits"),
    api.get("/calendar/events?days=1").catch(() => ({ connected: false, events: [], failed: true })),
  ]);
  const now = new Date();
  const stamp = now.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const overdueCount = d.overdue_tasks.length + d.overdue_goals.length;
  const todays = habits.filter((h) => h.due_today);
  const routinesLeft = todays.filter((h) => !h.done_today).length;
  const allTasks = [...d.overdue_tasks, ...d.due_today, ...d.due_this_week];

  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Command center · ${esc(stamp)}</div>
      <h1>${greeting()}.</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span><b>${routinesLeft}</b> routine${routinesLeft === 1 ? "" : "s"} left today</span>
        <span class="status-chip"><span class="dot" style="--c:var(--warning)"></span><b>${d.due_today.length}</b> task${d.due_today.length === 1 ? "" : "s"} due today</span>
        ${overdueCount ? `<span class="status-chip"><span class="dot" style="--c:var(--danger)"></span><b>${overdueCount}</b> overdue</span>` : ""}
        ${cal.connected ? `<span class="status-chip"><span class="dot" style="--c:#c084fc"></span><b>${cal.events.length}</b> event${cal.events.length === 1 ? "" : "s"} today</span>` : ""}
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${d.due_this_week.length}</b> this week</span>
      </div>
    </div></div>

    <div class="area-grid">
      ${d.areas.map((a) => `
        <a class="card area-card" href="#/area/${a.id}" style="--area:${a.color}">
          ${ring(a.progress, a.id, 62)}
          <div>
            <div class="ac-name">${esc(a.name)}</div>
            <div class="ac-meta">${a.goal_count} goal${a.goal_count === 1 ? "" : "s"} · ${a.open_tasks} open</div>
          </div>
        </a>`).join("")}
    </div>

    <div class="dash-cols">
      <div>
        ${overdueCount ? `
          <div class="card attention" id="dash-overdue">
            <h2 class="section">⚠ Overdue <span class="count">${overdueCount}</span><span class="line"></span></h2>
            ${d.overdue_tasks.length ? taskList(d.overdue_tasks) : ""}
            ${d.overdue_goals.length ? `<div style="margin-top:12px">${goalGrid(d.overdue_goals)}</div>` : ""}
          </div>` : ""}
        <h2 class="section">Today's schedule <span class="count">${cal.events.length}</span><span class="line"></span><a href="#/calendar">Calendar →</a></h2>
        <div id="dash-schedule">${!cal.connected
          ? `<div class="card empty">${cal.failed ? "Couldn't reach Google Calendar right now." : `Google Calendar isn't connected. <a href="#/calendar">Connect it →</a>`}</div>`
          : cal.events.length
            ? `<div class="card schedule">${cal.events.map((e) => `
                <button class="event ${e.all_day ? "all-day" : ""}" data-event-id="${esc(e.id)}">
                  <span class="ev-time">${esc(eventTime(e))}</span>
                  <span class="ev-title">${esc(e.title)}</span>
                  ${e.location ? `<span class="ev-loc">${esc(e.location)}</span>` : ""}
                </button>`).join("")}</div>`
            : `<div class="card empty">Nothing on the calendar today.</div>`}</div>
        <h2 class="section">Today's routines <span class="count">${todays.length - routinesLeft}/${todays.length}</span><span class="line"></span><a href="#/routines">All →</a></h2>
        <div id="dash-routines">${routineList(todays, "No routines due today. Add one on the Routines page.")}</div>
        <h2 class="section">Due today <span class="count">${d.due_today.length}</span><span class="line"></span></h2>
        <div id="dash-today">${taskList(d.due_today, { empty: "Nothing due today. 🎉" })}</div>
        <h2 class="section">Next 7 days <span class="count">${d.due_this_week.length}</span><span class="line"></span></h2>
        <div id="dash-week">${taskList(d.due_this_week, { empty: "Nothing scheduled this week." })}</div>
      </div>

      <div>
        <h2 class="section">Activity feed<span class="line"></span></h2>
        <div class="card" style="padding:18px 16px 4px">
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
          <h2 class="section">Recently completed<span class="line"></span></h2>
          <div id="dash-done">${taskList(d.recently_done)}</div>` : ""}
      </div>
    </div>`;

  for (const id of ["#dash-overdue", "#dash-today", "#dash-week", "#dash-done"]) {
    const el = view.querySelector(id);
    if (el) bindTasks(el, [...allTasks, ...d.recently_done]);
  }
  bindRoutines(view.querySelector("#dash-routines"), todays);
  const events = Object.fromEntries(cal.events.map((e) => [e.id, e]));
  view.querySelector("#dash-schedule").addEventListener("click", (e) => {
    const ev = e.target.closest("[data-event-id]");
    if (ev) openEventEditor(events[ev.dataset.eventId], () => render(view));
  });
  const overdue = view.querySelector("#dash-overdue");
  if (overdue) bindGoals(overdue);
}
