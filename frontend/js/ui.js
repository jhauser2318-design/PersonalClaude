// Reusable UI helpers: formatting, small components, dialogs, toasts.
import { icon } from "./icons.js";
import { state } from "./state.js";

// Escape text before putting it into HTML (so a title like "<b>" is shown as-is).
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Dates ----------
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysFromToday(iso) {
  return Math.round((parseISODate(iso) - parseISODate(todayISO())) / 86400000);
}

export function fmtDate(iso) {
  if (!iso) return "";
  const diff = daysFromToday(iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = parseISODate(iso);
  const opts = { month: "short", day: "numeric" };
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = fmtDate(iso.slice(0, 10));
  return `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function dueState(dateIso, done) {
  if (!dateIso || done) return "";
  const diff = daysFromToday(dateIso);
  return diff < 0 ? "overdue" : diff === 0 ? "today" : "";
}

// ---------- Labels ----------
export const STATUS_LABELS = {
  not_started: "Not started", in_progress: "In progress", done: "Done", paused: "Paused",
};
export const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };

export function areaStyle(areaId) {
  const a = state.areaById[areaId];
  return a ? `--area:${a.color}` : "";
}

export function areaTag(areaId) {
  const a = state.areaById[areaId];
  return a ? `<span class="area-tag" style="--area:${a.color}">${esc(a.name)}</span>` : "";
}

export function progressBar(pct, areaId) {
  return `<div class="progress" style="${areaStyle(areaId)}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
}

export function areaOptions(selected) {
  return state.areas.map((a) =>
    `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
}

// ---------- Toast ----------
let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Dialogs ----------
// Opens a <dialog> with the given inner HTML and returns it. It removes
// itself from the page when closed.
export function openDialog({ title, body, foot = "", style = "" }) {
  const dlg = document.createElement("dialog");
  dlg.setAttribute("style", style);
  dlg.innerHTML = `
    <div class="dlg-head"><h2>${title}</h2>
      <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="dlg-body">${body}</div>
    ${foot ? `<div class="dlg-foot">${foot}</div>` : ""}`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
  });
  dlg.showModal();
  return dlg;
}

export function showError(container, err) {
  let p = container.querySelector(".error-msg");
  if (!p) {
    p = document.createElement("p");
    p.className = "error-msg";
    container.appendChild(p);
  }
  p.textContent = err.message || String(err);
}
