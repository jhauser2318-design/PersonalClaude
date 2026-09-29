// Finances → Reports & questions.
import { api } from "../../api.js";
import { icon } from "../../icons.js";
import { esc } from "../../ui.js";
import { money, ui } from "./common.js";

// ===========================================================================
// Reports & questions
// ===========================================================================

const REPORTS = [
  ["month", "This month so far", "Spending, budget pace and how the month compares."],
  ["last_month", "Last month", "Full recap of last month vs the month before."],
  ["quarter", "Last 90 days", "Trends, recurring charges and rising categories."],
];

export async function renderReports(box) {
  box.innerHTML = `
    <div class="fin-report-picks">${REPORTS.map(([id, title, sub]) => `
      <button class="card fin-report-pick" data-report="${id}">
        <span class="fin-li-title">${icon("sparkle")} ${esc(title)}</span><span class="fin-li-sub">${esc(sub)}</span></button>`).join("")}</div>
    <form class="card fin-ask" id="fin-ask">
      <input type="text" name="q" placeholder="Ask about your money, e.g. “How much did I spend on Amazon since July?”" autocomplete="off">
      <button class="btn primary" type="submit">${icon("send")} Ask</button>
    </form>
    <div id="fin-answers">${ui.chat.map(answerCard).join("")}</div>`;
  const answers = box.querySelector("#fin-answers");
  const run = async (payload, title) => {
    const holder = document.createElement("div");
    holder.innerHTML = `<div class="card fin-answer loading"><div class="eyebrow">${esc(title)}</div><p>${icon("loader")} Crunching your numbers…</p></div>`;
    answers.prepend(holder);
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      const history = payload.report ? [] : ui.chat.slice(0, 2).reverse().flatMap((c) => c.q ? [
        { role: "user", content: c.q }, { role: "assistant", content: c.answer }] : []);
      const r = await api.post("/finances/ask", { ...payload, history });
      const entry = { title, q: payload.question || "", answer: r.answer, changes: r.changes };
      ui.chat.unshift(entry);
      ui.chat = ui.chat.slice(0, 10);
      holder.innerHTML = answerCard(entry);
    } catch (err) {
      holder.innerHTML = `<div class="card fin-answer"><div class="eyebrow">${esc(title)}</div><p class="error-msg">${esc(err.message)}</p></div>`;
    }
    box.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  };
  box.querySelectorAll("[data-report]").forEach((b) => {
    b.onclick = () => run({ report: b.dataset.report }, REPORTS.find((r) => r[0] === b.dataset.report)[1] + " report");
  });
  box.querySelector("#fin-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    e.target.q.value = "";
    run({ question: q }, q);
  });
}

export function answerCard(c) {
  return `<article class="card fin-answer">
    <div class="eyebrow">${esc(c.title)}</div>
    ${formatReport(c.answer)}
    ${c.changes?.length ? `<ul class="fin-changes">${c.changes.map((x) => `<li>✓ ${esc(x)}</li>`).join("")}</ul>` : ""}
  </article>`;
}

// "## Heading", "- bullet" and paragraphs -> HTML (everything else escaped).
function formatReport(text) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.join("")}</ul>`); list = []; };
  for (const raw of (text || "").split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "$1");
    const h = line.match(/^\s*#{1,4}\s+(.*)/);
    const li = line.match(/^\s*[-•*]\s+(.*)/);
    if (h) { flush(); out.push(`<h3>${esc(h[1])}</h3>`); }
    else if (li) list.push(`<li>${esc(li[1])}</li>`);
    else { flush(); if (line.trim()) out.push(`<p>${esc(line)}</p>`); }
  }
  flush();
  return out.join("");
}
