(function (C) {
  const handlers = {}; // requestId -> {delta, done, error}
  if (window.academy) {
    window.academy.chat.onDelta((d) => handlers[d.requestId] && handlers[d.requestId].delta(d.text));
    window.academy.chat.onDone((d) => handlers[d.requestId] && handlers[d.requestId].done(d));
    window.academy.chat.onError((d) => handlers[d.requestId] && handlers[d.requestId].error(d.error));
  }
  let system = null;
  let chat = null;     // { id, title, messages: [{role, content, meta}] }
  let streaming = null;
  let settings = { hasKey: false };

  const SUGGEST = [
    ['Claude Code basics', ['What is the difference between CLAUDE.md and settings.json?', 'When should I use plan mode?', 'Explain subagents like I\'m new to coding', 'What does /compact do, and when should I use it?', 'How do permission rules work?']],
    ['Architect exam', ['Hooks vs. prompt instructions: when does the exam expect each?', 'Quiz me with 3 questions on Domain 2 (tools & MCP)', 'Explain the agentic loop and stop_reason', 'What are the escalation rules for a support agent?', 'Make me a 2-week study plan; I have 1 hour a day']],
    ['Python', ['Explain Python dictionaries with an example', 'What should I study for the PCEP exam?', 'Write a tiny Python script that calls the Claude API and explain each line', 'What is a virtual environment and why use one?']],
  ];

  C.register('chat', {
    async render(host) {
      if (!system) system = C.buildSystemPrompt();
      settings = window.academy ? await window.academy.settings.get() : { hasKey: false };
      if (!chat) chat = newChat();
      const online = window.academy && settings.hasKey;
      host.innerHTML = `<div class="page full"><div class="chat-layout">
        <div class="chat-main">
          <div class="chat-head">${C.logo('lg')}<div><div style="font-weight:700;font-size:16px">Ask Claude</div>
            <div class="small muted">${online ? `Online · ${C.esc(prettyModel(settings.model))} · knows this app's lessons, glossary & exam guide` : 'Offline mode · answers from this app\'s built-in knowledge. Add an API key in Settings for full answers'}</div></div>
            <div style="margin-left:auto" class="row"><button class="btn ghost sm" id="newChat">+ New chat</button>${online ? '' : '<button class="btn sm" data-go="settings">Add API key</button>'}</div></div>
          <div class="chat-log" id="log"></div>
          <div class="chat-input"><div class="chat-box">
            <textarea id="ask" rows="1" placeholder="Ask about Claude Code, the Architect exam, or Python…"></textarea>
            <button class="btn" id="send">${C.logo()} Send</button>
          </div><div class="small muted center" style="margin-top:6px">The tutor can make mistakes. For fast-changing details, double-check the official docs (links in Resources).</div></div>
        </div>
        <aside class="chat-side">
          ${SUGGEST.map(([h, qs]) => `<div class="small" style="font-weight:700;margin:4px 0 8px">${h}</div>${qs.map((q) => `<button class="suggest" data-q="${C.esc(q)}">${C.esc(q)}</button>`).join('')}`).join('<div style="height:10px"></div>')}
          <hr><div class="small" style="font-weight:700;margin-bottom:8px">Recent chats</div>
          <div id="recent">${(C.state.chats || []).slice().reverse().map((c) => `<button class="suggest" data-chat="${c.id}">💬 ${C.esc(c.title)}</button>`).join('') || '<div class="muted small">Your conversations are saved here.</div>'}</div>
        </aside>
      </div></div>`;
      drawLog();
      const ta = host.querySelector('#ask');
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ta.value); } });
      host.querySelector('#send').onclick = () => (streaming ? stop() : send(ta.value));
      host.querySelector('#newChat').onclick = () => { if (streaming) stop(); chat = newChat(); C.render(); };
      host.onclick = (e) => {
        const s = e.target.closest('[data-q]'); if (s) send(s.dataset.q);
        const c = e.target.closest('[data-chat]'); if (c) { const found = C.state.chats.find((x) => x.id === c.dataset.chat); if (found) { chat = JSON.parse(JSON.stringify(found)); drawLog(); } }
        const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go;
      };
      const pre = sessionStorage.getItem('cca.ask');
      if (pre) { sessionStorage.removeItem('cca.ask'); send(pre); } else ta.focus();
    },
    unmount() { /* keep streaming in background; result is saved */ },
  });

  const prettyModel = (m) => ({ 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5', 'claude-fable-5-2': 'Claude Fable 5.2' })[m] || m;
  function newChat() { return { id: C.uid(), title: 'New chat', messages: [] }; }

  function msgHTML(m, i) {
    if (m.role === 'user') return `<div class="msg user"><div class="avatar">You</div><div class="bubble">${C.esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
    return `<div class="msg bot" data-i="${i}"><div class="avatar">${C.logo(m.pending ? 'thinking' : '')}</div><div class="bubble">${m.content ? C.md(m.content) : '<span class="typing-dots"><span></span><span></span><span></span></span>'}${m.meta ? `<div class="meta">${C.esc(m.meta)}</div>` : ''}</div></div>`;
  }
  function drawLog() {
    const log = C.$('#log'); if (!log) return;
    if (!chat.messages.length) {
      log.innerHTML = `<div class="empty" style="padding-top:60px">${C.logo('xl')}<h2>Hi! I'm your Claude Code tutor.</h2><p>Ask me to explain a concept, quiz you, review a CLAUDE.md, or walk you through a Python snippet.<br>Pick a suggestion on the right to start.</p></div>`;
      return;
    }
    log.innerHTML = chat.messages.map(msgHTML).join('');
    log.scrollTop = log.scrollHeight;
  }
  function updateLast() {
    const log = C.$('#log'); if (!log) return;
    const i = chat.messages.length - 1;
    const el = log.querySelector(`[data-i="${i}"]`);
    if (el) el.outerHTML = msgHTML(chat.messages[i], i); else drawLog();
    log.scrollTop = log.scrollHeight;
  }
  function saveChat() {
    if (!chat.messages.length) return;
    chat.title = chat.messages[0].content.slice(0, 48) + (chat.messages[0].content.length > 48 ? '…' : '');
    const list = C.state.chats || (C.state.chats = []);
    const idx = list.findIndex((c) => c.id === chat.id);
    const copy = { id: chat.id, title: chat.title, messages: chat.messages.filter((m) => !m.pending).map(({ role, content, meta }) => ({ role, content, meta })) };
    if (idx >= 0) list[idx] = copy; else list.push(copy);
    while (list.length > 25) list.shift();
    C.save();
  }
  function setSending(on) {
    const b = C.$('#send'); if (b) b.innerHTML = on ? '■ Stop' : `${C.logo()} Send`;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || streaming) return;
    const ta = C.$('#ask'); if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    chat.messages.push({ role: 'user', content: text });
    const bot = { role: 'assistant', content: '', pending: true };
    chat.messages.push(bot);
    drawLog();
    C.markStudied();

    if (!(window.academy && settings.hasKey)) {
      await new Promise((r) => setTimeout(r, 450));
      const ans = C.offlineAnswer(text);
      bot.content = ans || `I couldn't find that in my offline notes. Try naming a specific term (for example *subagent*, *CLAUDE.md*, *hooks*, *MCP*, *plan mode*), or open the **Glossary**.\n\nFor full answers to any question, add your Anthropic API key in **Settings**: then I can answer with Claude directly.`;
      bot.pending = false; bot.meta = 'Offline answer from the app\'s knowledge base';
      updateLast(); saveChat();
      return;
    }

    const requestId = C.uid();
    streaming = requestId; setSending(true);
    let raf = 0;
    const history = chat.messages.filter((m) => m !== bot && m.content).map((m) => ({ role: m.role, content: m.content }));
    handlers[requestId] = {
      delta: (t) => { bot.content += t; if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); },
      done: (d) => {
        bot.pending = false;
        if (d.refusal) bot.content += `\n\n> [!WARN] ${d.refusal}`;
        if (d.stopReason === 'max_tokens') bot.content += '\n\n*(The answer was cut off. Ask me to continue.)*';
        bot.meta = `${prettyModel(d.model)}${d.usage ? ` · ${d.usage.input + d.usage.cacheRead} in / ${d.usage.output} out tokens${d.usage.cacheRead ? ` (${d.usage.cacheRead} cached)` : ''}` : ''}`;
        finish();
      },
      error: (msg) => {
        bot.pending = false;
        if (msg !== 'Stopped.') bot.content += (bot.content ? '\n\n' : '') + `> [!WARN] ${msg}`;
        else bot.meta = 'Stopped';
        finish();
      },
    };
    const finish = () => { delete handlers[requestId]; streaming = null; setSending(false); updateLast(); saveChat(); };
    const r = await window.academy.chat.send({ requestId, system, messages: history });
    if (r && r.error === 'no-key') handlers[requestId] && handlers[requestId].error('No API key set. Add one in Settings.');
  }
  function stop() { if (streaming && window.academy) window.academy.chat.stop(streaming); }
})(window.CCA);
