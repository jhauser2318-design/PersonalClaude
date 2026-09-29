// Finances: shared formatting helpers, category colors and the page's state.
import { esc, fmtDate, todayISO } from "../../ui.js";

export const money = (n, cents = true) => (n ?? 0).toLocaleString(undefined, {
  style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
});
export const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
export const monthLabel = (m, short = false) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, short ? { month: "short" } : { month: "long", year: "numeric" });
};
export const thisMonth = () => todayISO().slice(0, 7);
export function shiftMonth(m, by) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthBounds(m) {
  const [y, mo] = m.split("-").map(Number);
  return [`${m}-01`, `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`];
}
export function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return fmtDate(iso.slice(0, 10));
}

// Category colors: a fixed hue per category so charts stay consistent.
const CAT_COLORS = {
  "Housing": "#818cf8", "Utilities & Phone": "#60a5fa", "Groceries": "#34d399", "Dining & Coffee": "#fb923c",
  "Transportation": "#22d3ee", "Gas": "#38bdf8", "Shopping": "#c084fc", "Entertainment": "#f472b6",
  "Subscriptions": "#a78bfa", "Health & Fitness": "#4ade80", "Personal Care": "#f9a8d4", "Travel": "#2dd4bf",
  "Education": "#facc15", "Insurance": "#94a3b8", "Fees & Interest": "#fb7185", "Debt Payments": "#f97316", "Gifts & Donations": "#fbbf24",
  "Other": "#9ca3af", "Uncategorized": "#6b7280", "Income": "#34d399", "Transfer": "#64748b",
};
export const catColor = (c) => CAT_COLORS[c] || "#9ca3af";
export const catChip = (c) => `<span class="fin-cat" style="--c:${catColor(c)}"><span class="dot"></span>${esc(c)}</span>`;


// The Finances page's state (which tab, month, filters...), shared by every tab.
export const ui = { tab: "overview", month: null, day: null, filters: { period: "", account_id: "", category: "", search: "" },
  chat: [], ruleDraft: "", rulesChanged: false };
