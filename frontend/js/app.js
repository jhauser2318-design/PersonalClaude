// Life Control Center: app startup, sidebar navigation, and the command bar.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { EXTRA_ROUTES, MODULES } from "./modules.js";
import { setAreas, state } from "./state.js";
import { esc, toast } from "./ui.js";
import { openDraft, openMessage } from "./email-ui.js";
import { checkForUpdates, updateState } from "./updates.js";
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
    ${main.map((m) => link(`#/${m.id}`, `${icon(m.icon)}${esc(m.label)}${m.id === "routines" ? `<span class="nav-badge" id="routine-badge" hidden></span>` : ""}`)).join("")}
    <div class="nav-section eyebrow">Life areas</div>
    ${state.areas.map((a) => link(`#/area/${a.id}`, `<span class="dot" style="--area:${a.color}"></span>${esc(a.name)}`)).join("")}
    <div class="nav-section eyebrow">Coming soon</div>
    ${soon.map((m) => link(`#/${m.id}`, `${icon(m.icon)}${esc(m.label)}<span class="soon">Soon</span>`, "disabled")).join("")}
    <div class="nav-section"></div>
    ${link("#/settings", `${icon("settings")}Settings`)}
    <button class="nav-link nav-button" id="check-updates">${icon("refresh")}Check for updates</button>`;
  $("#check-updates").onclick = (e) => checkForUpdates(e.currentTarget);
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
      Try closing this window and opening the app again from the Desktop icon.</div>`;
  }
}

// Redraw the current page (called after any change), keeping the scroll position.
state.refresh = async () => {
  const y = window.scrollY;
  await route();
  window.scrollTo(0, y);
  updateBadge();
};

// Sidebar badge: how many of today's routines are still to do.
async function updateBadge() {
  const badge = $("#routine-badge");
  if (!badge) return;
  try {
    const left = (await api.get("/habits")).filter((h) => h.due_today && !h.done_today).length;
    badge.textContent = left;
    badge.hidden = left === 0;
  } catch (e) { badge.hidden = true; }
}

// ===========================================================================
// Command bar
// ===========================================================================

const EXAMPLES = [
  "How much did I spend on dining last month?",
  "Am I on track with my budget this month?",
  "What subscriptions am I paying for?",
  "Add AirPods Pro to my wants, $249",
  "How much are my needs in total?",
  "What did Sarah say about the budget?",
  "Reply to Alex that Saturday dinner works",
  "Schedule CPA study tomorrow 7–9pm at the library",
  "When am I free this week for a 2-hour study block?",
  "Went to the gym and did my skincare",
  "Studied CPA for 2.5 hours today",
  "Set up a daily reading routine, 20 pages a day",
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
  const icons = { applied: "✓", answer: "i", clarify: "?", error: "!", email: "@", finance: "$" };
  box.className = `command-result ${result.status}`;
  box.innerHTML = `
    <div class="cr-icon" aria-hidden="true">${icons[result.status] || "i"}</div>
    <div class="cr-body">
      ${formatReply(result.reply || "")}
      ${result.changes?.length ? `<ul>${result.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${result.status === "clarify" ? `<div class="cr-hint">Type your answer in the bar above.</div>` : ""}
      ${result.sources?.length ? `<div class="cr-sources"><span class="eyebrow">From</span>${result.sources.map((s) =>
        `<button class="source" data-mail="${esc(s.id)}">✉ ${esc(s.from)}: ${esc(s.subject)}</button>`).join("")}</div>` : ""}
    </div>
    <div class="cr-actions">
      ${result.log_id ? `<button class="btn small" id="undo-btn">${icon("undo")} Undo</button>` : ""}
      ${result.draft ? `<button class="btn small primary" id="draft-btn">${icon("mail")} Review &amp; send</button>` : ""}
      <button class="icon-btn" id="close-result" aria-label="Dismiss">${icon("x")}</button>
    </div>`;
  box.hidden = false;
  $("#close-result").onclick = () => { box.hidden = true; };
  box.querySelectorAll("[data-mail]").forEach((b) => { b.onclick = () => openMessage(b.dataset.mail); });
  if (result.draft) {
    const review = () => openDraft(result.draft, () => { box.hidden = true; });
    $("#draft-btn").onclick = review;
    review(); // open the draft right away; nothing is sent until you click Send
  }
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
    else if (result.status !== "error") {
      // For email answers, remember which emails were used so follow-ups ("reply to that one") work.
      const refs = result.sources?.length
        ? `\n(Emails used: ${result.sources.map((s) => `id ${s.id}, "${s.subject}" from ${s.from}`).join("; ")})` : "";
      history = [...history, { role: "user", content: text }, { role: "assistant", content: result.reply + refs }].slice(-6);
    }
    if (result.status !== "error") input.value = "";
    showResult(result);
    if (result.status === "applied" || (result.status === "finance" && result.changes?.length)) state.refresh();
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
    if (!status.api_key_configured) {
      $("#sys-status").innerHTML = `<span class="pulse off"></span><span>AI link offline · no key</span>`;
    }
  } catch (err) {
    view.innerHTML = `<div class="card empty">Can't reach the app's backend. Make sure it's running (see README).</div>`;
    return;
  }
  buildNav();
  window.addEventListener("hashchange", route);
  route();
  updateBadge();
  announceUpdate();
  keepAlive();
}

// Tell the app this window is still open (every 15 seconds). The desktop
// launcher shuts the app down a few minutes after these check-ins stop.
function keepAlive() {
  let failures = 0;
  let loadedVersion; // the app version this window was loaded from
  const ping = async () => {
    try {
      const r = await api.post("/app/ping");
      failures = 0;
      if (loadedVersion === undefined) loadedVersion = r.version;
      else if (r.version !== loadedVersion) {
        location.reload(); // the app restarted on a new version: show the new screens
        return;
      }
      if (!updateState.installing) $("#offline-notice").hidden = true;
    } catch (e) {
      failures += 1;
      if (failures >= 2 && !updateState.installing) $("#offline-notice").hidden = false;
    }
  };
  ping();
  setInterval(() => ping(), 15000);
  // While an update is installing, check more often so the refresh is quick.
  setInterval(() => { if (updateState.installing) ping(); }, 2000);
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
