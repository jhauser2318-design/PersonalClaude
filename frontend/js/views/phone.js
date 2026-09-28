// Settings → Phone & devices: set up background mode, Tailscale, the
// passcode and the home-screen app, and manage remembered devices.
import { api } from "../api.js";
import { icon } from "../icons.js";
import qrcode from "../vendor/qrcode.mjs";
import { esc, fmtDateTime, toast } from "../ui.js";

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 10, alt: "QR code to open the app on your phone" });
}

const step = (n, done, title, body) => `
  <li class="ph-step ${done ? "done" : ""}">
    <span class="ph-num">${done ? "✓" : n}</span>
    <div class="ph-body"><h3>${title}</h3>${body}</div>
  </li>`;

function devicesList(data) {
  if (!data.devices.length) return `<p class="muted small">No phones signed in yet.</p>`;
  return `<ul class="fin-list">${data.devices.map((d) => `
    <li><div><div class="fin-li-title">${esc(d.name)}${d.id === data.this_device ? ` <span class="pill in_progress">this device</span>` : ""}</div>
      <div class="fin-li-sub">last used ${esc(fmtDateTime(d.last_seen))} · signed in ${esc(fmtDateTime(d.created_at))}</div></div>
      <button class="btn small" data-forget="${d.id}">Sign out</button></li>`).join("")}</ul>`;
}

export async function renderPhone(box) {
  const data = await api.get("/remote/status");
  const refresh = () => renderPhone(box);

  if (data.remote) {
    // On the phone itself: just devices and the home-screen tip.
    box.innerHTML = `
      <h2>${icon("link")} Phone &amp; devices</h2>
      <p>You're connected to your PC through Tailscale. Changes show up on every device within a few seconds.</p>
      <p class="muted small">Tip: in Safari, tap <b>Share → Add to Home Screen</b> to use this like an app.</p>
      <h3 class="ph-sub">Signed-in devices</h3>${devicesList(data)}`;
  } else {
    const ts = data.tailscale;
    const bg = data.background;
    const tsReady = ts.installed && ts.running && ts.https_enabled;
    const tsBody = !ts.installed
      ? `<p>Install Tailscale on this PC and sign in with your Google account (free).</p>
         <a class="btn small" href="https://tailscale.com/download/windows" target="_blank" rel="noopener">Download Tailscale for Windows</a>`
      : !ts.running
        ? `<p>Tailscale is installed but not connected. Open it from the system tray (bottom-right, near the clock) and sign in.</p>`
        : !ts.https_enabled
          ? `<p>Signed in as <b>${esc(ts.account || "you")}</b>. One more switch: in the Tailscale admin page, turn on
             <b>MagicDNS</b> and <b>HTTPS Certificates</b>, then come back and click Check again.</p>
             <div class="btn-row"><a class="btn small" href="https://login.tailscale.com/admin/dns" target="_blank" rel="noopener">Open Tailscale DNS settings</a>
             <button class="btn small" data-refresh>Check again</button></div>`
          : `<p>Connected as <b>${esc(ts.account || "you")}</b> · this PC is <code>${esc(ts.dns_name)}</code></p>`;
    box.innerHTML = `
      <h2>${icon("link")} Phone &amp; devices</h2>
      <p>Use the app on your iPhone, linked to this PC: same data, updated live. Only your own devices can reach it,
         through <b>Tailscale</b> (a free, private, encrypted link).</p>
      <ol class="ph-steps">
        ${step(1, bg.always_on, "Keep the app running in the background",
          `<p>Starts quietly when you sign in to Windows and keeps running after you close the window, so your phone can reach it.
             Also installs updates by itself every hour. Set your PC to not sleep while plugged in (Windows Settings → System → Power).</p>
           ${bg.supported ? `<button class="btn small ${bg.always_on ? "" : "primary"}" id="ph-bg">${bg.always_on ? "Turn off background mode" : "Turn on background mode"}</button>`
             : `<p class="muted small">Available in the Windows app.</p>`}`)}
        ${step(2, tsReady, "Install Tailscale on this PC", tsBody)}
        ${step(3, data.has_passcode, "Set a passcode",
          `<p>Your phone asks for it once, then remembers the device for 90 days. At least 6 characters. ${data.has_passcode ? "Setting a new one signs out every phone." : ""}</p>
           <form class="ph-pass" id="ph-pass"><input type="password" name="passcode" minlength="6" autocomplete="new-password"
             placeholder="${data.has_passcode ? "New passcode" : "Passcode"}" required aria-label="Passcode">
             <button class="btn small" type="submit">${data.has_passcode ? "Change" : "Set passcode"}</button></form>`)}
        ${step(4, ts.serving, "Turn on phone access",
          ts.serving ? `<p>Your app's private address: <code>${esc(ts.url)}</code></p>
              <div class="ph-qr">${qrSvg(ts.url)}<div><p><b>On your iPhone</b> (with Tailscale connected): point the Camera at this code, open the link,
              enter your passcode, then tap <b>Share → Add to Home Screen</b>.</p>
              <button class="btn small" id="ph-off">Turn off phone access</button></div></div>`
            : `<p>Gives this PC a private https address that only devices signed in to your Tailscale account can open.</p>
               <button class="btn small primary" id="ph-on" ${tsReady && data.has_passcode ? "" : "disabled"}>Turn on phone access</button>
               ${tsReady && data.has_passcode ? "" : `<p class="muted small">Finish steps 2 and 3 first.</p>`}`)}
      </ol>
      <h3 class="ph-sub">Signed-in devices</h3>${devicesList(data)}`;
  }

  box.querySelector("[data-refresh]")?.addEventListener("click", refresh);
  box.querySelectorAll("[data-forget]").forEach((b) => b.addEventListener("click", async () => {
    await api.del(`/remote/devices/${b.dataset.forget}`);
    if (Number(b.dataset.forget) === data.this_device) return location.reload();
    toast("Signed out");
    refresh();
  }));
  box.querySelector("#ph-bg")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await api.post("/remote/background", { on: !data.background.always_on });
      toast(r.always_on ? "Background mode on: the app now keeps running and starts with Windows" : "Background mode off", 5000);
    } catch (err) { toast(err.message, 9000); }
    refresh();
  });
  box.querySelector("#ph-pass")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.post("/remote/passcode", { passcode: e.target.passcode.value });
      toast("Passcode saved");
      refresh();
    } catch (err) { toast(err.message, 6000); }
  });
  box.querySelector("#ph-on")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "Setting up…";
    try {
      const r = await api.post("/remote/tailscale/on");
      if (r.enable_url) {
        window.open(r.enable_url, "_blank");
        toast("Tailscale opened a page asking you to allow this. Approve it there, then click the button again.", 10000);
      } else toast("Phone access is on", 4000);
    } catch (err) { toast(err.message, 10000); }
    refresh();
  });
  box.querySelector("#ph-off")?.addEventListener("click", async () => {
    if (!confirm("Turn off phone access? Your phone won't be able to open the app until you turn it back on.")) return;
    await api.post("/remote/tailscale/off");
    toast("Phone access off");
    refresh();
  });
}
