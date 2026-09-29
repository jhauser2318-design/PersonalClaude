// Finances → Rules: plain-English rules the AI follows.
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc, openDialog, showError, toast } from "../../ui.js";
import { chips, renderTab } from "../finances.js";
import { money, ui } from "./common.js";

// ===========================================================================
// Rules: plain-English rules the AI follows
// ===========================================================================

const RULE_EXAMPLES = [
  "Zelle payments to Mike are my rent (Housing).",
  "Transfers to my Capital One 360 Savings are savings, not spending (Transfer).",
  "Venmo payments under $30 are usually food with friends (Dining & Coffee).",
  "Anything from Evergy or Spire is Utilities & Phone.",
  "Amazon orders are Shopping unless the description mentions Whole Foods (then Groceries).",
];

export async function renderRules(box, root) {
  const data = await api.get("/finances/rules");
  box.innerHTML = `
    <section class="card fin-card">
      <header><h2>Your rules</h2><span class="eyebrow">plain English · followed by the AI</span></header>
      <p class="fin-fine" style="margin-top:0">Write rules the way you'd explain them to a person. The AI follows them when it sorts
        transactions into categories and when it answers your money questions. Your own one-off fixes on the Transactions tab
        still win. You can also tell the AI bar: “Always put Venmo to Mike in Housing”.</p>
      <form id="rule-form" class="fin-rule-form">
        <textarea name="text" rows="2" placeholder="e.g. Zelle payments to Mike are my rent (Housing)." required>${esc(ui.ruleDraft)}</textarea>
        <button class="btn primary" type="submit">${icon("plus")} Add rule</button>
      </form>
      <div class="chips fin-rule-examples">${RULE_EXAMPLES.map((x) => `<button class="chip" data-example="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    </section>
    <section class="card fin-card" style="margin-top:14px">
      <header><h2>${data.rules.length} rule${data.rules.length === 1 ? "" : "s"}</h2>
        <button class="btn small ${ui.rulesChanged ? "primary" : ""}" id="rules-apply" ${data.resorting ? "disabled" : ""}>
          ${icon("refresh")} ${data.resorting ? "Re-sorting…" : "Re-sort past transactions with my rules"}</button></header>
      ${ui.rulesChanged ? `<p class="fin-fine" style="margin-top:0">New transactions always follow your rules. To apply changes to transactions you already have, click Re-sort.</p>` : ""}
      ${data.rules.length ? `<ul class="fin-list fin-rules">${data.rules.map((r) => `
        <li class="${r.enabled ? "" : "is-hidden"}" data-rule="${r.id}">
          <input type="checkbox" class="fin-rule-on" ${r.enabled ? "checked" : ""} aria-label="Rule on">
          <div class="fin-rule-text">${esc(r.text)}</div>
          <button class="icon-btn" data-edit-rule aria-label="Edit rule">${icon("edit")}</button>
          <button class="icon-btn danger" data-del-rule aria-label="Delete rule">${icon("trash")}</button></li>`).join("")}</ul>`
        : `<div class="empty">No rules yet. Add one above or pick an example to start from.</div>`}
    </section>`;
  const form = box.querySelector("#rule-form");
  const changed = (msg) => { ui.rulesChanged = true; ui.ruleDraft = ""; toast(msg); renderTab(root); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api.post("/finances/rules", { text: form.text.value }); changed("Rule added"); }
    catch (err) { showError(form, err); }
  });
  form.text.addEventListener("input", () => { ui.ruleDraft = form.text.value; });
  box.querySelectorAll("[data-example]").forEach((b) => b.addEventListener("click", () => {
    form.text.value = b.dataset.example; ui.ruleDraft = b.dataset.example; form.text.focus();
  }));
  box.querySelectorAll("[data-rule]").forEach((li) => {
    const id = li.dataset.rule;
    const rule = data.rules.find((r) => String(r.id) === id);
    li.querySelector(".fin-rule-on").addEventListener("change", async (e) => {
      await api.patch(`/finances/rules/${id}`, { enabled: e.target.checked });
      changed(e.target.checked ? "Rule on" : "Rule paused");
    });
    li.querySelector("[data-del-rule]").addEventListener("click", async () => {
      if (!confirm(`Delete this rule?\n\n${rule.text}`)) return;
      await api.del(`/finances/rules/${id}`);
      changed("Rule deleted");
    });
    li.querySelector("[data-edit-rule]").addEventListener("click", () => {
      const dlg = openDialog({
        title: "Edit rule",
        body: `<form id="rule-edit" class="dlg-body" style="padding:0"><textarea name="text" rows="3" required>${esc(rule.text)}</textarea></form>`,
        foot: `<div class="right"><button class="btn" data-close>Cancel</button><button class="btn primary" type="submit" form="rule-edit">Save</button></div>`,
      });
      const f = dlg.querySelector("form");
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api.patch(`/finances/rules/${id}`, { text: f.text.value }); dlg.close(); changed("Rule saved"); }
        catch (err) { showError(f, err); }
      });
    });
  });
  box.querySelector("#rules-apply").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `${icon("loader")} Re-sorting… (can take a minute)`;
    try {
      const r = await api.post("/finances/rules/apply");
      toast(r.busy ? "Already re-sorting in the background" : `Re-sorted ${r.sorted} merchant${r.sorted === 1 ? "" : "s"} with your rules`, 5000);
      ui.rulesChanged = false;
    } catch (err) { toast(err.message, 8000); }
    renderTab(root);
  });
}
