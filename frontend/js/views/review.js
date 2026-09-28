// Weekly review: look back at the week across the app, reflect, and pick
// next week's priorities (which can become tasks with one click).
import { api } from "../api.js";
import { icon } from "../icons.js";
import { areaOptions, esc, fmtDate, toast } from "../ui.js";

let week = null;
const money = (n) => (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function shift(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const short = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function statCard(title, value, sub) {
  return `<div class="card fin-kpi" style="--c:var(--accent)"><div class="eyebrow">${title}</div><div class="fin-kpi-value">${value}</div>${sub ? `<div class="fin-kpi-sub">${sub}</div>` : ""}</div>`;
}

export async function render(view) {
  const d = await api.get(`/review${week ? `?week=${week}` : ""}`);
  const r = d.review, s = d.stats;
  week = r.week_start;
  const routinesDone = s.routines.reduce((a, x) => a + Math.min(x.done, x.planned), 0);
  const routinesPlanned = s.routines.reduce((a, x) => a + x.planned, 0);
  const pr = [...r.priorities];
  while (pr.length < 3) pr.push("");

  view.innerHTML = `<div id="rv-root">
    <div class="page-head"><div>
      <div class="eyebrow">Plan · every Sunday</div>
      <h1>Weekly review</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:${r.completed_at ? "var(--success)" : "var(--warning)"}"></span>${r.completed_at ? "<b>done</b> for this week" : "not done yet"}</span>
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span>${esc(short(s.start))} – ${esc(short(s.end))}</span>
      </div></div>
    </div>
    <div class="sched-nav card">
      <button class="icon-btn" id="rv-prev" aria-label="Previous week">‹</button>
      <div class="sched-day"><b>Week of ${esc(short(s.start))}</b>${d.is_current ? " · the week to review" : ""}</div>
      <button class="icon-btn" id="rv-next" aria-label="Next week">›</button>
    </div>
    <div class="fin-kpis rv-kpis">
      ${statCard("Tasks done", s.tasks_done.length, s.tasks_overdue.length ? `${s.tasks_overdue.length} overdue` : "none overdue")}
      ${statCard("Routines", routinesPlanned ? `${Math.round((100 * routinesDone) / routinesPlanned)}%` : "—", `${routinesDone}/${routinesPlanned} check-ins`)}
      ${statCard("Focus", `${Math.round(s.focus_minutes / 60 * 10) / 10}<small> h</small>`, s.schedule.total ? `${s.schedule.done}/${s.schedule.total} blocks done` : "")}
      ${statCard("Fun things", s.fun.length, s.cpa ? `${s.cpa.hours} h CPA study` : "")}
    </div>
    <div class="rv-cols">
      <div>
        <section class="card fin-card">
          <header><h2>Routines</h2></header>
          ${s.routines.length ? `<ul class="fin-list">${s.routines.map((x) => `
            <li><div><div class="fin-li-title">${esc(x.title)}</div></div>
              <div class="rv-meter"><span style="width:${x.planned ? Math.min(100, (100 * x.done) / x.planned) : 0}%"></span></div>
              <b class="rv-count">${x.done}/${x.planned}</b></li>`).join("")}</ul>` : `<div class="empty">No routines.</div>`}
        </section>
        <section class="card fin-card" style="margin-top:14px">
          <header><h2>Done this week</h2><span class="eyebrow">${s.tasks_done.length} tasks</span></header>
          ${s.tasks_done.length ? `<ul class="fin-list">${s.tasks_done.map((t) => `<li><div><div class="fin-li-title">✓ ${esc(t.title)}</div></div></li>`).join("")}</ul>`
            : `<div class="empty">No tasks completed.</div>`}
          ${s.goal_notes.length ? `<h3 class="rv-h3">Goal progress</h3><ul class="fin-list">${s.goal_notes.map((n) =>
            `<li><div><div class="fin-li-title">${esc(n.title)}</div><div class="fin-li-sub">${esc(n.text)}</div></div></li>`).join("")}</ul>` : ""}
          ${s.tasks_overdue.length ? `<h3 class="rv-h3">Still overdue</h3><ul class="fin-list">${s.tasks_overdue.map((t) =>
            `<li><div><div class="fin-li-title">${esc(t.title)}</div><div class="fin-li-sub">due ${esc(fmtDate(t.due_date))}</div></div></li>`).join("")}</ul>` : ""}
        </section>
        ${s.money || s.people.length || s.cpa ? `<section class="card fin-card" style="margin-top:14px">
          <header><h2>Around the app</h2></header>
          <ul class="fin-list">
            ${s.money ? `<li><div><div class="fin-li-title">💵 ${money(s.money.income)} in · ${money(s.money.spending)} spent</div>
              <div class="fin-li-sub">${s.money.top.map((c) => `${esc(c.category)} ${money(c.spent)}`).join(" · ")}</div></div></li>` : ""}
            ${s.cpa ? `<li><div><div class="fin-li-title">📚 ${s.cpa.hours} h of CPA study</div>
              ${s.cpa.scores.length ? `<div class="fin-li-sub">Practice: ${s.cpa.scores.map((x) => `${esc(x.section)} ${x.score}%`).join(", ")}</div>` : ""}</div></li>` : ""}
            ${s.people.length ? `<li><div><div class="fin-li-title">👋 Stayed in touch with ${[...new Set(s.people.map((p) => p.name))].map(esc).join(", ")}</div></div></li>` : ""}
          </ul></section>` : ""}
      </div>
      <div>
        ${d.last_priorities.length ? `<section class="card fin-card"><header><h2>Last week's priorities</h2></header>
          <ul class="fin-list">${d.last_priorities.map((p) => `<li><div><div class="fin-li-title">${esc(p)}</div></div></li>`).join("")}</ul></section>` : ""}
        <form class="card fin-card rv-form" id="rv-form" style="${d.last_priorities.length ? "margin-top:14px" : ""}">
          <header><h2>Reflect</h2></header>
          <label class="field"><span>What went well?</span><textarea name="went_well">${esc(r.went_well)}</textarea></label>
          <label class="field"><span>What should change?</span><textarea name="improve">${esc(r.improve)}</textarea></label>
          <div class="field"><span>Top priorities for next week</span>
            <div id="rv-prios">${pr.map((p, i) => `<input type="text" value="${esc(p)}" placeholder="Priority ${i + 1}" data-prio>`).join("")}</div></div>
          <label class="field"><span>Notes</span><textarea name="notes">${esc(r.notes)}</textarea></label>
          <div class="btn-row">
            <button class="btn primary" type="submit">${r.completed_at ? "Save" : `${icon("tick")} Save &amp; finish review`}</button>
            <button class="btn" type="button" id="rv-tasks">Make priorities into tasks</button>
            <select id="rv-area" aria-label="Area for the tasks">${areaOptions("work")}</select>
          </div>
        </form>
        <section class="card fin-card" style="margin-top:14px">
          <header><h2>${icon("sparkle")} AI summary</h2>
            <button class="btn small" id="rv-ai">${r.ai_summary ? "Redo" : "Summarize my week"}</button></header>
          ${r.ai_summary ? `<div class="rv-summary">${esc(r.ai_summary).replace(/\n/g, "<br>")}</div>`
            : `<p class="muted small" style="margin:0">Claude reads this week's numbers (and your reflections, if you've written them) and writes a short summary with suggested priorities. Uses one AI request.</p>`}
        </section>
      </div>
    </div></div>`;

  const root = view.querySelector("#rv-root");
  const refresh = () => render(view);
  root.querySelector("#rv-prev").onclick = () => { week = shift(week, -7); refresh(); };
  root.querySelector("#rv-next").onclick = () => { week = shift(week, 7); refresh(); };
  const form = root.querySelector("#rv-form");
  const body = (extra = {}) => ({ went_well: form.went_well.value, improve: form.improve.value, notes: form.notes.value,
    priorities: [...form.querySelectorAll("[data-prio]")].map((i) => i.value).filter(Boolean), ...extra });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api.put(`/review/${week}`, body({ completed: true }));
    toast(r.completed_at ? "Saved" : "Review done ✓ Have a great week");
    refresh();
  });
  root.querySelector("#rv-tasks").onclick = async () => {
    await api.put(`/review/${week}`, body());
    const res = await api.post(`/review/${week}/tasks`, { area: root.querySelector("#rv-area").value });
    toast(res.created.length ? `${res.created.length} task${res.created.length === 1 ? "" : "s"} added for next week` : "Those are already tasks");
    refresh();
  };
  root.querySelector("#rv-ai").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `${icon("loader")} Writing…`;
    try {
      await api.put(`/review/${week}`, body());
      await api.post(`/review/${week}/summary`);
      refresh();
    } catch (err) { toast(err.message, 7000); btn.disabled = false; btn.textContent = "Summarize my week"; }
  };
}
