// The list of modules shown in the sidebar.
//
// To add a future module (e.g. Calendar): write its page in js/views/,
// import it here, remove `comingSoon: true` and set `view`. That's it.
import * as area from "./views/area.js";
import * as calendar from "./views/calendar.js";
import * as dashboard from "./views/dashboard.js";
import * as email from "./views/email.js";
import * as finances from "./views/finances.js";
import * as followups from "./views/followups.js";
import * as goals from "./views/goals.js";
import * as routines from "./views/routines.js";
import * as settings from "./views/settings.js";
import * as shopping from "./views/shopping.js";
import * as tasks from "./views/tasks.js";

export const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: "home", view: dashboard },
  { id: "goals", label: "Goals", icon: "target", view: goals },
  { id: "tasks", label: "Tasks", icon: "check", view: tasks },
  { id: "routines", label: "Routines", icon: "repeat", view: routines },
  { id: "calendar", label: "Calendar", icon: "calendar", view: calendar },
  { id: "email", label: "Email", icon: "mail", view: email },
  { id: "shopping", label: "Shopping list", icon: "cart", view: shopping },
  { id: "finances", label: "Finances", icon: "wallet", view: finances },
  { id: "followups", label: "Follow-ups", icon: "bell", view: followups },

  // Future phases would go here with `comingSoon: true` (shown as "Coming soon").
];

// Pages that aren't in the main list but still have a web address.
export const EXTRA_ROUTES = { area, settings };
