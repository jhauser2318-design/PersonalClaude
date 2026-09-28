// CPA Exam Planner (under Education): each section's exam date, study hours
// vs plan, practice scores, and the credit window after your first pass.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast, todayISO } from "../ui.js";

const STATUS = { not_started: "Not started", studying: "Studying", scheduled: "Exam booked", passed: "Passed", failed: "Retake" };
const STATUS_CLASS = { studying: "in_progress", scheduled: "medium", passed: "done", failed: "high", not_started: "" };

function scoreChart(scores) {
  if (!scores.length) return `<div class="muted small">No practice scores yet.</div>`;
  const W = 260, H = 64, P = 6;
  const pts = scores.slice(-12);
  const lo = Math.min(50, ...pts.map((s) => s.score)), hi = 100;
  const x = (i) => P + (pts.length === 1 ? (W - 2 * P) / 2 : (i / (pts.length - 1)) * (W - 2 * P));
  const y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  return `<svg class="cpa-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Practice scores">
    <line x1="${P}" x2="${W - P}" y1="${y(75)}" y2="${y(75)}" class="pass-line"/>
    <text x="${W - P}" y="${y(75) - 3}" text-anchor="end" class="axis-label">75 to pass</text>
    <path d="${pts.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.score).toFixed(1)}`).join("")}" fill="none" stroke="var(--series-1)" stroke-width="2"/>
    ${pts.map((s, i) => `<circle cx="${x(i)}" cy="${y(s.score)}" r="3" fill="var(--series-1)"><title>${esc(s.date)}: ${s.score}% ${esc(s.kind)}</title></circle>`).join("")}
  </svg>`;
}

function sectionCard(s) {
  const pct = s.target_hours ? Math.min(100, Math.round((100 * s.hours) / s.target_hours)) : 0;
  const pacePct = s.pace_hours != null && s.target_hours ? Math.min(100, (100 * s.pace_hours) / s.target_hours) : null;
  const active = ["studying", "scheduled"].includes(s.status);
  let paceText = "";
  if (active && s.behind_by != null) {
    paceText = s.behind_by > 1 ? `<span class="due overdue">${s.behind_by} h behind plan</span>`
      : s.behind_by < -1 ? `<span class="cpa-ahead">${-s.behind_by} h ahead</span>` : `<span class="cpa-ahead">on pace</span>`;
  }
  return `
    <section class="card cpa-card ${s.status}" data-id="${s.id}">
      <header>
        <div><div class="cpa-code">${esc(s.code)}</div><div class="muted small">${esc(s.name)}</div></div>
        <span class="pill ${STATUS_CLASS[s.status]}">${STATUS[s.status]}</span>
      </header>
      ${s.status === "passed" ? `<div class="cpa-passed">✓ Passed${s.score ? ` with ${s.score}` : ""}${s.passed_date ? ` · ${esc(fmtDate(s.passed_date))}` : ""}</div>` : `
        <div class="cpa-exam">${s.exam_date ? `${icon("calendar")} Exam <b>${esc(fmtDate(s.exam_date))}</b>${s.days_to_exam >= 0 ? ` · ${s.days_to_exam} days` : ""}`
          : `<span class="muted">No exam date yet</span>`}</div>
        ${active || s.hours ? `
          <div class="cpa-hours"><b>${s.hours}</b> / ${s.target_hours} h studied ${paceText}</div>
          <div class="progress cpa-progress" style="--area:#a78bfa"><span style="width:${pct}%"></span>
            ${pacePct != null ? `<i class="cpa-pace" style="left:${pacePct}%" title="Where you'd be on an even pace"></i>` : ""}</div>
          ${s.per_day_needed != null ? `<div class="muted small">${s.per_day_needed} h/day to reach ${s.target_hours} h by exam day</div>` : ""}` : ""}`}
      <div class="cpa-scores">${scoreChart(s.scores)}</div>
      <div class="btn-row">
        <button class="btn small" data-score="${esc(s.code)}">${icon("plus")} Practice score</button>
        <button class="btn small" data-edit="${s.id}">${icon("edit")} Edit</button>
      </div>
    </section>`;
}

export async function render(view) {
  const [o, habits] = await Promise.all([api.get("/cpa"), api.get("/habits")]);
  const w = o.window;
  view.innerHTML = `<div id="cpa-root">
    <div class="page-head"><div>
      <div class="eyebrow"><a href="#/area/education" class="crumb">Education</a> · CPA exam</div>
      <h1>CPA Exam Planner</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${o.passed}/${o.total}</b> sections passed</span>
        <span class="status-chip"><span class="dot" style="--c:#a78bfa"></span><b>${o.hours_this_week}</b> h this week</span>
        <span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span><b>${o.hours_last_30}</b> h last 30 days</span>
        ${w ? `<span class="status-chip"><span class="dot" style="--c:${w.days_left < 120 ? "var(--danger)" : "var(--warning)"}"></span>credit window <b>${w.days_left}</b> days left</span>` : ""}
      </div></div>
    </div>
    ${w ? `<div class="card cpa-window">
        <div><div class="eyebrow">Credit window</div>
          First pass ${esc(fmtDate(w.first_pass))}. Pass the rest by <b>${esc(new Date(w.deadline + "T12:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}</b> (${w.months} months).</div>
        <div class="progress" style="--area:var(--warning)"><span style="width:${Math.max(0, Math.min(100, 100 - (w.days_left / (w.months * 30.4)) * 100))}%"></span></div>
      </div>` : ""}
    <div class="cpa-grid">${o.sections.map(sectionCard).join("")}</div>
    <section class="card fin-card cpa-settings">
      <header><h2>How hours are counted</h2></header>
      <p class="muted small" style="margin:0 0 10px">Study hours come from a routine (log it with the AI bar: “studied FAR for 2 hours”) and from focus-timer sessions linked to it, counted from each section's study start date.</p>
      <div class="row">
        <label class="field"><span>Study routine</span>
          <select id="cpa-habit"><option value="">${habits.length ? "Pick one" : "No routines yet"}</option>${habits.map((h) =>
            `<option value="${h.id}" ${o.habit?.id === h.id ? "selected" : ""}>${esc(h.title)}${h.unit ? ` (${esc(h.unit)})` : ""}</option>`).join("")}</select></label>
        <label class="field"><span>Credit window (months, set by your state)</span>
          <input type="number" id="cpa-months" min="6" max="60" value="${o.window_months}"></label>
      </div>
      ${o.habit ? "" : `<p class="muted small" style="margin:10px 0 0">Tip: create a routine called “CPA study” (daily, 2 hours) on the Routines page and it's picked up automatically.</p>`}
    </section></div>`;

  const root = view.querySelector("#cpa-root");
  const refresh = () => render(view);
  const byId = Object.fromEntries(o.sections.map((s) => [s.id, s]));
  root.addEventListener("click", (e) => {
    const sc = e.target.closest("[data-score]");
    if (sc) return openScore(sc.dataset.score, o.sections, refresh);
    const ed = e.target.closest("[data-edit]");
    if (ed) return openSection(byId[ed.dataset.edit], o, refresh);
  });
  root.querySelector("#cpa-habit").onchange = async (e) => {
    if (!e.target.value) return;
    await api.put("/cpa/settings", { habit_id: Number(e.target.value) });
    toast("Study routine saved");
    refresh();
  };
  root.querySelector("#cpa-months").onchange = async (e) => {
    await api.put("/cpa/settings", { window_months: Number(e.target.value) });
    refresh();
  };
}

function openScore(code, sections, onChange) {
  const dlg = openDialog({
    title: "Practice score", style: "--area:#a78bfa",
    body: `<form id="cpa-score" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Section</span><select name="section">${sections.map((s) =>
          `<option ${s.code === code ? "selected" : ""}>${esc(s.code)}</option>`).join("")}</select></label>
        <label class="field"><span>Score (%)</span><input type="number" name="score" min="0" max="100" step="0.1" required></label>
      </div>
      <div class="row">
        <label class="field"><span>Date</span><input type="date" name="date" value="${todayISO()}"></label>
        <label class="field"><span>Type</span><input type="text" name="kind" value="practice exam" list="cpa-kinds">
          <datalist id="cpa-kinds"><option>practice exam</option><option>quiz</option><option>simulations</option><option>MCQs</option></datalist></label>
      </div>
      <label class="field"><span>Notes (optional)</span><input type="text" name="notes" placeholder="e.g. Becker PE 2, weak on leases"></label>
    </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="cpa-score">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.score.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.post("/cpa/scores", { section: form.section.value, score: Number(form.score.value), date: form.date.value,
        kind: form.kind.value || "practice exam", notes: form.notes.value });
      dlg.close();
      toast("Score saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openSection(s, o, onChange) {
  const codes = s.code === "FAR" || s.code === "AUD" || s.code === "REG" ? [s.code] : o.disciplines;
  const dlg = openDialog({
    title: `${s.code} · ${s.name}`, style: "--area:#a78bfa",
    body: `<form id="cpa-sec" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Status</span><select name="status">${o.statuses.map((x) =>
          `<option value="${x}" ${x === s.status ? "selected" : ""}>${STATUS[x]}</option>`).join("")}</select></label>
        ${codes.length > 1 ? `<label class="field"><span>Discipline</span><select name="code">${codes.map((c) =>
          `<option ${c === s.code ? "selected" : ""}>${c}</option>`).join("")}</select></label>` : `<div></div>`}
      </div>
      <div class="row">
        <label class="field"><span>Study start</span><input type="date" name="study_start" value="${esc(s.study_start || "")}"></label>
        <label class="field"><span>Exam date</span><input type="date" name="exam_date" value="${esc(s.exam_date || "")}"></label>
      </div>
      <div class="row">
        <label class="field"><span>Target study hours</span><input type="number" name="target_hours" min="0" step="10" value="${s.target_hours}"></label>
        <label class="field"><span>Official score (75 passes)</span><input type="number" name="score" min="0" max="99" value="${s.score ?? ""}"></label>
      </div>
      <label class="field"><span>Passed on</span><input type="date" name="passed_date" value="${esc(s.passed_date || "")}"></label>
      <label class="field"><span>Notes</span><textarea name="notes" placeholder="Weak topics, review course, testing center…">${esc(s.notes || "")}</textarea></label>
      ${s.scores.length ? `<div class="field"><span>Practice scores</span><ul class="fin-list">${s.scores.slice().reverse().map((x) => `
        <li><div><div class="fin-li-title">${x.score}%</div><div class="fin-li-sub">${esc(x.date)} · ${esc(x.kind)}${x.notes ? ` · ${esc(x.notes)}` : ""}</div></div>
        <button type="button" class="icon-btn danger" data-del-score="${x.id}" aria-label="Delete score">${icon("x")}</button></li>`).join("")}</ul></div>` : ""}
    </form>`,
    foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="cpa-sec">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del-score]");
    if (!del) return;
    await api.del(`/cpa/scores/${del.dataset.delScore}`);
    del.closest("li").remove();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { status: form.status.value, study_start: form.study_start.value || null, exam_date: form.exam_date.value || null,
      target_hours: Number(form.target_hours.value || 0), score: form.score.value === "" ? null : Number(form.score.value),
      passed_date: form.passed_date.value || null, notes: form.notes.value };
    if (form.code) body.code = form.code.value;
    try {
      await api.patch(`/cpa/sections/${s.id}`, body);
      dlg.close();
      toast("Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
