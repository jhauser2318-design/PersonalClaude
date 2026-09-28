// Settings: theme, example data, and command bar status.
import { api } from "../api.js";
import { state } from "../state.js";
import { esc, toast } from "../ui.js";
import { getTheme, setTheme } from "../theme.js";
import { checkForUpdates } from "../updates.js";
import { renderPhone } from "./phone.js";

export async function render(view) {
  const [status, version, ai, demo] = await Promise.all([api.get("/command/status"), api.get("/version"),
    api.get("/command/models"), api.get("/demo")]);
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
