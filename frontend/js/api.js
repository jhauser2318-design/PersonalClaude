// Small helper for talking to the backend. Every call goes to /api/... on
// the computer running the app. The browser never sees your API key.

// The server's "something was saved" counter as of our own last change, so
// the live refresh (app.js) doesn't redraw for changes this window made.
export const sync = { known: null };

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty response */ }
  if (method !== "GET" && path !== "/app/ping" && res.headers.get("X-Data-Version")) sync.known = Number(res.headers.get("X-Data-Version"));
  if (res.status === 401 && data?.code === "login") {
    // On the phone: the passcode screen takes over (see app.js).
    window.dispatchEvent(new CustomEvent("lcc:login-required"));
  }
  if (!res.ok) {
    let msg = data && data.detail;
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join("; ");
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body || {}),
  patch: (path, body) => request("PATCH", path, body),
  put: (path, body) => request("PUT", path, body),
  del: (path) => request("DELETE", path),
};
