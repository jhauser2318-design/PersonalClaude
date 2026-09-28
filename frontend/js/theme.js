// Dark (default) / light / system theme. The choice is remembered in this browser.
const KEY = "lcc-theme";

export function getTheme() {
  try { return localStorage.getItem(KEY) || "dark"; } catch (e) { return "dark"; }
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: ignore */ }
  document.documentElement.dataset.theme = theme;
}
