// Workouts: log sessions (sets × reps × weight, or cardio minutes), see
// personal records and body weight. Logging also checks off your gym routine.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";

const setText = (s) => `${esc(s.exercise)} ${s.sets}×${s.reps}${s.weight ? ` @ ${s.weight} lb` : ""}`;

function weeksChart(weeks) {
  const W = 360, H = 120, P = 22;
  const max = Math.max(3, ...weeks.map((w) => w.count));
  const bw = (W - P) / weeks.length;
  return `<svg class="fit-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Workouts per week">
    ${[0, max].map((v) => `<text class="axis-label" x="${P - 6}" y="${H - 16 - (v / max) * (H - 30) + 4}" text-anchor="end">${v}</text>`).join("")}
    ${weeks.map((w, i) => {
      const h = (w.count / max) * (H - 30);
      return `<rect x="${P + i * bw + 3}" y="${H - 16 - h}" width="${bw - 6}" height="${Math.max(h, 1)}" rx="3" fill="var(--series-1)" opacity="${i === weeks.length - 1 ? 1 : 0.7}">
        <title>Week of ${esc(w.week)}: ${w.count}</title></rect>`;
    }).join("")}
    <text class="axis-label" x="${P}" y="${H - 2}">12 weeks ago</text>
    <text class="axis-label" x="${W}" y="${H - 2}" text-anchor="end">this week</text>
  </svg>`;
}

function weightChart(points) {
  if (points.length < 2) return `<div class="empty">Log your weight a few times to see the trend.</div>`;
  const W = 360, H = 120, L = 40, P = 8;
  const vals = points.map((p) => p.weight);
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const t0 = new Date(points[0].date).getTime(), t1 = new Date(points[points.length - 1].date).getTime() || t0 + 1;
  const x = (d) => L + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - P);
  const y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P - 12);
  return `<svg class="fit-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight">
    ${[lo, hi].map((v) => `<text class="axis-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
    <path d="${points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.weight).toFixed(1)}`).join("")}" fill="none" stroke="var(--series-1)" stroke-width="2"/>
    ${points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.weight)}" r="2.5" fill="var(--series-1)"><title>${esc(p.date)}: ${p.weight} lb</title></circle>`).join("")}
  </svg>`;
}

export async function render(view) {
  const [o, habits] = await Promise.all([api.get("/fitness"), api.get("/habits")]);
  view.innerHTML = `<div id="fit-root">
    <div class="page-head"><div>
      <div class="eyebrow">Health · training log</div>
      <h1>Workouts</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${o.this_week}</b> this week</span>
        <span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span><b>${o.last_30}</b> in 30 days</span>
        ${o.latest_weight ? `<span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${o.latest_weight.weight}</b> lb · ${esc(fmtDate(o.latest_weight.date))}</span>` : ""}
      </div></div>
      <div class="btn-row">
        <button class="btn" id="fit-weight">⚖ Log weight</button>
        <button class="btn primary" id="fit-add">${icon("plus")} Log workout</button>
      </div></div>
    <p class="sub" style="margin:-8px 0 18px;color:var(--text-3)">Tip: tell the AI bar “Bench 3×5 at 185 and 3 sets of 10 pull-ups” or “Weighed 181 this morning”.</p>
    <div class="fin-grid">
      <section class="card fin-card"><header><h2>Workouts per week</h2></header>${weeksChart(o.weeks)}</section>
      <section class="card fin-card"><header><h2>Body weight</h2><span class="eyebrow">lb · 6 months</span></header>${weightChart(o.weights)}</section>
    </div>
    <div class="fin-grid" style="margin-top:14px">
      <section class="card fin-card">
        <header><h2>Recent workouts</h2></header>
        ${o.workouts.length ? `<ul class="fin-list">${o.workouts.slice(0, 15).map((w) => `
          <li data-w="${w.id}" class="fit-row"><div>
            <div class="fin-li-title">${esc(w.title)} <span class="pill">${esc(w.kind)}</span></div>
            <div class="fin-li-sub">${esc(fmtDate(w.date))}${w.minutes ? ` · ${w.minutes} min` : ""}${w.distance ? ` · ${w.distance} mi` : ""}${w.volume ? ` · ${w.volume.toLocaleString()} lb volume` : ""}</div>
            ${w.sets.length ? `<div class="fin-li-sub">${w.sets.map(setText).join(" · ")}</div>` : ""}
          </div><button class="icon-btn" aria-label="Edit">${icon("edit")}</button></li>`).join("")}</ul>`
          : `<div class="empty">No workouts yet.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Personal records</h2><span class="eyebrow">est. 1-rep max</span></header>
        ${o.records.length ? `<ul class="fin-list">${o.records.slice(0, 12).map((r) => `
          <li><div><div class="fin-li-title">${esc(r.exercise)}</div>
            <div class="fin-li-sub">best ${r.weight} lb × ${r.reps} · ${esc(fmtDate(r.date))} · heaviest ${r.heaviest} lb</div></div>
            <div class="fit-pr">${r.e1rm}<small> lb</small></div></li>`).join("")}</ul>`
          : `<div class="empty">Log sets with weights to see records.</div>`}
      </section>
    </div>
    <section class="card fin-card" style="margin-top:14px">
      <header><h2>Gym routine</h2></header>
      <label class="field"><span>Logging a workout checks off this routine</span>
        <select id="fit-habit"><option value="0">None</option>${habits.map((h) =>
          `<option value="${h.id}" ${o.habit?.id === h.id ? "selected" : ""}>${esc(h.title)}</option>`).join("")}</select></label>
    </section></div>`;

  const root = view.querySelector("#fit-root");
  const refresh = () => render(view);
  root.querySelector("#fit-add").onclick = () => openWorkout({ date: todayISO(), kind: "strength", sets: [] }, o, refresh);
  root.querySelector("#fit-weight").onclick = () => openWeight(o, refresh);
  root.addEventListener("click", (e) => {
    const row = e.target.closest("[data-w]");
    if (row) openWorkout(o.workouts.find((w) => w.id === Number(row.dataset.w)), o, refresh);
  });
  root.querySelector("#fit-habit").onchange = async (e) => {
    await api.put("/fitness/habit", { habit_id: Number(e.target.value) });
    toast("Saved");
  };
}

function setRow(s = {}) {
  return `<div class="set-row">
    <input type="text" list="fit-exercises" placeholder="Exercise" value="${esc(s.exercise || "")}" data-k="exercise" aria-label="Exercise">
    <input type="number" min="1" placeholder="Sets" value="${s.sets ?? 3}" data-k="sets" aria-label="Sets">
    <input type="number" min="0" placeholder="Reps" value="${s.reps ?? ""}" data-k="reps" aria-label="Reps">
    <input type="number" min="0" step="2.5" placeholder="lb" value="${s.weight || ""}" data-k="weight" aria-label="Weight (lb)">
    <button type="button" class="icon-btn danger" data-rm aria-label="Remove">${icon("x")}</button></div>`;
}

function openWorkout(w, o, onChange) {
  const isNew = !w.id;
  const dlg = openDialog({
    title: isNew ? "Log workout" : "Edit workout", style: "--area:#34d399",
    body: `<form id="w-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(w.date)}"></label>
        <label class="field"><span>Type</span><select name="kind">${o.kinds.map((k) => `<option ${k === w.kind ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Name (optional)</span><input type="text" name="title" value="${esc(isNew ? "" : w.title)}" placeholder="e.g. Push day, 5K run"></label>
      <div class="field"><span>Exercises · sets · reps · lb</span>
        <div id="set-rows">${(w.sets.length ? w.sets : [{}]).map(setRow).join("")}</div>
        <datalist id="fit-exercises">${o.exercises.map((x) => `<option>${esc(x)}</option>`).join("")}</datalist>
        <button type="button" class="btn small" id="add-set" style="align-self:flex-start">${icon("plus")} Exercise</button></div>
      <div class="row">
        <label class="field"><span>Minutes (optional)</span><input type="number" name="minutes" min="0" value="${w.minutes || ""}"></label>
        <label class="field"><span>Distance, miles (optional)</span><input type="number" name="distance" min="0" step="0.1" value="${w.distance || ""}"></label>
      </div>
      <label class="field"><span>Notes</span><input type="text" name="notes" value="${esc(w.notes || "")}"></label>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="w-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  const rows = dlg.querySelector("#set-rows");
  dlg.querySelector("#add-set").onclick = () => { rows.insertAdjacentHTML("beforeend", setRow()); rows.lastElementChild.querySelector("input").focus(); };
  rows.addEventListener("click", (e) => { if (e.target.closest("[data-rm]")) e.target.closest(".set-row").remove(); });
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm("Delete this workout?")) return;
    await api.del(`/fitness/workouts/${w.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sets = [...rows.querySelectorAll(".set-row")].map((r) => Object.fromEntries([...r.querySelectorAll("[data-k]")].map((i) =>
      [i.dataset.k, i.dataset.k === "exercise" ? i.value.trim() : Number(i.value || 0)]))).filter((s) => s.exercise);
    const body = { date: form.date.value, kind: form.kind.value, title: form.title.value, notes: form.notes.value, sets,
      minutes: form.minutes.value ? Number(form.minutes.value) : null, distance: form.distance.value ? Number(form.distance.value) : null };
    try {
      if (isNew) await api.post("/fitness/workouts", body);
      else await api.patch(`/fitness/workouts/${w.id}`, body);
      dlg.close();
      toast(isNew ? `Workout logged${o.habit ? ` · ✓ ${o.habit.title}` : ""}` : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openWeight(o, onChange) {
  const dlg = openDialog({
    title: "Log body weight", style: "--area:#34d399",
    body: `<form id="bw-form" class="dlg-body" style="padding:0"><div class="row">
      <label class="field"><span>Weight (lb)</span><input type="number" name="weight" step="0.1" required value="${o.latest_weight?.weight ?? ""}"></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${todayISO()}"></label></div></form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="bw-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.weight.select();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.post("/fitness/weight", { weight: Number(form.weight.value), date: form.date.value });
      dlg.close();
      toast("Weight saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
