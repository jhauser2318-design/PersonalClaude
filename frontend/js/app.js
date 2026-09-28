// Life Control Center: app startup, sidebar navigation, and the command bar.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { EXTRA_ROUTES, MODULES } from "./modules.js";
import { setAreas, state } from "./state.js";
import { esc, toast } from "./ui.js";
import * as comingSoon from "./views/coming-soon.js";

const $ = (sel) => document.querySelector(sel);
const view = $("#view");

// ===========================================================================
// Sidebar
// ===========================================================================

function buildNav() {
  const link = (href, inner, extra = "") => `<a class="nav-link ${extra}" href="${href}">${inner}</a>`;
  const main = MODULES.filter((m) => !m.comingSoon);
  const soon = MODULES.filter((m) => m.comingSoon);
  $("#nav").innerHTML = `
    ${main.map((m) => link(`#/${m.id}`, `${icon(m.icon)}${esc(m.label)}`)).join("")}
    <div class="nav-section">Life areas</div>
    ${state.areas.map((a) => link(`#/area/${a.id}`, `<span class="dot" style="--area:${a.color}"></span>${esc(a.name)}`)).join("")}
    <div class="nav-section">Coming soon</div>
    ${soon.map((m) => link(`#/${m.id}`, `${icon(m.icon)}${esc(m.label)}<span class="soon">Soon</span>`, "disabled")).join("")}
    <div class="nav-section"></div>
    ${link("#/settings", `${icon("settings")}Settings`)}`;
}

function highlightNav() {
  const hash = location.hash || "#/dashboard";
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === hash));
}

function openMenu(open) {
  $("#sidebar").classList.toggle("open", open);
  $("#scrim").hidden = !open;
}

// ===========================================================================
// Router: the part of the address after "#/" decides which page is shown.
// ===========================================================================

async function route() {
  const [name = "dashboard", arg] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/");
  const module = MODULES.find((m) => m.id === name);
  highlightNav();
  openMenu(false);
  try {
    if (module?.comingSoon) comingSoon.render(view, module);
    else if (module) await module.view.render(view);
    else if (EXTRA_ROUTES[name]) await EXTRA_ROUTES[name].render(view, arg);
    else { location.hash = "#/dashboard"; return; }
  } catch (err) {
    view.innerHTML = `<div class="card empty">Something went wrong loading this page: ${esc(err.message)}<br>
      Is the app still running in your terminal window?</div>`;
  }
}

// Redraw the current page (called after any change), keeping the scroll position.
state.refresh = async () => {
  const y = window.scrollY;
  await route();
  window.scrollTo(0, y);
};

// ===========================================================================
// Command bar
// ===========================================================================

const EXAMPLES = [
  "New health goal: run a 5K by March",
  "Went to the gym today, update my fitness goal",
  "Add a work task to email Sarah about the budget by Friday",
  "Mark the Spanish lesson task as done",
  "What should I focus on this week?",
];

// Recent back-and-forth, so replying to a clarifying question makes sense to Claude.
let history = [];
let lastActivity = 0;

function formatReply(text) {
  // Turn "- item" lines into a bullet list; keep other lines as paragraphs.
  const out = [];
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.join("")}</ul>`); list = []; };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[-•*]\s+(.*)/);
    if (m) list.push(`<li>${esc(m[1])}</li>`);
    else { flush(); if (line.trim()) out.push(`<p class="cr-reply">${esc(line)}</p>`); }
  }
  flush();
  return out.join("");
}

function showResult(result) {
  const box = $("#command-result");
  const icons = { applied: "✓", answer: "i", clarify: "?", error: "!" };
  box.className = `command-result ${result.status}`;
  box.innerHTML = `
    <div class="cr-icon" aria-hidden="true">${icons[result.status] || "i"}</div>
    <div class="cr-body">
      ${formatReply(result.reply || "")}
      ${result.changes?.length ? `<ul>${result.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${result.status === "clarify" ? `<div class="cr-hint">Type your answer in the bar above.</div>` : ""}
    </div>
    <div class="cr-actions">
      ${result.log_id ? `<button class="btn small" id="undo-btn">${icon("undo")} Undo</button>` : ""}
      <button class="icon-btn" id="close-result" aria-label="Dismiss">${icon("x")}</button>
    </div>`;
  box.hidden = false;
  $("#close-result").onclick = () => { box.hidden = true; };
  const undoBtn = $("#undo-btn");
  if (undoBtn) undoBtn.onclick = async () => {
    undoBtn.disabled = true;
    try {
      await api.post(`/command/${result.log_id}/undo`);
      box.hidden = true;
      toast("Undone");
      state.refresh();
    } catch (err) { toast(err.message); undoBtn.disabled = false; }
  };
}

async function runCommand(text) {
  const form = $("#command-form");
  const input = $("#command-input");
  const send = $("#command-send");
  if (Date.now() - lastActivity > 10 * 60 * 1000) history = []; // forget stale context
  form.classList.add("busy");
  send.innerHTML = icon("loader");
  send.disabled = input.disabled = true;
  try {
    const result = await api.post("/command", { text, history });
    lastActivity = Date.now();
    if (result.status === "applied") history = [];
    else if (result.status !== "error") history = [...history, { role: "user", content: text }, { role: "assistant", content: result.reply }].slice(-6);
    if (result.status !== "error") input.value = "";
    showResult(result);
    if (result.status === "applied") state.refresh();
  } catch (err) {
    showResult({ status: "error", reply: err.message });
  } finally {
    form.classList.remove("busy");
    send.innerHTML = icon("send");
    send.disabled = input.disabled = false;
    input.focus();
  }
}

function setupCommandBar() {
  const input = $("#command-input");
  $(".command-icon").innerHTML = icon("sparkle");
  $("#command-send").innerHTML = icon("send");
  $("#command-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) runCommand(text);
  });

  // Rotate example sentences in the placeholder while the bar is empty.
  let i = 0;
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    i = (i + 1) % EXAMPLES.length;
    input.placeholder = `Try: “${EXAMPLES[i]}”`;
  }, 5000);

  // Press "/" anywhere to jump to the command bar; Escape hides the result.
  document.addEventListener("keydown", (e) => {
    const typing = e.target.matches("input, textarea, select") || e.target.isContentEditable;
    if (e.key === "/" && !typing && !document.querySelector("dialog[open]")) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape" && document.activeElement === input) $("#command-result").hidden = true;
  });
}

// ===========================================================================
// Start
// ===========================================================================

async function start() {
  $("#menu-btn").innerHTML = icon("menu");
  $("#menu-btn").addEventListener("click", () => openMenu(true));
  $("#scrim").addEventListener("click", () => openMenu(false));
  setupCommandBar();
  try {
    setAreas(await api.get("/areas"));
    const status = await api.get("/command/status");
    $("#key-notice").hidden = status.api_key_configured;
  } catch (err) {
    view.innerHTML = `<div class="card empty">Can't reach the app's backend. Make sure it's running (see README).</div>`;
    return;
  }
  buildNav();
  window.addEventListener("hashchange", route);
  route();
  announceUpdate();
}

// After the desktop app installs a new version, say so once.
async function announceUpdate() {
  try {
    const v = await api.get("/version");
    if (!v.just_updated) return;
    showResult({ status: "answer", reply: `✨ Updated to the latest version: ${v.summary || v.version}` });
    await api.post("/version/seen");
  } catch (e) { /* not important */ }
}

start();
