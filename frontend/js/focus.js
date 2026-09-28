// Focus timer: a countdown in the top bar (25/50/90 minutes or your own).
// When it ends (or you stop it), the session is saved, and if you picked a
// routine it counts toward it (e.g. 50 minutes = 0.83 hours of CPA study).
// The running timer is remembered on this device, so it survives a reload.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { esc, toast } from "./ui.js";

const KEY = "lcc-focus";
let tick;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}
function save(s) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
}
const left = (s) => s.paused ? s.left : Math.max(0, s.endsAt - Date.now());
const elapsedMin = (s) => (s.minutes * 60000 - left(s)) / 60000;
const clock = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
    });
  } catch (e) { /* no sound available */ }
}

async function finish(s, early = false) {
  const cur = load();
  if (!cur || cur.endsAt !== s.endsAt) { draw(); return; } // another window already saved it
  save(null);
  clearInterval(tick);
  draw();
  const minutes = early ? elapsedMin(s) : s.minutes;
  if (minutes < 1) { toast("Focus timer stopped"); return; }
  try {
    const r = await api.post("/focus/finish", { minutes, label: s.label || "", habit_id: s.habitId || null });
    const habit = r.habit ? ` · counted toward ${r.habit.title}` : "";
    toast(`${early ? "Stopped" : "Done! 🎉"} ${Math.round(minutes)} min of focus saved${habit}`, 5000);
    if (!early) beep();
    state.refresh();
  } catch (err) { toast(err.message, 6000); }
}

function draw() {
  const btn = document.getElementById("focus-btn");
  if (!btn) return;
  const s = load();
  btn.classList.toggle("running", !!s);
  btn.classList.toggle("paused", !!s?.paused);
  btn.innerHTML = s ? `${icon("timer")}<span class="focus-clock">${clock(left(s))}</span>` : icon("timer");
  btn.title = s ? `Focus: ${s.label || "session"}${s.paused ? " (paused)" : ""}` : "Focus timer";
  const panel = document.getElementById("focus-panel");
  if (panel && !panel.hidden) renderPanel(panel);
}

function run() {
  clearInterval(tick);
  tick = setInterval(() => {
    const s = load();
    if (!s) { clearInterval(tick); draw(); return; }
    if (!s.paused && left(s) <= 0) { finish(s); return; }
    draw();
  }, 1000);
  draw();
}

export function startFocus({ minutes = 25, label = "", habitId = null } = {}) {
  const s = { minutes, label, habitId, endsAt: Date.now() + minutes * 60000, paused: false };
  save(s);
  document.getElementById("focus-panel")?.setAttribute("hidden", "");
  toast(`Focus started: ${minutes} min${label ? ` · ${label}` : ""}`);
  run();
}

let habits = [];
async function renderPanel(panel) {
  const s = load();
  if (s) {
    if (panel.dataset.mode === "running") { // just update the clock
      panel.querySelector(".focus-big").textContent = clock(left(s));
      return;
    }
    panel.dataset.mode = "running";
    const habit = habits.find((h) => h.id === s.habitId);
    panel.innerHTML = `
      <div class="eyebrow">Focusing${s.label ? ` · ${esc(s.label)}` : ""}</div>
      <div class="focus-big">${clock(left(s))}</div>
      ${habit ? `<div class="muted small">Counts toward <b>${esc(habit.title)}</b></div>` : ""}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn small" data-f="pause">${s.paused ? `${icon("play")} Resume` : `${icon("pause")} Pause`}</button>
        <button class="btn small" data-f="stop">Stop &amp; save</button>
        <button class="btn small danger" data-f="cancel">Discard</button>
      </div>`;
    return;
  }
  panel.dataset.mode = "setup";
  panel.innerHTML = `
    <div class="eyebrow">Focus timer</div>
    <div class="chips focus-presets">${[25, 50, 90].map((m) => `<button class="chip ${m === 50 ? "active" : ""}" data-min="${m}">${m} min</button>`).join("")}
      <input type="number" min="1" max="240" id="focus-min" value="50" aria-label="Minutes"></div>
    <label class="field"><span>What are you working on?</span><input type="text" id="focus-label" placeholder="e.g. FAR chapter 6"></label>
    <label class="field"><span>Count it toward a routine (optional)</span>
      <select id="focus-habit"><option value="">None</option>${habits.filter((h) => h.active).map((h) =>
        `<option value="${h.id}">${esc(h.title)}${h.unit ? ` (${esc(h.unit)})` : ""}</option>`).join("")}</select></label>
    <button class="btn primary" data-f="start" style="margin-top:12px;width:100%">${icon("play")} Start</button>`;
  const cpa = habits.find((h) => h.active && /cpa|study/i.test(h.title));
  if (cpa) panel.querySelector("#focus-habit").value = cpa.id;
}

export function setupFocus() {
  const bar = document.querySelector(".topbar");
  const btn = document.createElement("button");
  btn.id = "focus-btn";
  btn.className = "icon-btn focus-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Focus timer");
  const panel = document.createElement("div");
  panel.id = "focus-panel";
  panel.className = "focus-panel card";
  panel.hidden = true;
  bar.appendChild(btn);
  bar.appendChild(panel);

  btn.onclick = async () => {
    if (!panel.hidden) { panel.hidden = true; return; }
    try { habits = await api.get("/habits"); } catch (e) { habits = []; }
    panel.dataset.mode = "";
    await renderPanel(panel);
    panel.hidden = false;
  };
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) panel.hidden = true;
  });
  panel.addEventListener("click", (e) => {
    const preset = e.target.closest("[data-min]");
    if (preset) {
      panel.querySelector("#focus-min").value = preset.dataset.min;
      panel.querySelectorAll("[data-min]").forEach((c) => c.classList.toggle("active", c === preset));
      return;
    }
    const act = e.target.closest("[data-f]")?.dataset.f;
    if (!act) return;
    const s = load();
    if (act === "start") {
      const minutes = Math.max(1, Math.min(240, Number(panel.querySelector("#focus-min").value) || 25));
      const habitId = Number(panel.querySelector("#focus-habit").value) || null;
      startFocus({ minutes, label: panel.querySelector("#focus-label").value.trim(), habitId });
    } else if (act === "pause" && s) {
      if (s.paused) { s.endsAt = Date.now() + s.left; s.paused = false; } else { s.left = left(s); s.paused = true; }
      save(s);
      panel.dataset.mode = "";
      draw();
    } else if (act === "stop" && s) {
      panel.hidden = true;
      finish(s, true);
    } else if (act === "cancel" && s) {
      if (!confirm("Discard this focus session without saving it?")) return;
      save(null);
      panel.hidden = true;
      draw();
    }
  });
  // Another tab or window started/stopped a timer.
  window.addEventListener("storage", (e) => { if (e.key === KEY) run(); });
  if (load()) run(); else draw();
}
