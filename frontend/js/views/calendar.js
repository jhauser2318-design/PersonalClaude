// Calendar page: your Google Calendar for the week, next to tasks that are due.
// If Google Calendar isn't connected yet, it shows the setup steps instead.
import { api } from "../api.js";
import { bindTasks } from "../components.js";
import { icon } from "../icons.js";
import { areaStyle, esc, openDialog, showError, toast, todayISO } from "../ui.js";

let weekStart = null; // Monday of the week being shown

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(iso) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function dayLabel(iso, opts) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
}

// A compact task line for the narrow day columns (checkbox + title).
function dayTask(t) {
  return `<li class="task" data-task-id="${t.id}" style="${areaStyle(t.area)}" title="Task due this day">
    <input type="checkbox" class="check" aria-label="Mark “${esc(t.title)}” as done">
    <div class="t-main"><div class="t-title">${esc(t.title)}</div></div>
  </li>`;
}

export function eventTime(e) {
  if (e.all_day) return "All day";
  return `${e.start.slice(11, 16)}–${e.end.slice(11, 16)}`;
}

export async function render(view) {
  const status = await api.get("/calendar/status");
  if (!status.connected) return renderSetup(view, status);

  weekStart = weekStart || mondayOf(todayISO());
  const [cal, tasks] = await Promise.all([
    api.get(`/calendar/events?start=${weekStart}&days=7`),
    api.get("/tasks"),
  ]);
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const today = todayISO();
  const range = `${dayLabel(days[0], { month: "short", day: "numeric" })} – ${dayLabel(days[6], { month: "short", day: "numeric", year: "numeric" })}`;
  const openTasks = tasks.filter((t) => !t.done && t.due_date);

  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Google Calendar${cal.time_zone ? ` · ${esc(cal.time_zone)}` : ""}</div>
      <h1>Calendar</h1>
      <p class="sub mono">${esc(range)}</p></div>
      <div class="btn-row">
        <button class="btn" id="prev-week" aria-label="Previous week">‹</button>
        <button class="btn" id="this-week">Today</button>
        <button class="btn" id="next-week" aria-label="Next week">›</button>
        <button class="btn primary" id="new-event">${icon("plus")} New event</button>
      </div></div>
    <div class="week" id="week">
      ${days.map((d) => {
        const evs = cal.events.filter((e) => e.date <= d && e.end.slice(0, 10) >= d);
        const due = openTasks.filter((t) => t.due_date === d);
        return `
        <section class="card day ${d === today ? "is-today" : ""} ${d < today ? "is-past" : ""}" data-day="${d}">
          <header class="day-head">
            <span class="eyebrow">${esc(dayLabel(d, { weekday: "short" }))}</span>
            <span class="day-num">${esc(dayLabel(d, { day: "numeric" }))}</span>
            <button class="icon-btn" data-add-day="${d}" aria-label="Add event on ${esc(dayLabel(d, { weekday: "long" }))}">${icon("plus")}</button>
          </header>
          ${evs.map((e) => `
            <button class="event ${e.all_day ? "all-day" : ""}" data-event-id="${esc(e.id)}">
              <span class="ev-time">${esc(eventTime(e))}</span>
              <span class="ev-title">${esc(e.title)}</span>
              ${e.location ? `<span class="ev-loc">${esc(e.location)}</span>` : ""}
            </button>`).join("")}
          ${due.length ? `<ul class="task-list day-tasks">${due.map(dayTask).join("")}</ul>` : ""}
          ${!evs.length && !due.length ? `<div class="day-empty">Free</div>` : ""}
        </section>`;
      }).join("")}
    </div>
    <div class="cal-foot">
      <span class="mono">Changes sync to Google Calendar (and your phone) right away.</span>
      <button class="btn small" id="disconnect">Disconnect Google Calendar</button>
    </div>`;

  const byId = Object.fromEntries(cal.events.map((e) => [e.id, e]));
  const shift = (n) => { weekStart = addDays(weekStart, n); render(view); };
  view.querySelector("#prev-week").onclick = () => shift(-7);
  view.querySelector("#next-week").onclick = () => shift(7);
  view.querySelector("#this-week").onclick = () => { weekStart = mondayOf(todayISO()); render(view); };
  view.querySelector("#new-event").onclick = () => openEventEditor({ date: today >= days[0] && today <= days[6] ? today : days[0] }, () => render(view));
  view.querySelector("#week").addEventListener("click", (e) => {
    const ev = e.target.closest("[data-event-id]");
    if (ev) return openEventEditor(byId[ev.dataset.eventId], () => render(view));
    const add = e.target.closest("[data-add-day]");
    if (add) openEventEditor({ date: add.dataset.addDay }, () => render(view));
  });
  bindTasks(view.querySelector("#week"), openTasks, () => render(view));
  view.querySelector("#disconnect").onclick = async () => {
    if (!confirm("Disconnect Google Calendar? Your events stay in Google; the app just stops showing and changing them.")) return;
    await api.post("/calendar/disconnect");
    toast("Google Calendar disconnected");
    render(view);
  };
}

// ---------- Setup (not connected yet) ----------
function renderSetup(view, status) {
  view.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Google Calendar · not connected</div>
      <h1>Calendar</h1>
      <p class="sub">Connect your Google Calendar once, and your events show up here. The AI bar can then schedule, move and cancel events for you.</p>
    </div></div>
    ${status.last_error ? `<div class="notice" style="margin:0 0 16px">${esc(status.last_error)}</div>` : ""}
    <div class="settings">
      <section class="card">
        <h2>1 · Create your Google connection (one time, ~10 minutes)</h2>
        <p>Google needs you to register this app in your own Google Cloud account. It's free. The README has the same steps in more detail.</p>
        <ol class="steps">
          <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a>, signed in as the Google account whose calendar you want. Create a project named <b>Life Control Center</b>.</li>
          <li>Search for <b>Google Calendar API</b> and click <b>Enable</b>.</li>
          <li>Open <b>Google Auth Platform</b> (called “OAuth consent screen” in some versions) → <b>Get started</b>. App name: Life Control Center. Audience: <b>External</b>. Add your email where asked.</li>
          <li>Under <b>Audience</b>, click <b>Publish app</b>. (Left in “Testing”, Google makes you reconnect every 7 days.)</li>
          <li>Under <b>Clients</b>, click <b>Create client</b>. Type: <b>Web application</b>. Under <b>Authorized redirect URIs</b>, add exactly:
            <div class="copy-row"><code id="redirect">${esc(status.redirect_uri)}</code><button class="btn small" id="copy">Copy</button></div></li>
          <li>Click <b>Create</b>, then <b>Download JSON</b>.</li>
        </ol>
      </section>
      <section class="card">
        <h2>2 · Upload the file you downloaded</h2>
        <p>${status.client_configured ? "✅ Client file saved. You can upload a new one to replace it." : "It's named something like <code>client_secret_….json</code>, in your Downloads folder."}</p>
        <input type="file" id="client-file" accept=".json,application/json">
      </section>
      <section class="card">
        <h2>3 · Connect</h2>
        <p>You'll sign in to Google and approve access to your calendar events. Google may warn that it “hasn't verified this app”. That's expected, because it's your own app: click <b>Advanced</b> → <b>Go to Life Control Center</b>.</p>
        <button class="btn primary" id="connect" ${status.client_configured ? "" : "disabled"}>${icon("calendar")} Connect Google Calendar</button>
      </section>
    </div>`;
  view.querySelector("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText(status.redirect_uri); toast("Copied"); }
    catch (e) { toast("Select the address and copy it with Ctrl+C"); }
  };
  view.querySelector("#client-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await api.post("/calendar/client", { text: await file.text() });
      toast("Client file saved");
      render(view);
    } catch (err) { toast(err.message); }
  };
  view.querySelector("#connect").onclick = async () => {
    try {
      const { url } = await api.get("/calendar/connect");
      location.href = url; // Google's sign-in page; it sends you back here afterwards
    } catch (err) { toast(err.message); }
  };
}

// ---------- Add / edit an event ----------
export function openEventEditor(ev, onChange) {
  const isNew = !ev.id;
  const allDay = !!ev.all_day;
  const date = ev.date || todayISO();
  const startTime = ev.start && !allDay ? ev.start.slice(11, 16) : "09:00";
  const endTime = ev.end && !allDay ? ev.end.slice(11, 16) : "10:00";
  const endDate = allDay ? ev.end.slice(0, 10) : date;
  const dlg = openDialog({
    title: isNew ? "New event" : "Edit event",
    style: "--area:var(--accent-2)",
    body: `
      <form id="event-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Title</span>
          <input type="text" name="title" required value="${esc(ev.title || "")}" placeholder="e.g. CPA study block"></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" name="all_day" ${allDay ? "checked" : ""}> <span>All day</span></label>
        <div class="row">
          <label class="field"><span>Date</span><input type="date" name="date" required value="${esc(date)}"></label>
          <label class="field" data-allday><span>Last day</span><input type="date" name="end_date" value="${esc(endDate)}"></label>
          <div class="row" data-timed style="gap:8px">
            <label class="field"><span>Start</span><input type="time" name="start_time" value="${esc(startTime)}"></label>
            <label class="field"><span>End</span><input type="time" name="end_time" value="${esc(endTime)}"></label>
          </div>
        </div>
        <label class="field"><span>Location (optional)</span><input type="text" name="location" value="${esc(ev.location || "")}"></label>
        <label class="field"><span>Notes (optional)</span><textarea name="description">${esc(ev.description || "")}</textarea></label>
        ${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener" class="mono" style="font-size:12px">Open in Google Calendar ↗</a>` : ""}
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="event-form">${isNew ? "Add to calendar" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  const syncAllDay = () => {
    const on = form.all_day.checked;
    dlg.querySelector("[data-allday]").hidden = !on;
    dlg.querySelector("[data-timed]").hidden = on;
  };
  form.all_day.onchange = syncAllDay;
  syncAllDay();
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete “${ev.title}” from your Google Calendar?`)) return;
    try {
      await api.del(`/calendar/events/${encodeURIComponent(ev.id)}`);
      dlg.close();
      toast("Event deleted");
      onChange();
    } catch (err) { toast(err.message); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const on = form.all_day.checked;
    const body = {
      title: form.title.value.trim(),
      start: on ? form.date.value : `${form.date.value}T${form.start_time.value}`,
      end: on ? (form.end_date.value || form.date.value) : `${form.date.value}T${form.end_time.value}`,
      location: form.location.value.trim(),
      description: form.description.value.trim(),
    };
    try {
      if (isNew) await api.post("/calendar/events", body);
      else await api.patch(`/calendar/events/${encodeURIComponent(ev.id)}`, body);
      dlg.close();
      toast(isNew ? "Added to your calendar" : "Event saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  form.title.focus();
}
