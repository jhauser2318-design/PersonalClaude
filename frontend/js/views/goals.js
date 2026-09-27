// Goals screen: every goal as a card, filterable by area.
import { api } from "../api.js";
import { bindGoals, goalGrid, openGoalEditor } from "../components.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { esc } from "../ui.js";

let areaFilter = "";

export function areaChips(selected) {
  return `<div class="chips" role="tablist">
    <button class="chip ${selected ? "" : "active"}" data-area="" role="tab">All</button>
    ${state.areas.map((a) => `<button class="chip ${selected === a.id ? "active" : ""}" data-area="${a.id}" style="--area:${a.color}" role="tab">
      <span class="dot"></span>${esc(a.name)}</button>`).join("")}
  </div>`;
}

export async function render(view) {
  const goals = await api.get(`/goals${areaFilter ? `?area=${areaFilter}` : ""}`);
  const active = goals.filter((g) => g.status !== "done");
  const done = goals.filter((g) => g.status === "done");
  view.innerHTML = `
    <div class="page-head"><div><h1>Goals</h1>
      <p class="sub">${active.length} active · ${done.length} completed</p></div>
      <button class="btn primary" id="new-goal">${icon("plus")} New goal</button></div>
    <div class="toolbar">${areaChips(areaFilter)}</div>
    <div id="goals">${goalGrid(active, "No active goals here yet. Click “New goal”, or type e.g. “New health goal: run a 5K by March”.")}
      ${done.length ? `<h2 class="section">Completed <span class="count">${done.length}</span></h2>${goalGrid(done)}` : ""}
    </div>`;
  view.querySelector(".chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    areaFilter = chip.dataset.area;
    render(view);
  });
  view.querySelector("#new-goal").addEventListener("click", () => openGoalEditor({ area: areaFilter || undefined }));
  bindGoals(view.querySelector("#goals"));
}
