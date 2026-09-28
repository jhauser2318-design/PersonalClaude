// "Check for updates" (sidebar and Settings) and keeping open windows current.
import { api } from "./api.js";
import { toast } from "./ui.js";

export const updateState = { installing: false };

export async function checkForUpdates(button) {
  if (updateState.installing) return;
  const label = button?.innerHTML;
  if (button) { button.disabled = true; button.textContent = "Checking…"; }
  try {
    const r = await api.post("/app/update");
    if (r.error) toast(r.error, 8000);
    else if (r.updated) {
      updateState.installing = true;
      const box = document.getElementById("offline-notice");
      box.textContent = `Update installed (${r.summary || r.version}). Restarting the app…`;
      box.hidden = false;
      return; // the window refreshes itself when the new version is running
    } else toast(`You're up to date${r.version ? ` (version ${r.version})` : ""}.`);
  } catch (e) {
    toast(e.message, 8000);
  }
  if (button) { button.disabled = false; button.innerHTML = label; }
}
