// Placeholder page for modules that will be built in later phases.
import { icon } from "../icons.js";
import { esc } from "../ui.js";

export function render(view, module) {
  view.innerHTML = `
    <div class="soon-page">
      <div class="soon-icon">${icon(module.icon)}</div>
      <h1>${esc(module.label)}</h1>
      <p>${esc(module.blurb)}</p>
      <p><span class="pill">Coming in a future phase</span></p>
    </div>`;
}
