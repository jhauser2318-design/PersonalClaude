// Finances → Budgets.
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, toast } from "../../ui.js";
import { kpi, renderTab } from "../finances.js";
import { catColor, money, monthLabel } from "./common.js";

// ===========================================================================
// Budgets
// ===========================================================================

export async function renderBudgets(box, root) {
  const data = await api.get("/finances/budgets");
  const m = data.month;
  const spent = Object.fromEntries(m.categories.map((r) => [r.category, r.spent]));
  const pace = m.day / m.days;
  const total = Object.values(data.budgets).reduce((s, v) => s + v, 0);
  const hasSuggestions = Object.keys(data.suggested).some((c) => !data.budgets[c]);
  box.innerHTML = `
    <div class="fin-budget-head card">
      <div><div class="eyebrow">${esc(monthLabel(m.month))} · day ${m.day} of ${m.days}</div>
        <div class="fin-kpi-value">${money(m.budgeted_spent, false)} <small>of ${money(total, false)} budgeted</small></div>
        <div class="fin-fine">Monthly budgets repeat every month. Leave a category empty for no budget.
          Income so far this month: ${money(m.income, false)}.</div></div>
      ${hasSuggestions ? `<button class="btn" id="fin-suggest">${icon("sparkle")} Fill in from my average spending</button>` : ""}
    </div>
    <ul class="card fin-budgets">${data.categories.map((c) => {
      const b = data.budgets[c];
      const s = spent[c] || 0;
      const pct = b ? Math.min(100, (s / b) * 100) : 0;
      const state = b && s > b ? "over" : b && s > b * pace * 1.1 ? "ahead" : "";
      return `
        <li class="${state}" style="--c:${catColor(c)}">
          <div class="fin-b-name"><span class="dot"></span>${esc(c)}</div>
          <div class="fin-b-bar">${b ? `<span style="width:${pct.toFixed(1)}%"></span><i style="left:${(pace * 100).toFixed(1)}%"></i>` : ""}</div>
          <div class="fin-b-spent mono">${money(s, false)}${b ? `<small> ${state === "over" ? `over by ${money(s - b, false)}` : `${money(b - s, false)} left`}</small>` : ""}</div>
          <label class="fin-b-input"><span>$</span><input type="number" min="0" step="10" data-budget="${esc(c)}" value="${b ?? ""}"
            placeholder="${data.suggested[c] ? data.suggested[c] : "–"}" aria-label="Monthly budget for ${esc(c)}"></label>
        </li>`;
    }).join("")}</ul>
    <p class="fin-fine">Ask the AI bar things like “Set my dining budget to $300” or “Am I on track this month?”. The faint tick on each bar is where you'd be on pace today.</p>`;
  box.querySelectorAll("[data-budget]").forEach((inp) => {
    inp.addEventListener("change", async () => {
      try {
        await api.put(`/finances/budgets/${encodeURIComponent(inp.dataset.budget)}`,
          { amount: inp.value === "" ? null : Number(inp.value) });
        toast("Budget saved");
        renderTab(root);
      } catch (err) { toast(err.message); }
    });
  });
  box.querySelector("#fin-suggest")?.addEventListener("click", async () => {
    for (const [c, v] of Object.entries(data.suggested)) {
      if (!data.budgets[c]) await api.put(`/finances/budgets/${encodeURIComponent(c)}`, { amount: v });
    }
    toast("Budgets filled in from your average monthly spending. Adjust any you like.", 5000);
    renderTab(root);
  });
}
