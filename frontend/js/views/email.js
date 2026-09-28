// Email page: your Gmail inbox, search, and reading/replying. Ask the AI bar
// questions about your email, or have it draft replies (you always click Send).
import { api } from "../api.js";
import { openDraft, openMessage, senderName, shortDate } from "../email-ui.js";
import { icon } from "../icons.js";
import { esc, toast } from "../ui.js";

const FILTERS = [
  ["Inbox", "in:inbox"],
  ["Unread", "is:unread in:inbox"],
  ["Starred", "is:starred"],
  ["Sent", "in:sent"],
];
let query = "in:inbox";

export async function render(view) {
  const status = await api.get("/email/status");
  if (!status.gmail) return renderSetup(view, status);

  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Gmail · read with AI, send with your click</div>
      <h1>Email</h1>
      <p class="sub">Ask the AI bar things like “What did Sarah say about the budget?” or “Reply to Alex that Saturday works”.</p></div>
      <button class="btn primary" id="compose">${icon("plus")} New email</button></div>
    <div class="toolbar">
      <div class="chips">${FILTERS.map(([label, q]) =>
        `<button class="chip ${q === query ? "active" : ""}" data-q="${esc(q)}">${label}</button>`).join("")}</div>
      <form id="mail-search" class="mail-search">
        <input type="text" name="q" value="${FILTERS.some(([, q]) => q === query) ? "" : esc(query)}"
               placeholder="Search Gmail (e.g. from:sarah budget)" aria-label="Search Gmail">
      </form>
    </div>
    <div id="mail-list"><div class="card empty">Loading your email…</div></div>`;

  view.querySelector("#compose").onclick = () => openDraft({});
  view.querySelector(".chips").onclick = (e) => {
    const chip = e.target.closest("[data-q]");
    if (chip) { query = chip.dataset.q; render(view); }
  };
  view.querySelector("#mail-search").onsubmit = (e) => {
    e.preventDefault();
    query = e.target.q.value.trim() || "in:inbox";
    render(view);
  };

  const list = view.querySelector("#mail-list");
  try {
    const mails = await api.get(`/email/messages?q=${encodeURIComponent(query)}&max=30`);
    list.innerHTML = mails.length ? `
      <ul class="mail-list card">${mails.map((m) => `
        <li class="mail ${m.unread ? "unread" : ""}" data-id="${esc(m.id)}" tabindex="0">
          <span class="mail-from">${esc(senderName(query.includes("in:sent") ? `To: ${m.to}` : m.from))}</span>
          <span class="mail-text"><span class="mail-subject">${esc(m.subject)}</span>
            <span class="mail-snippet"> — ${esc(m.snippet)}</span></span>
          <span class="mail-date">${esc(shortDate(m.timestamp || m.date))}</span>
        </li>`).join("")}</ul>` : `<div class="card empty">No emails found.</div>`;
  } catch (err) {
    list.innerHTML = `<div class="card empty">${esc(err.message)}</div>`;
    return;
  }
  const open = (e) => {
    const row = e.target.closest(".mail");
    if (row) openMessage(row.dataset.id);
  };
  list.addEventListener("click", open);
  list.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
}

function renderSetup(view, status) {
  const googleReady = status.client_configured;
  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Gmail · not connected</div>
      <h1>Email</h1>
      <p class="sub">Let the AI search and read your Gmail to answer questions, and draft emails that you review and send with one click.</p>
    </div></div>
    <div class="settings">
      ${googleReady ? "" : `
      <section class="card">
        <h2>First: set up your Google connection</h2>
        <p>Email uses the same Google connection as the calendar. Follow the steps on the <a href="#/calendar">Calendar page</a> first, then come back here.</p>
      </section>`}
      <section class="card">
        <h2>1 · Turn on the Gmail API (one time)</h2>
        <ol class="steps">
          <li>Open <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">the Gmail API page in Google Cloud</a>, signed in as your Google account.</li>
          <li>At the top, make sure your <b>Life Control Center</b> project is selected.</li>
          <li>Click <b>Enable</b>. Wait about a minute before step 2.</li>
        </ol>
      </section>
      <section class="card">
        <h2>2 · Connect Gmail</h2>
        <p>Google will ask you to allow the app to <b>read</b> your email and <b>send</b> email on your behalf. <b>Tick every box</b> Google shows.
           The app only sends an email after you review it and click <b>Send</b>.</p>
        <button class="btn primary" id="connect-gmail" ${googleReady ? "" : "disabled"}>${icon("mail")} Connect Gmail</button>
      </section>
      <section class="card">
        <h2>What stays private</h2>
        <p>Emails are read from Gmail only when you open this page or ask the AI about your email. Nothing is stored in the app.
           When you ask a question, only the emails relevant to it are sent to Claude (Anthropic) to read.</p>
      </section>
    </div>`;
  view.querySelector("#connect-gmail").onclick = async () => {
    try {
      const { url } = await api.get("/calendar/connect?return_to=email");
      location.href = url; // Google's sign-in page; it sends you back here afterwards
    } catch (err) { toast(err.message, 8000); }
  };
}
