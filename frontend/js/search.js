// Search across the whole app: the 🔍 button in the top bar, or Ctrl+K / ⌘K.
import { api } from "./api.js";
import { icon } from "./icons.js";
import { esc } from "./ui.js";

let dlg = null;

function open() {
  if (dlg) { dlg.querySelector("input").focus(); return; }
  dlg = document.createElement("dialog");
  dlg.className = "search-dlg";
  dlg.innerHTML = `
    <div class="search-box">${icon("search")}<input type="search" placeholder="Search tasks, people, bills, notes…" aria-label="Search"
      autocomplete="off" enterkeyhint="search"><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="search-results"><p class="muted small search-hint">Type at least 2 letters. Searches tasks, goals and notes, routines,
      your schedule, follow-ups, people, fun, home maintenance, shopping, bills and transactions.</p></div>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector("input");
  const out = dlg.querySelector(".search-results");
  let timer, seq = 0;
  const close = () => { dlg.close(); };
  dlg.addEventListener("close", () => { dlg.remove(); dlg = null; });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) return close();
    const hit = e.target.closest("[data-link]");
    if (hit) { location.hash = `#/${hit.dataset.link}`; close(); }
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const mine = ++seq;
      if (q.length < 2) { out.innerHTML = ""; return; }
      const groups = await api.get(`/search?q=${encodeURIComponent(q)}`).catch(() => []);
      if (mine !== seq) return; // a newer search is on its way
      out.innerHTML = groups.length ? groups.map((g) => `
        <div class="search-group"><div class="eyebrow">${esc(g.group)}</div>
          ${g.items.map((it) => `<button class="search-hit" data-link="${esc(it.link)}"><span>${esc(it.title)}</span><small>${esc(it.sub)}</small></button>`).join("")}
        </div>`).join("") : `<p class="muted small search-hint">Nothing found for “${esc(q)}”.</p>`;
    }, 180);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") out.querySelector(".search-hit")?.click();
  });
  dlg.showModal();
  input.focus();
}

export function setupSearch() {
  const btn = document.createElement("button");
  btn.className = "icon-btn search-btn";
  btn.type = "button";
  btn.title = "Search (Ctrl+K)";
  btn.setAttribute("aria-label", "Search");
  btn.innerHTML = icon("search");
  btn.onclick = open;
  document.querySelector("#command-form").after(btn);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
  });
}
