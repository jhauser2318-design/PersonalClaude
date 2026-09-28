// Life Control Center: app startup, sidebar navigation, and the command bar.
import { api, sync } from "./api.js";
import { icon } from "./icons.js";
import { AREA_PAGES, EXTRA_ROUTES, GROUPS, MODULES } from "./modules.js";
import { setupFocus } from "./focus.js";
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
  const badge = (id) => ({ routines: "routine-badge", followups: "followup-badge" })[id];
  const item = (m) => link(`#/${m.id}`, `${icon(m.icon)}${esc(m.label)}${badge(m.id) ? `<span class="nav-badge" id="${badge(m.id)}" hidden></span>` : ""}`);
  $("#nav").innerHTML = `
    ${GROUPS.map((g) => {
      const items = MODULES.filter((m) => m.group === g);
      return items.length ? `${g ? `<div class="nav-section eyebrow">${esc(g)}</div>` : ""}${items.map(item).join("")}` : "";
    }).join("")}
    <div class="nav-section eyebrow">Life areas</div>
    ${state.areas.map((a) => link(`#/area/${a.id}`, `<span class="dot" style="--area:${a.color}"></span>${esc(a.name)}`)
      + (AREA_PAGES[a.id] || []).map((p) => link(`#/${p.id}`, `${icon(p.icon)}${esc(p.label)}`, "nav-sub")).join("")).join("")}
    <div class="nav-section"></div>
    ${link("#/settings", `${icon("settings")}Settings`)}
    <button class="nav-link nav-button" id="check-updates">${icon("refresh")}Check for updates</button>`;
  $("#check-updates").onclick = (e) => checkForUpdates(e.currentTarget);
}

function highlightNav() {
  const hash = location.hash || "#/dashboard";
  const base = hash.split("/").slice(0, hash.startsWith("#/area/") ? 3 : 2).join("/");
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === base));
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
    else if (module) await module.view.render(view, arg);
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
  const fu = $("#followup-badge");
  if (!fu) return;
  try {
    const { summary } = await api.get("/followups");
    fu.textContent = summary.due;
    fu.hidden = summary.due === 0;
  } catch (e) { fu.hidden = true; }
}

// ===========================================================================
// Command bar
// ===========================================================================

const EXAMPLES = [
  "Gym 6–7am tomorrow and CPA study 7–9pm",
  "Plan my afternoon around my meetings",
  "Got 78% on my FAR practice exam",
  "Bench 3×5 at 185, then 3 sets of 10 pull-ups",
  "Called Mom about the trip",
  "Add Jake, friend, birthday June 3, reach out every 2 weeks",
  "Remind me to call Mom at 6pm",
  "Follow up with Sarah about the contract Friday at 10am",
  "Remind me every day at 7am to do my skincare",
  "How much did I spend on dining last month?",
  "Am I on track with my budget this month?",
  "What subscriptions am I paying for?",
  "Add AirPods Pro to my wants, $249",
  "How much are my needs in total?",
  "What did Sarah say about the budget?",
  "Reply to Alex that Saturday dinner works",
  "Dentist appointment Thursday at 3pm (goes on Google Calendar)",
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

// On the phone (through Tailscale): ask for the passcode once, then this
// device is remembered for 90 days.
let loginShown = false;
function showLogin(hasPasscode = true) {
  if (loginShown) return;
  loginShown = true;
  const box = document.createElement("div");
  box.className = "login-screen";
  box.innerHTML = `
    <form class="login-card card" autocomplete="on">
      <img src="icon.png" alt="" class="login-icon">
      <h1>Life Control Center</h1>
      ${hasPasscode ? `<p>Enter the passcode you set on your PC. This device will be remembered for 90 days.</p>
        <input type="password" name="passcode" autocomplete="current-password" placeholder="Passcode" required aria-label="Passcode">
        <button class="btn primary" type="submit">Unlock</button>
        <p class="error-msg" hidden></p>`
      : `<p>No passcode is set yet. On your PC, open <b>Settings → Phone &amp; devices</b> and set one, then reload this page.</p>`}
    </form>`;
  document.body.appendChild(box);
  const form = box.querySelector("form");
  form.passcode?.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector(".error-msg");
    try {
      await api.post("/auth/login", { passcode: form.passcode.value });
      location.reload();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; form.passcode.select(); }
  });
}

let remoteDevice = false;

async function start() {
  window.addEventListener("lcc:login-required", () => showLogin());
  try {
    const auth = await api.get("/auth/status");
    remoteDevice = auth.remote;
    document.documentElement.classList.toggle("is-remote", auth.remote);
    if (auth.remote && !auth.signed_in) return showLogin(auth.has_passcode);
  } catch (e) { /* older server or offline: carry on and show the usual messages */ }
  $("#menu-btn").innerHTML = icon("menu");
  $("#menu-btn").addEventListener("click", () => openMenu(true));
  $("#scrim").addEventListener("click", () => openMenu(false));
  setupCommandBar();
  setupFocus();
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
  showDemoBadge();
  window.addEventListener("hashchange", route);
  route();
  updateBadge();
  announceUpdate();
  keepAlive();
}

// A small "Demo" tag in the top bar while demo mode is on (click it to go to Settings).
async function showDemoBadge() {
  try {
    const d = await api.get("/demo");
    document.documentElement.classList.toggle("is-demo", d.on);
    if (d.on && !$("#demo-badge")) {
      const a = document.createElement("a");
      a.id = "demo-badge";
      a.className = "demo-badge";
      a.href = "#/settings";
      a.title = "Showing sample data. Click to turn demo mode off in Settings.";
      a.textContent = "Demo";
      $(".topbar").appendChild(a);
    }
  } catch (e) { /* not important */ }
}

// Is it safe to redraw the page right now (nothing being typed or edited)?
function quiet() {
  const el = document.activeElement;
  return document.visibilityState === "visible" && !document.querySelector("dialog[open]")
    && !(el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
    && !$("#command-form").classList.contains("busy");
}

// Check in with the app every few seconds while this window is showing:
//  - the desktop launcher shuts the app down a few minutes after check-ins
//    stop (unless background mode is on),
//  - if the app restarted on a new version, reload to show the new screens,
//  - if something was saved on another device (or in the background), redraw.
function keepAlive() {
  let failures = 0;
  let loadedVersion; // the app version this window was loaded from
  let loadedDemo; // whether demo mode was on when this window loaded
  let lastPing = 0;
  const ping = async () => {
    lastPing = Date.now();
    try {
      const r = await api.post("/app/ping");
      failures = 0;
      if (loadedDemo === undefined) loadedDemo = r.demo;
      else if (r.demo !== undefined && r.demo !== loadedDemo) {
        location.reload(); // demo mode was switched (maybe on another device): show the other data
        return;
      }
      if (loadedVersion === undefined) loadedVersion = r.version;
      else if (r.version !== loadedVersion) {
        location.reload(); // the app restarted on a new version: show the new screens
        return;
      }
      if (sync.known === null) sync.known = r.data_version;
      else if (r.data_version !== sync.known && quiet()) {
        sync.known = r.data_version;
        state.refresh();
      }
      if (!updateState.installing) $("#offline-notice").hidden = true;
    } catch (e) {
      failures += 1;
      if (failures >= 2 && !updateState.installing) {
        $("#offline-notice").textContent = remoteDevice
          ? "Can't reach your PC right now. Check that it's on and awake, and that Tailscale is connected on this phone. This page reconnects by itself."
          : "Life Control Center has stopped running. Close this window and open the app again from the Desktop icon.";
        $("#offline-notice").hidden = false;
      }
    }
  };
  ping();
  // Every 5 seconds while visible; when hidden, just often enough to say "still open".
  setInterval(() => { if (document.visibilityState === "visible" || Date.now() - lastPing > 14000) ping(); }, 5000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ping(); });
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
