// The list of modules shown in the sidebar.
//
// To add a future module (e.g. Calendar): write its page in js/views/,
// import it here, remove `comingSoon: true` and set `view`. That's it.
import * as area from "./views/area.js";
import * as calendar from "./views/calendar.js";
import * as dashboard from "./views/dashboard.js";
import * as goals from "./views/goals.js";
import * as routines from "./views/routines.js";
import * as settings from "./views/settings.js";
import * as tasks from "./views/tasks.js";

export const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: "home", view: dashboard },
  { id: "goals", label: "Goals", icon: "target", view: goals },
  { id: "tasks", label: "Tasks", icon: "check", view: tasks },
  { id: "routines", label: "Routines", icon: "repeat", view: routines },
  { id: "calendar", label: "Calendar", icon: "calendar", view: calendar },

  // Future phases (shown as "Coming soon").
  { id: "finances", label: "Finances", icon: "wallet", comingSoon: true,
    blurb: "Track spending, budgets and savings goals alongside the rest of your life." },
  { id: "email", label: "Email", icon: "mail", comingSoon: true,
    blurb: "Surface emails that need a reply and turn them into tasks with one sentence." },
  { id: "followups", label: "Follow-ups", icon: "bell", comingSoon: true,
    blurb: "Reminders that nudge you about things you promised to do or are waiting on." },
  { id: "shopping", label: "Shopping list", icon: "cart", comingSoon: true,
    blurb: "Keep a running shopping list, grouped by store or aisle, and add items just by typing “add milk and eggs to my shopping list”." },
];

// Pages that aren't in the main list but still have a web address.
export const EXTRA_ROUTES = { area, settings };
