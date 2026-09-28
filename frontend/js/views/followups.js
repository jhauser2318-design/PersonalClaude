// Follow-ups & reminders: things you need to chase or are waiting on,
// every upcoming reminder, and the desktop-notification switch.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { deviceState, disablePush, enablePush, testPush } from "../push.js";
import { dueState, esc, fmtDate, fmtDateTime, openDialog, showError, toast } from "../ui.js";

const KIND_LABEL = { task: "Task", routine: "Routine", followup: "Follow-up" };
const KIND_LINK = { task: "#/tasks", routine: "#/routines", followup: "#/followups" };

export function fmtReminder(at) {
  if (!at) return "";
  if (!at.includes("T")) {
    const [h, m] = at.split(":").map(Number);
    return `daily ${new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return fmtDateTime(at);
}

function followupRow(f) {
  const due = dueState(f.due_date, f.done);
  return `
    <li class="fu-item ${f.done ? "done" : ""} ${due === "overdue" ? "is-overdue" : ""}" data-id="${f.id}">
      <input type="checkbox" class="check" ${f.done ? "checked" : ""} aria-label="Mark “${esc(f.title)}” as done">
      <div class="fu-main" role="button" tabindex="0">
        <div class="fu-title">${esc(f.title)}</div>
        <div class="t-meta">
          ${f.person ? `<span class="fu-person">${esc(f.person)}</span>` : ""}
          ${f.due_date ? `<span class="due ${due}">${due === "overdue" ? "Overdue · " : ""}${esc(fmtDate(f.due_date))}</span>` : ""}
          ${f.remind_at ? `<span class="fu-bell">🔔 ${esc(fmtReminder(f.remind_at))}</span>` : ""}
        </div>
        ${f.notes ? `<div class="fu-notes">${esc(f.notes)}</div>` : ""}
      </div>
      <button class="icon-btn" data-edit aria-label="Edit">${icon("edit")}</button>
    </li>`;
}

function column(kind, items) {
  const title = kind === "todo" ? "I need to…" : "Waiting on…";
  const hint = kind === "todo" ? "Promises and things to chase" : "Things others owe you";
  return `
    <section class="card shop-col fu-${kind}">
      <header class="shop-head">
        <div><h2>${title}</h2><div class="eyebrow">${hint}</div></div>
        <button class="icon-btn" data-add="${kind}" aria-label="Add">${icon("plus")}</button>
      </header>
      ${items.length ? `<ul class="shop-list">${items.map(followupRow).join("")}</ul>`
        : `<div class="empty">${kind === "todo" ? "Nothing to follow up on." : "Not waiting on anyone."}</div>`}
    </section>`;
}

function notifyCard(n, ph, dev) {
  const bg = n.background;
  const on = n.settings.notify_enabled === "1";
  const desktop = n.settings.notify_desktop !== "0";
  const remote = document.documentElement.classList.contains("is-remote");
  let status;
  if (!bg.supported) status = `<span class="status-chip"><span class="dot" style="--c:var(--text-3)"></span>Background reminders need the Windows app</span>`;
  else if (on && bg.installed) status = `<span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>On</b> · checked every minute by your PC</span>`;
  else if (on) status = `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span>On, but the background check is missing</span>`;
  else status = `<span class="status-chip"><span class="dot" style="--c:var(--text-3)"></span><b>Off</b></span>`;
  const times = ["", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "10:00"];
  const phoneHelp = {
    "home-screen": `To get notifications on this iPhone, open the app from its <b>Home Screen icon</b> (in Safari tap Share → <b>Add to Home Screen</b>), then come back to this page there. Needs iOS 16.4 or newer.`,
    unsupported: "This browser can't receive notifications. On an iPhone, use the Home Screen app (iOS 16.4 or newer).",
    denied: "Notifications are blocked for this app. Allow them in the iPhone's <b>Settings → Notifications → Life CC</b>, then reload.",
  }[dev];
  return `
    <section class="card fu-notify">
      <div class="fu-notify-head">
        <div><h2>${icon("bell")} Notifications</h2>
          <p>Reminders, follow-ups, birthdays, bills and the morning briefing pop up at the right time, on this computer and on your phone, even when the app is closed. Your PC sends them, so it needs to be on (not asleep).</p>
          <div class="status-chips">${status}</div></div>
        ${remote ? "" : `<div class="btn-row">
          ${on && bg.installed ? `<button class="btn" id="n-test">Test on this computer</button><button class="btn" id="n-off">Turn off</button>`
            : `<button class="btn primary" id="n-on" ${bg.supported ? "" : "disabled"}>${icon("bell")} Turn on notifications</button>`}
        </div>`}
      </div>
      <div class="fu-channels">
        <div class="fu-channel">
          <div class="eyebrow">📱 Phones</div>
          ${remote ? (phoneHelp ? `<p class="muted small" style="margin:6px 0">${phoneHelp}</p>`
            : dev === "on" ? `<div class="btn-row" style="margin:8px 0"><span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>On</b> for this phone</span>
                <button class="btn small" id="p-test">Send a test</button><button class="btn small" id="p-off">Turn off here</button></div>`
            : `<div class="btn-row" style="margin:8px 0"><button class="btn primary small" id="p-on">${icon("bell")} Turn on for this phone</button></div>`)
            : `<p class="muted small" style="margin:6px 0">To add a phone: open the app from its Home Screen icon on the phone, go to <b>Follow-ups</b>, and tap <b>Turn on for this phone</b>.</p>`}
          ${ph.devices.length ? `<ul class="fin-list">${ph.devices.map((d) => `
            <li><div><div class="fin-li-title">${esc(d.label)}</div>
              <div class="fin-li-sub">${d.last_error ? `⚠ ${esc(d.last_error)}` : d.last_ok ? `last delivered ${esc(fmtDateTime(d.last_ok))}` : `added ${esc(fmtDateTime(d.created_at))}`}</div></div>
              <button class="icon-btn danger" data-forget="${d.id}" aria-label="Stop notifications to ${esc(d.label)}">${icon("x")}</button></li>`).join("")}</ul>`
            : `<p class="muted small" style="margin:0">No phones yet.</p>`}
        </div>
        <div class="fu-channel">
          <div class="eyebrow">💻 This computer</div>
          <label class="fin-check" style="margin-top:8px"><input type="checkbox" id="n-desktop" ${desktop ? "checked" : ""}>
            <span>Show notifications on the PC too (turn off if you only want them on your phone)</span></label>
        </div>
      </div>
      <div class="fu-settings">
        <label class="field"><span>Morning briefing</span>
          <select id="n-brief">${times.map((t) => `<option value="${t}" ${t === n.settings.notify_briefing ? "selected" : ""}>${t ? `at ${t}` : "Off"}</option>`).join("")}</select></label>
        <label class="fin-check"><input type="checkbox" id="n-budget" ${n.settings.notify_budget === "1" ? "checked" : ""}>
          <span>Budget alerts: tell me when a category goes over its monthly budget (checked after each morning bank sync)</span></label>
      </div>
    </section>`;
}

export async function render(view) {
  const [{ items, summary }, reminders, notes, ph, dev] = await Promise.all([
    api.get("/followups"), api.get("/reminders"), api.get("/notifications"),
    api.get("/push/status").catch(() => ({ devices: [] })), deviceState().catch(() => "unsupported"),
  ]);
  const open = items.filter((f) => !f.done);
  const done = items.filter((f) => f.done);

  view.innerHTML = `<div id="fu-root">
    <div class="page-head"><div>
      <div class="eyebrow">Reminders &amp; follow-ups</div>
      <h1>Follow-ups</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${summary.open}</b> open</span>
        <span class="status-chip"><span class="dot" style="--c:#c084fc"></span><b>${summary.waiting}</b> waiting on others</span>
        ${summary.due ? `<span class="status-chip"><span class="dot" style="--c:var(--danger)"></span><b>${summary.due}</b> due</span>` : ""}
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${reminders.length}</b> reminder${reminders.length === 1 ? "" : "s"} set</span>
      </div></div>
      <button class="btn primary" id="fu-add">${icon("plus")} New follow-up</button></div>
    <p class="sub" style="margin:-8px 0 18px;color:var(--text-3)">Tip: tell the AI bar “Follow up with Sarah about the contract Friday at 10” or “Remind me every day at 7am to do my skincare”.</p>
    ${notifyCard(notes, ph, dev)}
    <div class="shop-grid" style="margin-top:16px">
      ${column("todo", open.filter((f) => f.direction === "todo"))}
      ${column("waiting", open.filter((f) => f.direction === "waiting"))}
    </div>
    <div class="fu-lower">
      <section class="card fin-card">
        <header><h2>Upcoming reminders</h2><span class="eyebrow">tasks · routines · follow-ups</span></header>
        ${reminders.length ? `<ul class="fin-list">${reminders.map((r) => `
          <li><div><div class="fin-li-title">${esc(r.title)}</div>
            <div class="fin-li-sub">${KIND_LABEL[r.kind]} · 🔔 ${esc(fmtReminder(r.at))}</div></div>
            <a class="btn small" href="${KIND_LINK[r.kind]}">Open</a>
            <button class="icon-btn danger" data-unremind="${r.kind}:${r.ref_id}" aria-label="Remove reminder">${icon("x")}</button></li>`).join("")}</ul>`
          : `<div class="empty">No reminders yet. Add one when you edit a task, routine or follow-up.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Recent notifications</h2>
          ${notes.unread ? `<button class="btn small" id="n-read">Mark all read</button>` : `<span class="eyebrow">history</span>`}</header>
        ${notes.items.length ? `<ul class="fin-list">${notes.items.slice(0, 12).map((n) => `
          <li class="${n.read_at ? "" : "fu-unread"}"><div><div class="fin-li-title">${esc(n.title)}</div>
            <div class="fin-li-sub">${esc(n.body)}${n.body ? " · " : ""}${esc(fmtDateTime(n.created_at))}</div></div></li>`).join("")}</ul>`
          : `<div class="empty">Nothing yet.</div>`}
      </section>
    </div>
    ${done.length ? `
      <details class="shop-bought">
        <summary>Done <span class="count">${done.length}</span></summary>
        <ul class="shop-list card">${done.map(followupRow).join("")}</ul>
      </details>` : ""}</div>`;

  const root = view.querySelector("#fu-root");
  const refresh = () => render(view);
  const byId = Object.fromEntries(items.map((f) => [f.id, f]));
  root.querySelector("#fu-add").onclick = () => openFollowupEditor({}, refresh);

  root.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return openFollowupEditor({ direction: add.dataset.add }, refresh);
    const un = e.target.closest("[data-unremind]");
    if (un) {
      const [kind, id] = un.dataset.unremind.split(":");
      await api.put(`/reminders/${kind}/${id}`, { at: null });
      toast("Reminder removed");
      return refresh();
    }
    const row = e.target.closest(".fu-item");
    if (row && !e.target.matches(".check") && (e.target.closest("[data-edit]") || e.target.closest(".fu-main"))) {
      openFollowupEditor(byId[row.dataset.id], refresh);
    }
  });
  root.addEventListener("change", async (e) => {
    if (!e.target.matches(".fu-item .check")) return;
    await api.patch(`/followups/${e.target.closest(".fu-item").dataset.id}`, { done: e.target.checked });
    toast(e.target.checked ? "Done ✓" : "Reopened");
    refresh();
  });

  const busy = (btn, text) => { btn.disabled = true; btn.textContent = text; };
  root.querySelector("#n-on")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, "Setting up…");
    try {
      await api.post("/notifications/enable");
      toast("Notifications are on. You should see a test notification now.", 5000);
    } catch (err) { toast(err.message, 9000); }
    refresh();
  });
  root.querySelector("#n-test")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, "Sending…");
    try { await api.post("/notifications/test"); toast("Sent. Look at the bottom-right corner of your screen."); }
    catch (err) { toast(err.message, 9000); }
    refresh();
  });
  root.querySelector("#n-off")?.addEventListener("click", async () => {
    await api.post("/notifications/disable");
    toast("Notifications turned off");
    refresh();
  });
  root.querySelector("#n-desktop").addEventListener("change", async (e) => {
    await api.patch("/notifications/settings", { notify_desktop: e.target.checked });
    toast(e.target.checked ? "Showing on this computer too" : "Phones only");
  });
  root.querySelector("#p-on")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, "Turning on…");
    try {
      const r = await enablePush();
      toast(r.test_sent ? "On! A test notification is on its way." : "On. (The test didn't arrive yet; try “Send a test”.)", 6000);
    } catch (err) { toast(err.message, 9000); }
    refresh();
  });
  root.querySelector("#p-test")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, "Sending…");
    try { await testPush(); toast("Sent. It should arrive in a few seconds."); } catch (err) { toast(err.message, 9000); }
    refresh();
  });
  root.querySelector("#p-off")?.addEventListener("click", async () => {
    await disablePush();
    toast("Phone notifications off for this phone");
    refresh();
  });
  root.querySelectorAll("[data-forget]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Stop sending notifications to this phone?")) return;
      await api.del(`/push/devices/${b.dataset.forget}`);
      refresh();
    };
  });
  root.querySelector("#n-read")?.addEventListener("click", async () => {
    await api.post("/notifications/read");
    refresh();
  });
  root.querySelector("#n-brief").addEventListener("change", async (e) => {
    await api.patch("/notifications/settings", { notify_briefing: e.target.value });
    toast(e.target.value ? `Morning briefing at ${e.target.value}` : "Morning briefing off");
  });
  root.querySelector("#n-budget").addEventListener("change", async (e) => {
    await api.patch("/notifications/settings", { notify_budget: e.target.checked });
    toast(e.target.checked ? "Budget alerts on" : "Budget alerts off");
  });
}

export function openFollowupEditor(f = {}, onChange) {
  const isNew = !f.id;
  let direction = f.direction || "todo";
  const dlg = openDialog({
    title: isNew ? "New follow-up" : "Edit follow-up",
    style: "--area:var(--accent)",
    body: `
      <form id="fu-form" class="dlg-body" style="padding:0">
        <div class="field"><span>Type</span>
          <div class="segmented" id="fu-dir">
            <button type="button" data-dir="todo">I need to…</button>
            <button type="button" data-dir="waiting">Waiting on…</button>
          </div></div>
        <label class="field"><span>What</span>
          <input type="text" name="title" required value="${esc(f.title || "")}" placeholder="e.g. Contract renewal"></label>
        <div class="row">
          <label class="field"><span>With whom (optional)</span>
            <input type="text" name="person" value="${esc(f.person || "")}" placeholder="e.g. Sarah"></label>
          <label class="field"><span>Due date (optional)</span>
            <input type="date" name="due_date" value="${esc(f.due_date || "")}"></label>
        </div>
        <label class="field"><span>Remind me (optional)</span>
          <input type="datetime-local" name="remind_at" value="${esc(f.remind_at || "")}"></label>
        <label class="field"><span>Notes (optional)</span>
          <textarea name="notes" placeholder="Details, what was promised, links…">${esc(f.notes || "")}</textarea></label>
        ${isNew ? "" : `<label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="done" ${f.done ? "checked" : ""}> <span>Done</span></label>`}
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="fu-form">${isNew ? "Add" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  const showDir = () => dlg.querySelectorAll("#fu-dir button").forEach((b) => b.classList.toggle("active", b.dataset.dir === direction));
  dlg.querySelector("#fu-dir").onclick = (e) => { const b = e.target.closest("button"); if (b) { direction = b.dataset.dir; showDir(); } };
  showDir();
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${f.title}”?`)) return;
    await api.del(`/followups/${f.id}`);
    dlg.close();
    toast("Deleted");
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      title: form.title.value.trim(), person: form.person.value.trim(), direction,
      due_date: form.due_date.value || null, notes: form.notes.value.trim(),
      remind_at: form.remind_at.value || null,
    };
    if (!isNew) body.done = form.done.checked;
    try {
      if (isNew) await api.post("/followups", body);
      else await api.patch(`/followups/${f.id}`, body);
      dlg.close();
      toast(isNew ? "Follow-up added" : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}
