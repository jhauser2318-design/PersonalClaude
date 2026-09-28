// Shopping list: needs and wants, each with what it is, price and link.
// The AI bar can add, edit, mark bought and remove items too.
import { api } from "../api.js";
import { icon } from "../icons.js";
import { esc, fmtDate, openDialog, showError, toast } from "../ui.js";

const money = (n) => (n == null ? "" : n.toLocaleString(undefined, { style: "currency", currency: "USD" }));

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function itemRow(it) {
  return `
    <li class="shop-item ${it.bought ? "bought" : ""}" data-id="${it.id}">
      <input type="checkbox" class="check" ${it.bought ? "checked" : ""} aria-label="Mark “${esc(it.name)}” as bought">
      <div class="shop-main" role="button" tabindex="0">
        <div class="shop-name">${esc(it.name)}</div>
        ${it.description ? `<div class="shop-desc">${esc(it.description)}</div>` : ""}
        <div class="shop-meta">
          ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener" class="shop-link" data-link>${icon("link")}${esc(domain(it.url) || "link")}</a>` : ""}
          ${it.bought && it.bought_at ? `<span>Bought ${esc(fmtDate(it.bought_at.slice(0, 10)))}</span>` : ""}
        </div>
      </div>
      <div class="shop-price">${it.price != null ? esc(money(it.price)) : `<span class="muted">no price</span>`}</div>
      <div class="t-actions">
        <button class="icon-btn" data-edit aria-label="Edit">${icon("edit")}</button>
        <button class="icon-btn danger" data-delete aria-label="Delete">${icon("trash")}</button>
      </div>
    </li>`;
}

function column(kind, items, total) {
  const label = kind === "need" ? "Needs" : "Wants";
  const hint = kind === "need" ? "Essentials and replacements" : "Nice-to-haves";
  return `
    <section class="card shop-col shop-${kind}">
      <header class="shop-head">
        <div><h2>${label}</h2><div class="eyebrow">${hint}</div></div>
        <div class="shop-total"><span class="eyebrow">Total</span><b>${esc(money(total))}</b></div>
        <button class="icon-btn" data-add="${kind}" aria-label="Add a ${kind}">${icon("plus")}</button>
      </header>
      ${items.length ? `<ul class="shop-list">${items.map(itemRow).join("")}</ul>`
        : `<div class="empty">No ${label.toLowerCase()} yet.</div>`}
    </section>`;
}

export async function render(view) {
  const { items, totals } = await api.get("/shopping");
  const open = items.filter((i) => !i.bought);
  const needs = open.filter((i) => i.category === "need");
  const wants = open.filter((i) => i.category === "want");
  const bought = items.filter((i) => i.bought);

  view.innerHTML = `<div id="shop-root">
    <div class="page-head"><div>
      <div class="eyebrow">Needs &amp; wants</div>
      <h1>Shopping list</h1>
      <div class="status-chips">
        <span class="status-chip"><span class="dot" style="--c:var(--accent-2)"></span>needs <b>${esc(money(totals.need))}</b></span>
        <span class="status-chip"><span class="dot" style="--c:#c084fc"></span>wants <b>${esc(money(totals.want))}</b></span>
        <span class="status-chip"><span class="dot" style="--c:var(--success)"></span><b>${open.length}</b> to buy</span>
        ${totals.unpriced ? `<span class="status-chip"><span class="dot" style="--c:var(--warning)"></span><b>${totals.unpriced}</b> without a price</span>` : ""}
      </div></div>
      <button class="btn primary" id="add-item">${icon("plus")} Add item</button></div>
    <p class="sub" style="margin:-8px 0 18px;color:var(--text-3)">Tip: paste a store link into the AI bar, e.g. “Add this to my wants: https://…”, and it fills in the name and price when the store allows it.</p>
    <div class="shop-grid" id="shop">
      ${column("need", needs, totals.need)}
      ${column("want", wants, totals.want)}
    </div>
    ${bought.length ? `
      <details class="shop-bought">
        <summary>Bought <span class="count">${bought.length}</span></summary>
        <ul class="shop-list card">${bought.map(itemRow).join("")}</ul>
      </details>` : ""}</div>`;
  const root = view.querySelector("#shop-root"); // listeners live on this, so redraws don't stack them

  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const refresh = () => render(view);
  root.querySelector("#add-item").onclick = () => openItemEditor({}, refresh);
  root.addEventListener("click", async (e) => {
    if (e.target.closest("[data-link]")) return; // let the link open normally
    const add = e.target.closest("[data-add]");
    if (add) return openItemEditor({ category: add.dataset.add }, refresh);
    const row = e.target.closest(".shop-item");
    if (!row || e.target.matches(".check")) return;
    const it = byId[row.dataset.id];
    if (e.target.closest("[data-delete]")) {
      if (!confirm(`Remove “${it.name}” from your shopping list?`)) return;
      await api.del(`/shopping/${it.id}`);
      toast("Removed");
      return refresh();
    }
    if (e.target.closest("[data-edit]") || e.target.closest(".shop-main")) openItemEditor(it, refresh);
  });
  root.addEventListener("change", async (e) => {
    if (!e.target.matches(".shop-item .check")) return;
    const id = e.target.closest(".shop-item").dataset.id;
    try {
      await api.patch(`/shopping/${id}`, { bought: e.target.checked });
      toast(e.target.checked ? "Bought ✓" : "Back on the list");
      refresh();
    } catch (err) { toast(err.message); }
  });
}

export function openItemEditor(it = {}, onChange) {
  const isNew = !it.id;
  let category = it.category || "want";
  const dlg = openDialog({
    title: isNew ? "Add to shopping list" : "Edit item",
    style: "--area:var(--accent-2)",
    body: `
      <form id="item-form" class="dlg-body" style="padding:0">
        <label class="field"><span>Link (optional)</span>
          <div class="copy-row" style="margin:0;flex-wrap:nowrap">
            <input type="text" name="url" value="${esc(it.url || "")}" placeholder="https://store.com/product">
            <button class="btn small" type="button" id="lookup">Fetch details</button>
          </div></label>
        <label class="field"><span>Name</span>
          <input type="text" name="name" required value="${esc(it.name || "")}" placeholder="e.g. AirPods Pro 2"></label>
        <label class="field"><span>What it is (optional)</span>
          <input type="text" name="description" value="${esc(it.description || "")}" placeholder="e.g. Noise-canceling earbuds for the gym"></label>
        <div class="row">
          <div class="field"><span>Need or want?</span>
            <div class="segmented" id="category">
              <button type="button" data-cat="need">Need</button>
              <button type="button" data-cat="want">Want</button>
            </div></div>
          <label class="field"><span>Price ($, optional)</span>
            <input type="number" name="price" min="0" step="0.01" value="${it.price ?? ""}" placeholder="0.00"></label>
        </div>
      </form>`,
    foot: `
      ${isNew ? "" : `<button class="btn danger" data-delete>${icon("trash")} Remove</button>`}
      <div class="right"><button class="btn" data-close>Cancel</button>
      <button class="btn primary" type="submit" form="item-form">${isNew ? "Add" : "Save"}</button></div>`,
  });
  const form = dlg.querySelector("form");
  const showCat = () => dlg.querySelectorAll("#category button").forEach((b) => b.classList.toggle("active", b.dataset.cat === category));
  dlg.querySelector("#category").onclick = (e) => { const b = e.target.closest("button"); if (b) { category = b.dataset.cat; showCat(); } };
  showCat();
  dlg.querySelector("#lookup").onclick = async (e) => {
    const url = form.url.value.trim();
    if (!url) return toast("Paste a link first");
    e.target.disabled = true; e.target.textContent = "Fetching…";
    try {
      const found = await api.post("/shopping/lookup", { url });
      if (found.name && !form.name.value) form.name.value = found.name;
      if (found.description && !form.description.value) form.description.value = found.description;
      if (found.price != null && !form.price.value) form.price.value = found.price;
      toast(found.ok ? "Details filled in. Check them before saving." : found.error, found.ok ? 3000 : 8000);
    } catch (err) { toast(err.message, 8000); }
    e.target.disabled = false; e.target.textContent = "Fetch details";
  };
  dlg.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Remove “${it.name}” from your shopping list?`)) return;
    await api.del(`/shopping/${it.id}`);
    dlg.close();
    toast("Removed");
    onChange();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      category,
      price: form.price.value === "" ? null : Number(form.price.value),
      url: form.url.value.trim(),
    };
    try {
      if (isNew) await api.post("/shopping", body);
      else await api.patch(`/shopping/${it.id}`, body);
      dlg.close();
      toast(isNew ? "Added to your list" : "Saved");
      onChange();
    } catch (err) { showError(form, err); }
  });
  (it.url || !isNew ? form.name : form.url).focus();
}
