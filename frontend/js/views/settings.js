// Settings: theme, example data, and command bar status.
import { api } from "../api.js";
import { state } from "../state.js";
import { esc, toast } from "../ui.js";
import { getTheme, setTheme } from "../theme.js";
import { checkForUpdates } from "../updates.js";

export async function render(view) {
  const [status, version] = await Promise.all([api.get("/command/status"), api.get("/version")]);
  const theme = getTheme();
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="settings">
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
        <p>Every time you open the app from its Desktop icon, it checks GitHub for a newer version first.
           You can also check right now. Your goals, tasks, routines and keys are never changed by an update.</p>
        <button class="btn" id="settings-update">Check for updates now</button>
      </section>
      <section class="card">
        <h2>Command bar</h2>
        <p>${status.api_key_configured
          ? `✅ API key found. Using model <code>${esc(status.model)}</code>.`
          : `⚠️ No API key yet. Put your key in the <code>.env</code> file (see README step 3), then restart the app.`}</p>
        <p>Your data is stored in <code>data/life.db</code> in the project folder, on your own computer.
           When you use the command bar, your sentence plus a list of your goals and tasks is sent to Anthropic's API so Claude can understand it.</p>
      </section>
    </div>`;
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
