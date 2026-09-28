// Phone notifications: turning Web Push on or off for this device.
// On an iPhone this works in the Home Screen app (iOS 16.4 or newer), not in a Safari tab.
import { api } from "./api.js";

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  return "Browser";
}

// Called once at startup: installs the service worker and keeps the app badge in step.
export function setupPush() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "open") location.href = e.data.url;
  });
  const clearBadge = () => { if (document.visibilityState === "visible") navigator.clearAppBadge?.().catch(() => {}); };
  clearBadge();
  document.addEventListener("visibilitychange", clearBadge);
}

export async function currentSubscription() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// What this device can do: "on", "off", "denied", "home-screen" (iPhone Safari tab), "unsupported".
export async function deviceState() {
  if (isIOS && !isStandalone()) return "home-screen";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await currentSubscription()) ? "on" : "off";
}

// Must be called from a tap/click (iPhones only ask for permission then).
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications weren't allowed. You can allow them in the iPhone's Settings → Notifications → Life CC.");
  const { key } = await api.get("/push/status");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  return api.post("/push/subscribe", { subscription: sub.toJSON(), label: deviceLabel() });
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

export async function testPush() {
  const sub = await currentSubscription();
  return api.post("/push/test", { endpoint: sub?.endpoint || null });
}
