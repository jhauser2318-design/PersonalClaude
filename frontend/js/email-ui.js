// Email pieces shared by the Email page and the AI bar:
// the email viewer, the "review and send" draft window, and AI replies.
import { api } from "./api.js";
import { openTaskEditor } from "./components.js";
import { icon } from "./icons.js";
import { esc, openDialog, showError, toast } from "./ui.js";

export function senderName(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from || "");
  return (m && (m[1].trim() || m[2])) || from || "";
}

export function senderAddress(from) {
  const m = /<([^>]+)>/.exec(from || "");
  return m ? m[1] : (from || "").trim();
}

export function shortDate(timestampOrText) {
  const d = typeof timestampOrText === "number" ? new Date(timestampOrText * 1000) : new Date(timestampOrText);
  if (isNaN(d)) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

// ---------- Draft review: nothing is sent until you click Send ----------
export function openDraft(draft = {}, onSent = () => {}) {
  const dlg = openDialog({
    title: draft.reply_to_id ? "Review reply" : "New email",
    style: "--area:var(--accent);width:min(680px, calc(100vw - 24px))",
    body: `
      <form id="draft-form" class="dlg-body" style="padding:0">
        <label class="field"><span>To</span>
          <input type="text" name="to" value="${esc(draft.to || "")}" placeholder="name@example.com" required></label>
        <label class="field"><span>Cc (optional)</span>
          <input type="text" name="cc" value="${esc(draft.cc || "")}"></label>
        <label class="field"><span>Subject</span>
          <input type="text" name="subject" value="${esc(draft.subject || "")}"></label>
        <label class="field"><span>Message</span>
          <textarea name="body" rows="12" style="min-height:220px">${esc(draft.body || "")}</textarea></label>
        <p class="draft-note">${icon("mail")} Nothing is sent until you click <b>Send</b>. Edit anything you like first.</p>
      </form>`,
    foot: `<button class="btn" data-close>Discard</button>
      <div class="right"><button class="btn primary" type="submit" form="draft-form">${icon("send")} Send</button></div>`,
  });
  const form = dlg.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = dlg.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const sent = await api.post("/email/send", {
        to: form.to.value, cc: form.cc.value, subject: form.subject.value,
        body: form.body.value, reply_to_id: draft.reply_to_id || null,
      });
      dlg.close();
      toast(`✉️ Sent to ${sent.to}`, 4000);
      onSent(sent);
    } catch (err) {
      showError(form, err);
      button.disabled = false;
      button.innerHTML = `${icon("send")} Send`;
    }
  });
  (draft.body ? form.body : form.to).focus();
}

// ---------- Reading an email ----------
export async function openMessage(id) {
  const dlg = openDialog({ title: "Loading…", body: "", style: "--area:var(--accent);width:min(760px, calc(100vw - 24px))" });
  let m;
  try {
    m = await api.get(`/email/messages/${encodeURIComponent(id)}`);
  } catch (err) {
    dlg.querySelector(".dlg-body").innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
    return;
  }
  dlg.querySelector(".dlg-head h2").textContent = m.subject;
  dlg.querySelector(".dlg-body").innerHTML = `
    <div class="mail-meta">
      <div><span class="eyebrow">From</span> ${esc(m.from)}</div>
      <div><span class="eyebrow">To</span> ${esc(m.to)}</div>
      ${m.cc ? `<div><span class="eyebrow">Cc</span> ${esc(m.cc)}</div>` : ""}
      <div><span class="eyebrow">Date</span> ${esc(m.date)}</div>
      ${m.attachments.length ? `<div><span class="eyebrow">Attachments</span> ${m.attachments.map(esc).join(", ")}</div>` : ""}
    </div>
    <div class="mail-body">${esc(m.body || m.snippet || "(no text)")}</div>
    <form class="ai-reply" id="ai-reply">
      <span class="ai-orb" aria-hidden="true">AI</span>
      <input type="text" name="instructions" placeholder="Reply with AI: what should it say? e.g. “Thursday works, thanks”">
      <button class="btn small primary" type="submit">Draft reply</button>
    </form>`;
  let foot = dlg.querySelector(".dlg-foot");
  if (!foot) { foot = document.createElement("div"); foot.className = "dlg-foot"; dlg.appendChild(foot); }
  foot.innerHTML = `
    <a class="btn" href="https://mail.google.com/mail/u/0/#all/${esc(m.thread_id)}" target="_blank" rel="noopener">Open in Gmail ↗</a>
    <div class="right">
      <button class="btn" data-task>${icon("check")} Make a task</button>
      <button class="btn" data-reply>${icon("undo")} Reply</button>
    </div>`;
  const replyDraft = (body = "") => ({
    to: senderAddress(m.reply_to || m.from),
    subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    body, reply_to_id: m.id,
  });
  foot.querySelector("[data-reply]").onclick = () => { dlg.close(); openDraft(replyDraft()); };
  foot.querySelector("[data-task]").onclick = () => {
    dlg.close();
    openTaskEditor({ title: `Follow up: ${m.subject}`.slice(0, 120), area: "work" });
  };
  dlg.querySelector("#ai-reply").addEventListener("submit", async (e) => {
    e.preventDefault();
    const what = e.target.instructions.value.trim();
    const button = e.target.querySelector("button");
    button.disabled = true;
    button.textContent = "Drafting…";
    try {
      const r = await api.post("/email/ask", {
        question: `Draft a reply to the email with id ${m.id} (from ${m.from}, subject "${m.subject}"). `
          + (what ? `The reply should say: ${what}` : "Write a sensible, friendly reply."),
      });
      dlg.close();
      if (r.draft) openDraft(r.draft);
      else toast(r.answer, 8000);
    } catch (err) {
      toast(err.message, 8000);
      button.disabled = false;
      button.textContent = "Draft reply";
    }
  });
}
