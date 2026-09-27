// Light / dark / system theme. The choice is remembered in this browser.
const KEY = "lcc-theme";

export function getTheme() {
  try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: ignore */ }
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
