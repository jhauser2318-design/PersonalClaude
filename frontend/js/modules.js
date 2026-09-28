// The list of modules shown in the sidebar, grouped under headings.
//
// To add a future module: write its page in js/views/, import it here and
// add it to MODULES with the group it belongs in. That's it.
import * as area from "./views/area.js";
import * as calendar from "./views/calendar.js";
import * as cpa from "./views/cpa.js";
import * as dashboard from "./views/dashboard.js";
import * as email from "./views/email.js";
import * as finances from "./views/finances.js";
import * as followups from "./views/followups.js";
import * as fun from "./views/fun.js";
import * as goals from "./views/goals.js";
import * as home from "./views/home.js";
import * as people from "./views/people.js";
import * as review from "./views/review.js";
import * as routines from "./views/routines.js";
import * as schedule from "./views/schedule.js";
import * as settings from "./views/settings.js";
import * as shopping from "./views/shopping.js";
import * as tasks from "./views/tasks.js";

export const GROUPS = ["", "Plan", "Life", "Money"];

export const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: "home", view: dashboard, group: "" },
  { id: "schedule", label: "Schedule", icon: "clock", view: schedule, group: "Plan" },
  { id: "tasks", label: "Tasks", icon: "check", view: tasks, group: "Plan" },
  { id: "goals", label: "Goals", icon: "target", view: goals, group: "Plan" },
  { id: "routines", label: "Routines", icon: "repeat", view: routines, group: "Plan" },
  { id: "calendar", label: "Calendar", icon: "calendar", view: calendar, group: "Plan" },
  { id: "review", label: "Weekly review", icon: "review", view: review, group: "Plan" },
  { id: "people", label: "People", icon: "users", view: people, group: "Life" },
  { id: "fun", label: "Fun", icon: "sparkle", view: fun, group: "Life" },
  { id: "followups", label: "Follow-ups", icon: "bell", view: followups, group: "Life" },
  { id: "email", label: "Email", icon: "mail", view: email, group: "Life" },
  { id: "finances", label: "Finances", icon: "wallet", view: finances, group: "Money" },
  { id: "shopping", label: "Shopping list", icon: "cart", view: shopping, group: "Money" },
];

// Pages under a life area in the sidebar (e.g. the CPA planner under Education).
export const AREA_PAGES = {
  health: [{ id: "home", label: "Home maintenance", icon: "wrench" }],
  education: [{ id: "cpa", label: "CPA exam", icon: "book" }],
};

// Pages that aren't in the main list but still have a web address.
export const EXTRA_ROUTES = { area, settings, cpa, home };
