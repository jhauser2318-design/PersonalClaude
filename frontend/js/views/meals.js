// Meal planning: a week of meals, a recipe box, and one click to put the
// week's ingredients on the shopping list (as needs).
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, openDialog, showError, toast, todayISO } from "../ui.js";

const SLOT_ICON = { breakfast: "🍳", lunch: "🥪", dinner: "🍽", snack: "🍎" };
let weekStart = null;

function shift(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1, d + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const dayLabel = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export async function render(view) {
  const w = await api.get(`/meals${weekStart ? `?start=${weekStart}` : ""}`);
  weekStart = w.start;
  const byDay = Object.fromEntries(w.days.map((d) => [d, w.meals.filter((m) => m.date === d)]));
  const today = todayISO();
  view.innerHTML = `<div id="meal-root">
    <div class="page-head"><div>
      <div class="eyebrow">Health · food</div>
      <h1>Meals</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${w.meals.length}</b> meals planned</span>
        <span class="status-chip"><span class="dot" style="--c:var(--accent)"></span><b>${w.recipes.length}</b> recipes</span>
      </div></div>
      <button class="btn" id="rc-add">${icon("plus")} New recipe</button></div>
    <div class="sched-nav card">
      <button class="icon-btn" id="mw-prev" aria-label="Previous week">‹</button>
      <div class="sched-day"><b>Week of ${esc(dayLabel(w.start))}</b></div>
      <button class="icon-btn" id="mw-next" aria-label="Next week">›</button>
      ${today < w.start || today > w.end ? `<button class="btn small" id="mw-this">This week</button>` : ""}
    </div>
    <div class="meal-week">${w.days.map((d) => `
      <section class="card meal-day ${d === today ? "is-today" : ""}">
        <header><b>${esc(dayLabel(d))}</b><button class="icon-btn" data-add="${d}" aria-label="Add a meal">${icon("plus")}</button></header>
        ${byDay[d].length ? `<ul>${byDay[d].sort((a, b) => w.slots.indexOf(a.slot) - w.slots.indexOf(b.slot)).map((m) => `
          <li data-meal="${m.id}"><span class="meal-slot" title="${m.slot}">${SLOT_ICON[m.slot]}</span><span>${esc(m.title)}${m.recipe_id ? "" : ` <span class="muted small">(no recipe)</span>`}</span></li>`).join("")}</ul>`
          : `<div class="muted small meal-empty">Nothing planned</div>`}
      </section>`).join("")}</div>
    <div class="fin-grid" style="margin-top:14px">
      <section class="card fin-card">
        <header><h2>This week's ingredients</h2><span class="eyebrow">from planned recipes</span></header>
        ${w.ingredients.length ? `<ul class="meal-ingredients">${w.ingredients.map((i) => `
          <li><label><input type="checkbox" checked value="${esc(i)}"> ${esc(i)}</label></li>`).join("")}</ul>
          <div class="fin-card-foot"><button class="btn primary small" id="to-shop">${icon("cart")} Add checked to shopping needs</button></div>`
          : `<div class="empty">Plan meals from recipes and their ingredients show up here.</div>`}
      </section>
      <section class="card fin-card">
        <header><h2>Recipes</h2></header>
        ${w.recipes.length ? `<ul class="fin-list">${w.recipes.map((r) => `
          <li><div><div class="fin-li-title">${esc(r.name)}</div>
            <div class="fin-li-sub">${r.ingredients.length} ingredient${r.ingredients.length === 1 ? "" : "s"}${r.minutes ? ` · ${r.minutes} min` : ""}</div></div>
            <button class="icon-btn" data-recipe="${r.id}" aria-label="Edit recipe">${icon("edit")}</button></li>`).join("")}</ul>`
          : `<div class="empty">No recipes yet. Add the meals you make often.</div>`}
      </section>
    </div></div>`;

  const root = view.querySelector("#meal-root");
  const refresh = () => render(view);
  root.querySelector("#mw-prev").onclick = () => { weekStart = shift(w.start, -7); refresh(); };
  root.querySelector("#mw-next").onclick = () => { weekStart = shift(w.start, 7); refresh(); };
  root.querySelector("#mw-this")?.addEventListener("click", () => { weekStart = null; refresh(); });
  root.querySelector("#rc-add").onclick = () => openRecipe({}, refresh);
  root.querySelector("#to-shop")?.addEventListener("click", async () => {
    const items = [...root.querySelectorAll(".meal-ingredients input:checked")].map((i) => i.value);
    if (!items.length) return;
    const r = await api.post("/meals/shopping", { start: w.start, items });
    toast(`${r.added.length} added to your shopping needs${r.skipped.length ? ` · ${r.skipped.length} already on the list` : ""}`, 4000);
  });
  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return openMeal({ date: add.dataset.add, slot: "dinner" }, w, refresh);
    const m = e.target.closest("[data-meal]");
    if (m) return openMeal(w.meals.find((x) => x.id === Number(m.dataset.meal)), w, refresh);
    const r = e.target.closest("[data-recipe]");
    if (r) return openRecipe(w.recipes.find((x) => x.id === Number(r.dataset.recipe)), refresh);
  });
}

function openMeal(m, w, onChange) {
  const isNew = !m.id;
  const dlg = openDialog({
    title: isNew ? `Meal · ${esc(dayLabel(m.date))}` : "Edit meal", style: "--area:#34d399",
    body: `<form id="m-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Meal</span><select name="slot">${w.slots.map((s) => `<option value="${s}" ${s === m.slot ? "selected" : ""}>${SLOT_ICON[s]} ${s}</option>`).join("")}</select></label>
        <label class="field"><span>Day</span><input type="date" name="date" value="${esc(m.date)}"></label>
      </div>
      <label class="field"><span>Recipe</span><select name="recipe_id"><option value="">No recipe (just a name)</option>${w.recipes.map((r) =>
        `<option value="${r.id}" ${r.id === m.recipe_id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Name</span><input type="text" name="title" value="${esc(m.title || "")}" placeholder="Filled from the recipe, or e.g. Leftovers, Eating out"></label>
      <label class="field"><span>Notes</span><input type="text" name="notes" value="${esc(m.notes || "")}"></label>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Remove</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="m-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.recipe_id.onchange = () => {
    const r = w.recipes.find((x) => x.id === Number(form.recipe_id.value));
    if (r) form.title.value = r.name;
  };
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    await api.del(`/meals/${m.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { date: form.date.value, slot: form.slot.value, title: form.title.value,
      recipe_id: form.recipe_id.value ? Number(form.recipe_id.value) : null, notes: form.notes.value };
    try {
      if (isNew) await api.post("/meals", body);
      else await api.patch(`/meals/${m.id}`, body);
      dlg.close();
      onChange();
    } catch (err) { showError(form, err); }
  });
}

function openRecipe(r, onChange) {
  const isNew = !r.id;
  const dlg = openDialog({
    title: isNew ? "New recipe" : "Edit recipe", style: "--area:#34d399",
    body: `<form id="r-form" class="dlg-body" style="padding:0">
      <div class="row">
        <label class="field"><span>Name</span><input type="text" name="name" required value="${esc(r.name || "")}" placeholder="e.g. Chicken rice bowls"></label>
        <label class="field"><span>Minutes (optional)</span><input type="number" name="minutes" min="0" value="${r.minutes || ""}"></label>
      </div>
      <label class="field"><span>Ingredients · one per line</span><textarea name="ingredients" rows="6" placeholder="Chicken breast&#10;Rice&#10;Broccoli">${esc((r.ingredients || []).join("\n"))}</textarea></label>
      <label class="field"><span>Steps (optional)</span><textarea name="steps">${esc(r.steps || "")}</textarea></label>
      <label class="field"><span>Link (optional)</span><input type="text" name="url" inputmode="url" value="${esc(r.url || "")}"></label>
    </form>`,
    foot: `${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Delete</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="r-form">Save</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.name.focus();
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Delete the recipe “${r.name}”? Planned meals keep their name.`)) return;
    await api.del(`/meals/recipes/${r.id}`);
    dlg.close();
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: form.name.value, ingredients: form.ingredients.value, steps: form.steps.value, url: form.url.value,
      minutes: form.minutes.value ? Number(form.minutes.value) : null };
    try {
      if (isNew) await api.post("/meals/recipes", body);
      else await api.patch(`/meals/recipes/${r.id}`, body);
      dlg.close();
      toast("Recipe saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
}
