// Settings: theme, example data, and command bar status.
import { api } from "../api.js";
import { state } from "../state.js";
import { esc, toast, todayISO } from "../ui.js";
import { getTheme, setTheme } from "../theme.js";
import { checkForUpdates } from "../updates.js";
import { renderPhone } from "./phone.js";

export async function render(view) {
  const [status, version, ai, demo, usage] = await Promise.all([api.get("/command/status"), api.get("/version"),
    api.get("/command/models"), api.get("/demo"), api.get("/command/usage")]);
  const theme = getTheme();
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="settings">
      <section class="card demo-card ${demo.on ? "on" : ""}">
        <h2>${demo.on ? "🎭 Demo mode is on" : "🎭 Demo mode"}</h2>
        <p>${demo.on
          ? `The whole app is showing made-up sample data (a person called Alex Morgan): goals, routines, calendar, email,
             money and follow-ups. Your real data is untouched and comes back the moment you turn this off. Anything you
             change now only changes the demo; nothing is sent, synced or saved to your accounts.`
          : `Show the app to other people without showing your own information. Every page switches to realistic made-up
             data, including a sample calendar, inbox, bank accounts and loans. Your real data stays safe and untouched,
             and nothing in demo mode can email anyone or reach your bank.`}</p>
        <div class="btn-row">
          ${demo.on
            ? `<button class="btn primary" id="demo-off">Turn off demo mode</button>
               <button class="btn" id="demo-reset">Reset the sample data</button>`
            : `<button class="btn primary" id="demo-on">Start demo mode</button>`}
        </div>
      </section>
      <section class="card ph-card" id="phone-settings"><p class="muted">Loading phone settings…</p></section>
      <section class="card" id="ai-models">
        <h2>AI models</h2>
        <p>Pick which Claude model each AI feature uses. Cheaper models cost less per request; more capable ones make
           fewer mistakes on tricky requests. Changes apply to the next request. Your spending is at
           <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> → Usage.</p>
        <div class="ai-roles">${ai.roles.map((r) => `
          <label class="ai-role">
            <span class="ai-role-text"><b>${esc(r.name)}</b><span>${esc(r.what)}</span></span>
            <select data-role="${esc(r.id)}">${ai.models.map((m) => `
              <option value="${esc(m.id)}" ${m.id === r.model ? "selected" : ""}>${esc(m.name)}${m.id === r.default ? " · recommended" : ""}</option>`).join("")}
            </select>
          </label>`).join("")}</div>
        <ul class="ai-notes">${ai.models.map((m) => `<li><b>${esc(m.name)}</b> (${esc(m.price)} per million tokens in / out): ${esc(m.note)}</li>`).join("")}</ul>
      </section>
      <section class="card" id="ai-usage">${usageCard(usage)}</section>
      <section class="card">
        <h2>Appearance</h2>
        <p>Dark is the default command-center look. “System” follows your computer's light/dark setting.</p>
        <div class="segmented" id="theme">
          ${["dark", "light", "system"].map((t) => `<button data-theme="${t}" class="${t === theme ? "active" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
        </div>
      </section>
      <section class="card">
        <h2>Example data</h2>
        <p>The app started with one example goal per area (plus a few tasks) so you can see how it works.
           Clearing them only removes the examples, never anything you created yourself.</p>
        <div class="btn-row">
          <button class="btn danger" id="clear-examples">Clear example data</button>
          <button class="btn" id="load-examples">Load examples again</button>
        </div>
      </section>
      <section class="card">
        <h2>Version & updates</h2>
        <p>${version.version
          ? `Version <code>${esc(version.version)}</code>, installed ${esc(new Date(version.updated_at).toLocaleString())}.<br>Latest change: ${esc(version.summary)}`
          : "Version not recorded yet. It will be after the next automatic update."}</p>
        <p>Every time you open the app from its Desktop icon (and every hour in background mode), it checks GitHub for a newer version.
           Your phone picks up new versions by itself. You can also check right now. Your goals, tasks, routines and keys are never changed by an update.</p>
        <button class="btn" id="settings-update">Check for updates now</button>
      </section>
      <section class="card">
        <h2>Command bar</h2>
        <p>${status.api_key_configured
          ? `✅ API key found.`
          : `⚠️ No API key yet. Put your key in the <code>.env</code> file (see README step 3), then restart the app.`}</p>
        <p>Your data is stored in <code>data/life.db</code> in the project folder, on your own computer.
           When you use the command bar, your sentence plus a list of your goals and tasks is sent to Anthropic's API so Claude can understand it.</p>
      </section>
    </div>`;
  const demoBtn = (id, action, msg) => view.querySelector(id)?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api.post(`/demo/${action}`);
      toast(msg, 3000);
      setTimeout(() => location.reload(), 400); // redraw everything with the other data
    } catch (err) { toast(err.message, 8000); e.currentTarget.disabled = false; }
  });
  demoBtn("#demo-on", "on", "Demo mode on: showing sample data");
  demoBtn("#demo-off", "off", "Demo mode off: back to your data");
  demoBtn("#demo-reset", "reset", "Sample data reset");
  renderPhone(view.querySelector("#phone-settings")).catch((err) => {
    view.querySelector("#phone-settings").innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
  });
  view.querySelectorAll("#ai-models select").forEach((sel) => sel.addEventListener("change", async () => {
    try {
      await api.put("/command/models", { role: sel.dataset.role, model: sel.value });
      toast(`${sel.closest(".ai-role").querySelector("b").textContent} now uses ${sel.selectedOptions[0].textContent.split(" · ")[0]}`);
    } catch (err) { toast(err.message); }
  }));
  bindUsage(view.querySelector("#ai-usage"));
  view.querySelector("#theme").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setTheme(b.dataset.theme);
    render(view);
  });
  view.querySelector("#settings-update").onclick = (e) => checkForUpdates(e.currentTarget);
  view.querySelector("#clear-examples").addEventListener("click", async () => {
    if (!confirm("Remove all example goals and tasks?")) return;
    const r = await api.post("/examples/clear");
    toast(`Removed ${r.removed} example item${r.removed === 1 ? "" : "s"}`);
  });
  view.querySelector("#load-examples").addEventListener("click", async () => {
    await api.post("/examples/load");
    toast("Examples added");
  });
}


// ---------- AI usage & cost ----------
const usd = (n, digits = 2) => `$${(n ?? 0).toFixed(digits)}`;
const cents = (n) => (n < 0.01 ? `${(n * 100).toFixed(1)}¢` : n < 1 ? `${(n * 100).toFixed(0)}¢` : usd(n));

function usageCard(u) {
  const c = u.credits;
  const maxDay = Math.max(0.0001, ...u.daily.map((d) => d.cost));
  const pct = c ? Math.max(0, Math.min(100, (c.left / c.amount) * 100)) : 0;
  return `
    <h2>AI usage &amp; cost</h2>
    <p>What the AI features have cost, worked out from the tokens each request used at Anthropic's list prices.
      These are close estimates; your exact bill is at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> → Usage.
      ${u.first_recorded ? `Counting since ${esc(new Date(u.first_recorded).toLocaleDateString())}.` : "Counting starts with your next AI request."}</p>
    <div class="use-stats">
      <div><span class="eyebrow">Today</span><b>${usd(u.today.cost)}</b><small>${u.today.requests} request${u.today.requests === 1 ? "" : "s"}</small></div>
      <div><span class="eyebrow">This month</span><b>${usd(u.month.cost)}</b><small>${u.month.requests} requests</small></div>
      <div><span class="eyebrow">Projected month</span><b>${usd(u.month_projection)}</b><small>at this pace</small></div>
      <div><span class="eyebrow">Last month</span><b>${usd(u.last_month.cost)}</b><small>${u.last_month.requests} requests</small></div>
    </div>
    <div class="use-credits">
      ${c ? `<div class="use-credit-line"><b>≈ ${usd(Math.max(0, c.left))} left</b> of ${usd(c.amount)} added ${esc(new Date(c.since + "T12:00").toLocaleDateString())}
          · ${usd(c.used)} used${c.days_left != null ? ` · lasts about <b>${c.days_left} more day${c.days_left === 1 ? "" : "s"}</b> at your recent pace (${cents(u.per_day)}/day)` : ""}</div>
        <div class="progress use-bar" role="progressbar" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct.toFixed(1)}%"></span></div>`
      : `<p class="muted small" style="margin:0 0 8px">Tell the app how much credit you bought to see roughly what's left and how long it will last.</p>`}
      <form class="use-credit-form" id="credit-form">
        <label class="field"><span>Credits added ($)</span><input type="number" name="amount" min="0" step="1" value="${c ? c.amount : ""}" placeholder="e.g. 5"></label>
        <label class="field"><span>On</span><input type="date" name="since" value="${c ? esc(c.since) : todayISO()}"></label>
        <button class="btn small" type="submit">Save</button>
        ${c ? `<button class="btn small" type="button" id="credit-clear">Clear</button>` : ""}
      </form>
    </div>
    ${u.roles.length ? `
      <h3 class="ph-sub">This month by feature</h3>
      <table class="use-table"><thead><tr><th>Feature</th><th>Requests</th><th>Per request</th><th>Total</th></tr></thead>
        <tbody>${u.roles.map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${r.requests}</td>
          <td class="mono">${cents(r.avg_cost)}</td><td class="mono">${usd(r.cost)}</td></tr>`).join("")}</tbody></table>
      <p class="fin-fine">By model: ${u.models.map((m) => `${esc(m.model)} ${usd(m.cost)} (${m.requests})`).join(" · ")}</p>` : ""}
    <h3 class="ph-sub">Last 30 days</h3>
    <div class="use-days" role="img" aria-label="AI cost per day, last 30 days">${u.daily.map((d) => `
      <span title="${esc(new Date(d.date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))}: ${usd(d.cost, 3)} · ${d.requests} requests">
        <i style="height:${d.cost ? Math.max(3, (d.cost / maxDay) * 100).toFixed(1) : 0}%"></i></span>`).join("")}</div>
    <div class="use-days-axis"><span>${esc(new Date(u.daily[0].date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span>
      <span>busiest day ${usd(maxDay < 0.001 ? 0 : maxDay, 3)}</span><span>today</span></div>`;
}

function bindUsage(box) {
  const redraw = (u) => { box.innerHTML = usageCard(u); bindUsage(box); };
  box.querySelector("#credit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.amount.value) return toast("Enter the amount you added");
    try { redraw(await api.put("/command/usage/credits", { amount: Number(f.amount.value), since: f.since.value || null })); toast("Saved"); }
    catch (err) { toast(err.message); }
  });
  box.querySelector("#credit-clear")?.addEventListener("click", async () => {
    redraw(await api.put("/command/usage/credits", { amount: null }));
  });
}
