/* The Claude Code Simulator: a mock desktop with draggable windows (Terminal,
   Files, Code editor, Quick Reference), a scripted Claude Code session, and a
   Coach panel that explains every step and every highlighted term.          */
(function (C) {
  'use strict';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = C.esc;

  // ---------------------------------------------------------------- markup
  const TAGS = { o: 't-orange', d: 't-dim', g: 't-green', r: 't-red', b: 't-blue', y: 't-yellow', p: 't-purple', B: 't-bold' };
  function fmt(s) {
    let h = esc(s);
    h = h.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, k, label) => {
      const g = C.lookupTerm(k);
      return `<span class="hl" data-term="${esc(k)}">${label || (g ? esc(g.term) : esc(k))}</span>`;
    });
    h = h.replace(/\[(o|d|g|r|b|y|p|B)\]/g, (m, t) => `<span class="${TAGS[t]}">`).replace(/\[\/\]/g, '</span>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return h;
  }

  const TOOL_INFO = {
    Read: 'Read: opens a file and loads its contents into Claude\'s context.',
    Write: 'Write: creates a new file (or overwrites one completely).',
    Edit: 'Edit: changes specific lines in an existing file (shown as a diff).',
    Update: 'Update: Claude Code\'s display name for an Edit to an existing file.',
    Bash: 'Bash: runs a shell command (tests, git, scripts). Asks permission unless allowed by a rule.',
    Grep: 'Grep: searches file CONTENTS for text or a regex.',
    Glob: 'Glob: finds files by NAME pattern, e.g. **/*.test.js.',
    WebFetch: 'WebFetch: downloads and reads a web page.',
    Agent: 'Agent (formerly Task): delegates work to a subagent with its own context window.',
    Skill: 'Skill: loads a skill\'s full instructions because the task matched its description.',
  };
  const VERBS = ['Thinking', 'Pondering', 'Exploring', 'Reading the codebase', 'Clauding', 'Planning', 'Reasoning'];

  // ------------------------------------------------------------- file system
  function freshFS(extra) {
    const fs = {};
    for (const p in C.SIM_FILES) fs[p] = { ...C.SIM_FILES[p] };
    (extra || []).forEach((p) => { if (C.SIM_CREATED[p]) fs[p] = { ...C.SIM_CREATED[p] }; });
    return fs;
  }
  function norm(path) {
    const parts = [];
    path.split('/').forEach((seg) => {
      if (!seg || seg === '.') return;
      if (seg === '..') { if (parts.length > 1) parts.pop(); return; }
      parts.push(seg);
    });
    return parts.join('/') || '~';
  }
  function resolve(cwd, p) {
    if (!p) return cwd;
    p = p.replace(/\\/g, '/');
    if (p.startsWith('~')) return norm(p);
    if (p.startsWith('/')) return norm('~' + p);
    return norm(cwd + '/' + p);
  }
  const base = (p) => p.split('/').pop();
  const rel = (p, cwd) => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p);

  // ------------------------------------------------------------- the view
  let S = null; // simulator state, rebuilt on each render
  let root = null;
  let clockTimer = null;

  function newState() {
    return {
      fs: freshFS(), cwd: '~', inClaude: false, mode: 'default', model: 'Opus',
      trusted: new Set(), history: [], hIdx: -1, busy: false, waiter: null, awaitPlan: false,
      allowCmds: new Set(), mission: null, step: 0, cards: [], prompts: [], interrupted: false,
      wins: {}, z: 10, br: { url: '', values: {}, checked: false }, gh: {}, allowTools: new Set(), editorTabs: [], editorActive: null, fxDir: '~/shop-app', busyCtx: false, coachTab: 'mission', termKey: null,
    };
  }

  C.register('simulator', {
    render(host, arg) {
      S = newState();
      host.innerHTML = `<div class="page full"><div class="sim" id="sim">
        <div class="desk" id="desk">
          <svg class="desk-wall-logo"><use href="#spark"/></svg>
          <div class="desk-wall-text">Claude Code Simulator</div>
          <div class="desk-icons">
            ${icon('terminal', '<span class="di-img di-term">&gt;_</span>', 'Terminal')}
            ${icon('files', '<span class="di-img di-files">📁</span>', 'Files')}
            ${icon('editor', '<span class="di-img di-editor">{ }</span>', 'Code')}
            ${icon('docs', `<span class="di-img di-docs">${C.logo()}</span>`, 'Quick Ref')}
            ${icon('browser', '<span class="di-img di-browser">🌐</span>', 'Browser')}
            ${icon('missions', '<span class="di-img di-guide">🎯</span>', 'Missions')}
          </div>
          <div id="deskTip" class="desk-tip hidden"></div>
          <div id="winLayer"></div>
          <div id="simCursor" class="sim-cursor hidden"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#1F1E1D" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
          <div id="deskFlash" class="desk-flash"></div>
          <div id="startMenu" class="start-menu hidden"></div>
          <div class="taskbar">
            <div class="tb-start" id="tbStart" data-tip="Start menu">${C.logo()}</div>
            <div class="tb-app" data-open="terminal"><span style="font:700 12px var(--mono);color:#E8916E">&gt;_</span> Terminal</div>
            <div class="tb-app" data-open="files">📁 Files</div>
            <div class="tb-app" data-open="editor"><span style="color:#8EC5F0;font-weight:700">{ }</span> Code</div>
            <div class="tb-app" data-open="browser">🌐 Browser</div>
            <div class="tb-app" data-open="docs">${C.logo('tiny')} Quick Ref</div>
            <div class="tb-clock" id="tbClock"></div>
          </div>
        </div>
        <aside class="coach" id="coach"></aside>
      </div></div>`;
      root = host;
      bindDesk();
      tickClock(); clockTimer = setInterval(tickClock, 15000);
      C.onTermClick = (key) => { showTermInCoach(key); return true; };
      const m = arg && C.MISSIONS.find((x) => x.id === arg);
      if (m) startMission(m);
      else { openTerminal(); renderCoach(); welcome(); }
    },
    unmount() { clearInterval(clockTimer); S = null; C.onTermClick = null; },
  });

  function icon(id, img, label) { return `<div class="desk-icon" data-open="${id}">${img}<span>${label}</span></div>`; }
  function tickClock() {
    const el = C.$('#tbClock'); if (!el) return;
    const d = new Date();
    el.innerHTML = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<br>${d.toLocaleDateString()}`;
  }

  function bindDesk() {
    const desk = C.$('#desk');
    desk.addEventListener('dblclick', (e) => { const i = e.target.closest('.desk-icon'); if (i) openApp(i.dataset.open); });
    desk.addEventListener('click', (e) => {
      const i = e.target.closest('.desk-icon');
      C.$$('.desk-icon').forEach((d) => d.classList.toggle('sel', d === i));
      if (i) openApp(i.dataset.open); // single click also opens: friendlier for beginners
      const t = e.target.closest('.tb-app'); if (t) openApp(t.dataset.open, true);
      const sm = C.$('#startMenu');
      if (e.target.closest('#tbStart')) { toggleStart(); return; }
      if (!e.target.closest('#startMenu')) sm.classList.add('hidden');
    });
  }
  function openApp(id, fromTaskbar) {
    if (id === 'terminal') openTerminal(fromTaskbar);
    else if (id === 'files') openFiles();
    else if (id === 'editor') openEditor();
    else if (id === 'docs') openDocs();
    else if (id === 'browser') openBrowser();
    else if (id === 'missions') { S.coachTab = 'missions'; renderCoach(); }
  }
  function toggleStart() {
    const sm = C.$('#startMenu');
    if (!sm.classList.contains('hidden')) { sm.classList.add('hidden'); return; }
    sm.innerHTML = `<h4>${C.logo('sm')} Claude Code Simulator</h4>
      <div class="sm-item" data-sm="terminal">&gt;_ Terminal</div>
      <div class="sm-item" data-sm="files">📁 Files</div>
      <div class="sm-item" data-sm="editor">{ } Code editor</div>
      <div class="sm-item" data-sm="browser">🌐 Browser</div>
      <div class="sm-item" data-sm="docs">${C.logo('tiny')} Quick Reference</div>
      <div class="sm-item" data-sm="missions">🎯 Missions</div>
      <div class="sm-item" data-sm="free">🧪 Free play (no mission)</div>
      <div class="sm-item" data-sm="reset">↺ Reset the simulator</div>`;
    sm.classList.remove('hidden');
    sm.onclick = (e) => {
      const it = e.target.closest('[data-sm]'); if (!it) return;
      sm.classList.add('hidden');
      const a = it.dataset.sm;
      if (a === 'free') freePlay();
      else if (a === 'reset') C.render();
      else openApp(a);
    };
  }

  // ----------------------------------------------------------- windows
  function openWin(id, opts) {
    const layer = C.$('#winLayer');
    let w = S.wins[id];
    if (w && document.body.contains(w)) { w.classList.remove('hidden'); focusWin(w); return { win: w, body: w.querySelector('.win-body'), existed: true }; }
    const desk = C.$('#desk').getBoundingClientRect();
    w = document.createElement('div');
    w.className = 'win ' + (opts.cls || '');
    const W = Math.min(opts.w, desk.width - 40), H = Math.min(opts.h, desk.height - 80);
    w.style.width = W + 'px'; w.style.height = H + 'px';
    w.style.left = Math.max(10, Math.min(opts.x, desk.width - W - 10)) + 'px';
    w.style.top = Math.max(8, Math.min(opts.y, desk.height - H - 58)) + 'px';
    w.innerHTML = `<div class="win-bar">${opts.icon || C.logo()}<div class="win-title">${opts.title}</div>
      <div class="win-btn" data-w="min" title="Minimize">—</div><div class="win-btn" data-w="max" title="Maximize">▢</div><div class="win-btn close" data-w="close" title="Close">✕</div></div>
      <div class="win-body"></div><div class="win-resize"></div>`;
    layer.appendChild(w);
    S.wins[id] = w;
    w.dataset.id = id;
    w.addEventListener('mousedown', () => focusWin(w));
    w.querySelector('.win-bar').addEventListener('dblclick', () => w.classList.toggle('max'));
    w.querySelector('.win-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      if (b.dataset.w === 'close') { w.remove(); delete S.wins[id]; syncTaskbar(); }
      if (b.dataset.w === 'min') { w.classList.add('hidden'); syncTaskbar(); }
      if (b.dataset.w === 'max') w.classList.toggle('max');
    });
    drag(w, w.querySelector('.win-bar'), false);
    drag(w, w.querySelector('.win-resize'), true);
    focusWin(w);
    return { win: w, body: w.querySelector('.win-body'), existed: false };
  }
  function focusWin(w) {
    C.$$('.win').forEach((x) => x.classList.remove('focused'));
    w.classList.add('focused'); w.style.zIndex = ++S.z;
    syncTaskbar();
    if (w.dataset.id === 'terminal') setTimeout(() => { const i = w.querySelector('.term-input'); if (i) i.focus(); }, 0);
  }
  function syncTaskbar() {
    C.$$('.tb-app').forEach((t) => {
      const w = S.wins[t.dataset.open];
      t.classList.toggle('open', !!(w && document.body.contains(w)));
      t.classList.toggle('active', !!(w && w.classList.contains('focused') && !w.classList.contains('hidden')));
    });
  }
  function drag(win, handle, resize) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.win-btn')) return;
      if (win.classList.contains('max')) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const r = { l: win.offsetLeft, t: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resize) { win.style.width = Math.max(320, r.w + dx) + 'px'; win.style.height = Math.max(200, r.h + dy) + 'px'; }
        else { win.style.left = (r.l + dx) + 'px'; win.style.top = Math.max(0, r.t + dy) + 'px'; }
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
  }

  // ----------------------------------------------------------- terminal
  let T = null; // terminal DOM refs
  function openTerminal() {
    const desk = C.$('#desk').getBoundingClientRect();
    const { body, existed } = openWin('terminal', { title: 'Terminal: ' + S.cwd, cls: 'term', w: Math.min(860, desk.width - 140), h: desk.height - 120, x: 110, y: 20,
      icon: '<span style="font:700 12px var(--mono);color:#E8916E">&gt;_</span>' });
    if (existed && T) return;
    body.innerHTML = `<div class="term-body"><div class="term-out"></div><div class="term-in"></div></div>`;
    T = { body: body.querySelector('.term-body'), out: body.querySelector('.term-out'), inWrap: body.querySelector('.term-in') };
    T.body.addEventListener('mouseup', () => { if (!window.getSelection().toString()) focusInput(); });
    T.out.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-choice]');
      if (opt && S.waiter) answer(opt.dataset.choice);
    });
    drawInput();
  }
  function setTermTitle() { const w = S.wins.terminal; if (w) w.querySelector('.win-title').textContent = 'Terminal: ' + S.cwd + (S.inClaude ? '  (claude)' : ''); }
  function focusInput() { const i = T && T.inWrap.querySelector('.term-input'); if (i) i.focus(); }
  function scroll() { if (T) T.body.scrollTop = T.body.scrollHeight; }
  function line(html, cls) {
    const d = document.createElement('div');
    d.className = 'term-line' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    T.out.appendChild(d); scroll();
    return d;
  }
  const print = (s, cls) => line(fmt(s), cls);
  function shellPrompt() { return `<span class="term-prompt">you@laptop</span>:<span class="term-path">${esc(S.cwd)}</span>$ `; }

  const MODE_TEXT = {
    default: '<span>? for shortcuts</span>',
    accept: '<span class="mode-accept">⏵⏵ accept edits on</span> <span>(shift+tab to cycle)</span>',
    plan: '<span class="mode-plan">⏸ plan mode on</span> <span>(shift+tab to cycle)</span>',
  };
  function drawInput() {
    if (!T) return;
    setTermTitle();
    S.ac = null; // a fresh input never inherits an old autocomplete list
    if (S.busy && !S.waiter) { T.inWrap.innerHTML = ''; return; }
    if (S.waiter) {
      T.inWrap.innerHTML = `<div class="term-input-wrap"><span class="pfx t-yellow">❯ choose ${S.waiter.range}: </span><input class="term-input" spellcheck="false" autocomplete="off"></div>`;
    } else if (S.inClaude) {
      T.inWrap.innerHTML = `<div class="term-input-wrap claude ${S.mode}"><span class="pfx t-dim">&gt; </span><input class="term-input" spellcheck="false" autocomplete="off" placeholder="${S.mission ? '' : 'Try "explain this project", /help, or press Shift+Tab'}"></div>
        <div class="term-ac hidden"></div>
        <div class="term-status"><span>${MODE_TEXT[S.mode]}</span><span>${S.model} · ${esc(S.cwd)}</span></div>`;
    } else {
      T.inWrap.innerHTML = `<div class="term-input-wrap"><span class="pfx">${shellPrompt()}</span><input class="term-input" spellcheck="false" autocomplete="off"></div>`;
    }
    const input = T.inWrap.querySelector('.term-input');
    input.addEventListener('keydown', onKey);
    input.addEventListener('input', () => autocomplete(input));
    scroll();
    if (S.wins.terminal && S.wins.terminal.classList.contains('focused')) input.focus();
  }

  const BUILTIN_CMDS = [
    ['/help', 'Show help and available commands'], ['/init', 'Create a CLAUDE.md for this project'], ['/clear', 'Clear conversation history'],
    ['/compact', 'Summarize conversation to free context'], ['/context', 'Visualize context usage'], ['/cost', 'Show token usage & cost'],
    ['/model', 'Choose the AI model'], ['/permissions', 'View/edit allow & deny rules'], ['/memory', 'Edit memory (CLAUDE.md) files'],
    ['/agents', 'Manage subagents'], ['/mcp', 'Manage MCP servers'], ['/hooks', 'Manage hooks'], ['/config', 'Open settings'],
    ['/status', 'Version, model, account, settings'], ['/doctor', 'Diagnose installation'], ['/rewind', 'Restore code/conversation to a checkpoint'],
    ['/resume', 'Resume a previous conversation'], ['/review', 'Review code'], ['/security-review', 'Security review of pending changes'],
    ['/plugin', 'Manage plugins'], ['/output-style', 'Change the output style'], ['/statusline', 'Set up the status line'],
    ['/add-dir', 'Add another working directory'], ['/export', 'Export the conversation'], ['/install-github-app', 'Set up Claude GitHub Actions'],
    ['/login', 'Sign in'], ['/exit', 'Exit Claude Code'],
  ];
  function customCmds() {
    const out = [];
    for (const p in S.fs) {
      let m = p.match(/^~\/shop-app\/\.claude\/commands\/(.+)\.md$/); if (m) out.push(['/' + m[1], '(project) ' + ((S.fs[p].content.match(/description: (.*)/) || [])[1] || 'custom command')]);
      m = p.match(/^~\/shop-app\/\.claude\/skills\/([^/]+)\/SKILL\.md$/); if (m) out.push(['/' + m[1], '(skill) ' + ((S.fs[p].content.match(/description: ([^.]*)/) || [])[1] || '')]);
    }
    return out;
  }
  function autocomplete(input) {
    const ac = T.inWrap.querySelector('.term-ac'); if (!ac) return;
    const v = input.value;
    if (!S.inClaude || !v.startsWith('/') || v.includes(' ')) { ac.classList.add('hidden'); S.ac = null; return; }
    const list = [...customCmds(), ...BUILTIN_CMDS].filter(([c]) => c.startsWith(v.toLowerCase()));
    if (!list.length) { ac.classList.add('hidden'); S.ac = null; return; }
    S.ac = { list, i: 0 };
    ac.innerHTML = list.slice(0, 8).map(([c, d], i) => `<div class="${i === 0 ? 'on' : ''}" data-ac="${c}"><b>${c}</b><span>${esc(d)}</span></div>`).join('');
    ac.classList.remove('hidden');
    ac.onclick = (e) => { const d = e.target.closest('[data-ac]'); if (d) { input.value = d.dataset.ac; ac.classList.add('hidden'); S.ac = null; input.focus(); } };
  }

  function onKey(e) {
    const input = e.target;
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (S.inClaude && !S.waiter) cycleMode();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); handleEscape(); return; }
    if (S.ac && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      S.ac.i = (S.ac.i + (e.key === 'ArrowDown' ? 1 : -1) + Math.min(8, S.ac.list.length)) % Math.min(8, S.ac.list.length);
      C.$$('.term-ac div', T.inWrap).forEach((d, i) => d.classList.toggle('on', i === S.ac.i));
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const acBox = T.inWrap.querySelector('.term-ac');
      if (S.ac && acBox) { input.value = S.ac.list[S.ac.i][0] + ' '; acBox.classList.add('hidden'); S.ac = null; }
      return;
    }
    if (e.key === 'ArrowUp' && S.history.length) { e.preventDefault(); S.hIdx = Math.max(0, (S.hIdx < 0 ? S.history.length : S.hIdx) - 1); input.value = S.history[S.hIdx]; return; }
    if (e.key === 'ArrowDown' && S.hIdx >= 0) { e.preventDefault(); S.hIdx = Math.min(S.history.length, S.hIdx + 1); input.value = S.history[S.hIdx] || ''; return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const acBox = T.inWrap.querySelector('.term-ac');
      if (S.ac && S.inClaude && acBox && input.value.startsWith('/') && input.value.trim() !== S.ac.list[S.ac.i][0] && !input.value.includes(' ')) {
        input.value = S.ac.list[S.ac.i][0]; S.ac = null; acBox.classList.add('hidden');
      }
      const v = input.value; input.value = '';
      submit(v);
    }
  }

  function cycleMode() {
    const order = ['default', 'accept', 'plan'];
    S.mode = order[(order.indexOf(S.mode) + 1) % order.length];
    drawInput();
    const names = { default: 'Default mode: Claude asks before edits and commands.', accept: 'Accept-edits mode: file edits are applied without asking; commands still ask.', plan: 'Plan mode: read-only research and planning. Nothing gets changed.' };
    pushCard('⇧ Shift+Tab', names[S.mode], ['permission-mode', 'shift-tab']);
    stepKey('shift+tab');
  }
  function handleEscape() {
    if (S.waiter) { answer('esc'); return; }
    if (S.busy) { S.interrupted = true; }
    else if (S.inClaude) {
      print('[d]  ⎿  Interrupted · What should Claude do instead?[/]');
      pushCard('⎋ Esc', 'Esc interrupts Claude mid-task without losing context. Press it twice to open the rewind menu.', ['escape', 'checkpoint']);
    }
    stepKey('escape');
  }

  // Permission / choice prompts: returns a promise resolved with "1", "2", "3" or "esc"
  function ask(range) {
    return new Promise((resolveFn) => { S.waiter = { range, resolve: resolveFn }; drawInput(); });
  }
  function answer(v) {
    const w = S.waiter; if (!w) return;
    const valid = w.range.includes('3') ? ['1', '2', '3', 'esc'] : ['1', '2', 'esc'];
    if (!valid.includes(v)) { print('[d]  Type a number from the list (or press Esc).[/]'); return; }
    S.waiter = null;
    C.$$('.cc-perm .opt', T.out).forEach((o) => o.removeAttribute('data-choice'));
    w.resolve(v);
    drawInput();
  }

  // ----------------------------------------------------------- submit
  async function submit(raw) {
    const v = raw.replace(/\s+$/, '');
    if (S.waiter) { line((S.inClaude ? '' : '') + `<span class="t-yellow">❯ ${esc(v)}</span>`); answer(v.trim().toLowerCase()); return; }
    if (S.busy) return;
    if (v.trim()) { S.history.push(v); S.hIdx = -1; }
    if (S.inClaude) {
      line(`<span class="t-dim">&gt;</span> ${esc(v)}`, 'echo');
      if (v.trim() && !/^[/!]/.test(v.trim()) && !/^[123]$/.test(v.trim())) S.prompts.push(v.trim());
    }
    else line(shellPrompt() + esc(v));
    if (!v.trim()) return;

    const step = currentStep();
    const matched = step && stepMatches(step, v);
    S.busy = true; S.interrupted = false; drawInput();
    let ok = true;
    try {
      if (matched && step.run) ok = await runEvents(step.run);
      else ok = await handleDefault(v.trim(), matched);
    } catch (err) { console.error(err); print('[r]Simulator error: ' + esc(err.message) + '[/]'); ok = false; }
    S.busy = false;
    drawInput();
    if (step && matched && ok !== false) completeStep();
    else if (step && !matched && S.mission) nudge(step);
  }

  function stepMatches(step, v) {
    if (step.key || step.action) return false;
    const s = v.trim();
    if (step.match) return step.match.test(s);
    if (step.keys) {
      const low = s.toLowerCase();
      if (!S.inClaude) return false;
      return step.keys.every((k) => new RegExp(k, 'i').test(low)) && !low.startsWith('/');
    }
    return false;
  }

  // ----------------------------------------------------------- events
  async function runEvents(events) {
    for (const ev of events) {
      if (S.interrupted) { print('[r]  ⎿  Interrupted by user[/]'); return false; }
      const [kind, ...a] = ev;
      const r = await EVENTS[kind](...a);
      if (r === false) return false;
    }
    return true;
  }
  function toolLine(name, arg) {
    const tip = TOOL_INFO[name] ? ` data-tip="${esc(TOOL_INFO[name])}"` : '';
    return line(`<span class="t-orange">⏺</span> <span class="t-bold"${tip} style="cursor:help">${esc(name)}</span>(${esc(arg)})`);
  }
  function result(text, cls) { return line(`<span class="t-dim">  ⎿  </span>${fmt(text)}`, cls); }
  function bulletText(text) {
    const html = fmt(text).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
    return line(`<span class="t-orange">⏺</span> ${html}`);
  }
  function permBox(question, options) {
    const html = `<div class="cc-perm"><div class="t-bold">${question}</div>${options.map((o, i) => `<div class="opt" data-choice="${i + 1}">${i === 0 ? '❯' : ' '} ${i + 1}. ${o}</div>`).join('')}</div>`;
    return line(html);
  }
  function allowedByRules(cmd) {
    if (S.mode === 'bypass') return true;
    if ([...S.allowCmds].some((p) => cmd.startsWith(p))) return true;
    const st = S.fs['~/shop-app/.claude/settings.json'];
    if (st && S.cwd.startsWith('~/shop-app')) {
      const allows = (st.content.match(/"Bash\(([^)]+)\)"/g) || []).map((m) => m.slice(6, -2).replace(/:\*$/, ''));
      if (allows.some((a) => cmd === a || cmd.startsWith(a))) return true;
    }
    return false;
  }
  function fileChanged(path, created) {
    refreshFiles(path, created);
    if (S.editorTabs.includes(path)) renderEditor();
  }

  const EVENTS = {
    async think(ms) {
      const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
      const l = line(`<span class="spinner-line">${C.logo()}</span> <span class="t-orange">${verb}…</span> <span class="t-dim">(esc to interrupt)</span>`);
      await sleep(ms || 700); l.remove();
    },
    async say(text) { await sleep(250); bulletText(text); await sleep(200); },
    async out(lines) { for (const l of lines) { print(l); await sleep(60); } },
    async tool(name, arg, res) {
      await sleep(260); toolLine(name, arg); await sleep(220);
      if (res) result(`[d]${res}[/]`);
    },
    async setmode(m) { S.mode = m; drawInput(); },
    async todo(items) {
      await sleep(200);
      line(`<span class="t-orange">⏺</span> <span class="t-bold">Update Todos</span>`);
      items.forEach((it, i) => result(`${i === 0 ? '[y]◼[/]' : '☐'} ${it}`));
    },
    async edit(path, diff, newContent) {
      await sleep(300);
      const r = rel(path, S.cwd);
      toolLine('Update', r);
      line(`<div style="margin:4px 0 4px 18px;border-left:2px solid #3a3530;padding-left:10px">${diff.map((l) => {
        const c = l[0] === '+' ? 't-add' : l[0] === '-' ? 't-del' : 't-dim';
        return `<div class="${c}">${esc(l) || ' '}</div>`;
      }).join('')}</div>`);
      if (S.mode !== 'accept' && S.mode !== 'bypass') {
        permBox(`Do you want to make this edit to ${esc(base(path))}?`, ['Yes', 'Yes, allow all edits during this session (shift+tab)', 'No, and tell Claude what to do differently (esc)']);
        pushCard('🔐 Permission prompt', 'Claude is asking before it changes a file. **Read the red (removed) and green (added) lines**, then type **1** (or click Yes) to approve.', ['permission-mode']);
        const c = await ask('1-3');
        if (c === '2') { S.mode = 'accept'; drawInput(); }
        if (c === '3' || c === 'esc') { result('[r]Edit rejected. What should Claude do instead?[/]'); return false; }
      }
      if (newContent != null) S.fs[path] = { ...(S.fs[path] || {}), content: newContent, notes: S.fs[path] && S.fs[path].notes };
      else if (S.fs[path]) {
        const adds = diff.filter((l) => l[0] === '+').map((l) => l.slice(2));
        if (adds.length && !diff.some((l) => l[0] === '-')) S.fs[path].content += '\n' + adds.join('\n');
      }
      result(`[d]Updated ${esc(r)} with ${diff.filter((l) => l[0] === '+').length} additions and ${diff.filter((l) => l[0] === '-').length} removals[/]`);
      fileChanged(path, false);
    },
    async write(path, content) {
      await sleep(300);
      const spec = C.SIM_CREATED[path] || {};
      content = content != null ? content : spec.content || '';
      const r = rel(path, S.cwd);
      toolLine('Write', r);
      const preview = content.split('\n').slice(0, 8);
      line(`<div style="margin:4px 0 4px 18px;border-left:2px solid #3a3530;padding-left:10px">${preview.map((l) => `<div class="t-add">+ ${esc(l)}</div>`).join('')}${content.split('\n').length > 8 ? `<div class="t-dim">  … ${content.split('\n').length - 8} more lines</div>` : ''}</div>`);
      if (S.mode !== 'accept' && S.mode !== 'bypass') {
        permBox(`Do you want to create ${esc(base(path))}?`, ['Yes', 'Yes, allow all edits during this session (shift+tab)', 'No, and tell Claude what to do differently (esc)']);
        pushCard('🔐 Permission prompt', `Claude wants to create **${esc(r)}**. Check the preview, then type **1** to approve.`, ['permission-mode']);
        const c = await ask('1-3');
        if (c === '2') { S.mode = 'accept'; drawInput(); }
        if (c === '3' || c === 'esc') { result('[r]Rejected. What should Claude do instead?[/]'); return false; }
      }
      S.fs[path] = { content, notes: spec.notes };
      result(`[d]Wrote ${content.split('\n').length} lines to ${esc(r)}[/]`);
      fileChanged(path, true);
    },
    async 'write-silent'(path, content) {
      const spec = C.SIM_CREATED[path] || {};
      S.fs[path] = { content: content != null ? content : spec.content, notes: spec.notes };
      fileChanged(path, true);
    },
    async bash(cmd, output, needsPerm) {
      await sleep(300);
      const shown = cmd.split('\n')[0] + (cmd.includes('\n') ? ' …' : '');
      toolLine('Bash', shown);
      if (needsPerm !== false && !allowedByRules(cmd)) {
        const prefix = cmd.split(' ').slice(0, 2).join(' ');
        permBox('Bash command: ' + esc(shown) + '<br><span class="t-dim">Do you want to proceed?</span>', ['Yes', `Yes, and don't ask again for <span class="t-yellow">${esc(prefix)}</span> commands in this project`, 'No, and tell Claude what to do differently (esc)']);
        pushCard('🔐 Command approval', `Claude wants to run \`${esc(shown)}\`. Commands can change things outside your files, so read them before approving. Option 2 adds an **allow rule** so you won't be asked again.`, ['permission-rules']);
        const c = await ask('1-3');
        if (c === '2') S.allowCmds.add(prefix);
        if (c === '3' || c === 'esc') { result('[r]Command rejected.[/]'); return false; }
      }
      await sleep(350);
      if (!output.length) result('[d](no output)[/]');
      output.forEach((l, i) => (i === 0 ? result(l) : print('     ' + l)));
    },
    async plan(lines) {
      await sleep(300);
      line(`<div class="cc-box" style="border-color:#5AA7A0">${lines.map(fmt).join('\n')}</div>`);
      permBox('Would you like to proceed?', ['Yes, and auto-accept edits', 'Yes, and manually approve edits', 'No, keep planning']);
      S.awaitPlan = true;
    },
    async agent(name, task, inner, summary) {
      await sleep(300);
      line(`<span class="t-orange">⏺</span> <span class="t-bold" data-tip="${esc(TOOL_INFO.Agent)}" style="cursor:help">${esc(name)}</span>(${esc(task.slice(0, 48))}…)`);
      result(`[d]Prompt sent to the subagent (its ONLY context):[/]`);
      print(`[p]     "${task}"[/]`);
      for (const [, n, arg, res] of inner) { await sleep(380); print(`[d]     ⎿ ${n}(${arg}) · ${res}[/]`); }
      await sleep(300);
      result(`[d]Done (${inner.length} tool uses · 6.2k tokens · 9s)[/]`);
      print(`[g]     Summary returned:[/] ${summary}`);
    },
    async hook(evt, cmd, res) {
      await sleep(250);
      result(`[p]${evt} hook[/] [d]→[/] ${cmd}`);
      print(`[d]     ${res}[/]`);
    },
    async blocked(what, msg) {
      await sleep(250);
      result(`[r]${what} blocked: ${msg}[/]`);
    },
    async mcpcall(tool, args, res) {
      await sleep(350);
      const [, server, t] = tool.split('__');
      line(`<span class="t-orange">⏺</span> <span class="t-bold">${esc(server)} - ${esc(t)}</span> <span class="t-dim">(MCP)</span>(${esc(args)})`);
      if (S.mode !== 'accept' && !S.allowTools.has(tool)) {
        permBox(`Allow tool <span class="t-yellow">${esc(tool)}</span>?`, ['Yes', `Yes, and don't ask again for ${esc(tool)}`, 'No (esc)']);
        const c = await ask('1-3');
        if (c === '2') S.allowTools.add(tool);
        if (c === '3' || c === 'esc') { result('[r]Rejected.[/]'); return false; }
      }
      res.forEach((l, i) => (i === 0 ? result(l) : print('     ' + l)));
    },
  };

  // ------------------------------------------- browser + computer-use events
  const PW = { navigate: 'browser_navigate', snapshot: 'browser_snapshot', type: 'browser_type', click: 'browser_click', screenshot: 'browser_take_screenshot', fill: 'browser_fill_form' };
  Object.assign(EVENTS, {
    async setflag(name) { S[name] = true; },
    // Playwright MCP: Claude targets elements by the ref ids in an accessibility snapshot
    async browser(action, arg, extra) {
      await sleep(300);
      const tool = 'mcp__playwright__' + PW[action];
      const label = arg && REF_LABEL[arg];
      const argText = action === 'navigate' ? `url: "${arg}"` : action === 'type' ? `element: "${label}", target: "${arg}", text: "${extra}"` : action === 'click' ? `element: "${label}", target: "${arg}"` : '';
      line(`<span class="t-orange">⏺</span> <span class="t-bold" data-tip="An MCP tool from the Playwright server. It controls a real browser." style="cursor:help">playwright - ${PW[action]}</span> <span class="t-dim">(MCP)</span>(${esc(argText)})`);
      if (S.mode !== 'accept' && !S.allowTools.has('playwright')) {
        permBox(`Allow tool <span class="t-yellow">${esc(tool)}</span>?`, ['Yes', 'Yes, and don\'t ask again for <span class="t-yellow">playwright</span> tools', 'No (esc)']);
        pushCard('🔐 MCP tool approval', 'MCP tools ask for permission like built-in tools. Option **2** trusts every tool from this server for the session; you can also pre-approve them with an allow rule like `mcp__playwright`.', ['mcp', 'permission-rules']);
        const c = await ask('1-3');
        if (c === '2') S.allowTools.add('playwright');
        if (c === '3' || c === 'esc') { result('[r]Rejected.[/]'); return false; }
      }
      if (action === 'navigate') { openBrowser(arg, true); await sleep(500); result(`[d]Navigated to ${arg} · page title: "${SITE[S.br.url].title}"[/]`); }
      if (action === 'snapshot') {
        await sleep(300);
        result('[d]Page snapshot (accessibility tree):[/]');
        snapshotLines().forEach((l) => print('     ' + l));
      }
      if (action === 'type') { await browserAct(arg, 'type', extra); result(`[d]Typed into "${label}"[/]`); }
      if (action === 'click') { await browserAct(arg, 'click'); result(`[d]Clicked "${label}"[/]`); }
      if (action === 'screenshot') { await flash(S.wins.browser); result('[d]Saved screenshot page-signup.png (also shown to Claude)[/]'); }
    },
    // Computer use: Claude sees screenshots and answers with pixel coordinates
    async cu(action, selector, extra) {
      const el = selector ? C.$(selector) : null;
      const input = {};
      if (el && /click|move/.test(action)) input.coordinate = screenCoord(el);
      if (action === 'type' || action === 'key') input.text = extra;
      if (action === 'scroll') Object.assign(input, { coordinate: el ? screenCoord(el) : [640, 400], scroll_direction: 'down', scroll_amount: extra || 3 });
      if (action === 'zoom' && el) { const r = screenRect(el); input.region = r; }
      print(`[d]← tool_use[/]  {"name": "[o]${action}[/]", "toolset_name": "computer", "input": ${JSON.stringify(input)}}`);
      if (action === 'screenshot') { await flash(C.$('#desk')); print('[d]→ tool_result: [image 1280×800 PNG][/]'); return; }
      if (action === 'zoom' && el) { await zoomBox(el); print('[d]→ tool_result: [zoomed image of that region][/]'); return; }
      if (el) await moveCursor(el);
      if (/click/.test(action) && el) {
        await clickFx();
        if (el.closest('.br-page')) await browserAct(el.dataset.ref, 'click', null, true);
        else if (action === 'double_click') el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        else el.click();
      }
      if (action === 'type' && el && el.closest('.br-page')) await browserAct(el.dataset.ref, 'type', extra, true);
      if (action === 'scroll' && el) { el.scrollBy({ top: 160, behavior: 'smooth' }); }
      await sleep(250);
      print('[d]→ tool_result: OK[/]');
    },
    async pause(ms) { await sleep(ms || 600); },
    // Pretend GitHub pages in the Browser window
    async ghpage(url, patch) { Object.assign(S.gh, patch || {}); S.br.url = url; openBrowser(url); await sleep(400); },
    async ghupdate(patch) { Object.assign(S.gh, patch || {}); renderPage(); await sleep(300); },
    async choice(question, options) {
      permBox(esc(question), options.map(esc));
      const c = await ask(options.length > 2 ? '1-3' : '1-2');
      print(`[g]✔[/] ${esc(options[(+c || 1) - 1])}`);
    },
    async 'cu-approved'(...args) {
      if (S.cuDenied) { print('[d](skipped: the human denied it, so Claude is told and stops here)[/]'); return; }
      return EVENTS.cu(...args);
    },
    // A Playwright test replaying the signup flow without Claude
    async replay() {
      S.br = { url: 'http://localhost:3000/signup', values: {}, checked: false };
      openBrowser(S.br.url, true);
      await sleep(400);
      await browserAct('e5', 'type', 'ana+shop@mail.com');
      await browserAct('e7', 'type', 'Test1234!');
      await browserAct('e9', 'click');
      await browserAct('e11', 'click');
      await sleep(300);
    },
    async calc() {
      const desk = C.$('#desk').getBoundingClientRect();
      const { body } = openWin('calc', { title: 'Calculator', icon: '🧮', w: 240, h: 300, x: desk.width / 2 - 120, y: 80 });
      body.innerHTML = `<div class="calc"><div class="calc-d">0</div><div class="calc-k">${'789÷456×123−0.=+'.split('').map((k) => `<span>${k}</span>`).join('')}</div></div>`;
      await sleep(300);
    },
    async 'cu-confirm'(question) {
      line(`<div class="cc-perm"><div class="t-bold">⚠ agent.py: Claude wants to ${esc(question)}</div><div class="t-dim">Your harness pauses here: consequential actions need a human.</div><div class="opt" data-choice="1">❯ 1. Allow</div><div class="opt" data-choice="2">  2. Deny</div></div>`);
      pushCard('🙋 Human in the loop', 'Good computer-use apps **pause before consequential actions** (submitting forms, payments, deleting, accepting terms) and ask a person. Type **1** to allow or **2** to deny.', ['escalation']);
      const c = await ask('1-2');
      print(c === '1' ? '[g]✔ Approved by human[/]' : '[r]✖ Denied: Claude is told the action was not allowed[/]');
      S.cuDenied = c !== '1';
    },
  });

  // ---------------------------------------------------------- browser app
  const REF_LABEL = { e2: 'Create your account heading', e5: 'Email textbox', e7: 'Password textbox', e9: 'I agree to the terms checkbox', e11: 'Create account button' };
  const SITE = {
    'http://localhost:3000/signup': { title: 'Shop App – Sign up' },
    'http://localhost:3000/welcome': { title: 'Shop App – Welcome' },
  };
  function openBrowser(url, automated) {
    const desk = C.$('#desk').getBoundingClientRect();
    const { body, existed } = openWin('browser', { title: 'Browser', icon: '🌐', w: 600, h: 470, x: desk.width - 650, y: 26 });
    if (!existed || !body.querySelector('.br')) body.innerHTML = '<div class="br"><div class="br-bar"><span class="br-nav">◀ ▶ ⟳</span><div class="br-url"></div><span class="br-badge hidden">🤖 Automated</span></div><div class="br-page"></div></div>';
    if (url) S.br.url = url;
    if (!S.br.url) S.br.url = 'http://localhost:3000/signup';
    if (automated) body.querySelector('.br-badge').classList.remove('hidden');
    renderPage();
  }
  function renderPage() {
    const w = S.wins.browser; if (!w) return;
    const page = w.querySelector('.br-page');
    w.querySelector('.br-url').textContent = S.br.url;
    w.querySelector('.win-title').textContent = (SITE[S.br.url] || { title: 'Page' }).title;
    const v = S.br.values;
    const custom = C.SIM_PAGES && C.SIM_PAGES[S.br.url];
    if (custom) {
      w.querySelector('.win-title').textContent = custom.title;
      page.innerHTML = `<div class="gh">${custom.render(S.gh)}</div>`;
      return;
    }
    if (S.br.url.endsWith('/welcome')) {
      page.innerHTML = `<div class="site"><div class="site-nav">🛒 Shop App</div><div class="site-ok">🎉</div><h2>Welcome aboard!</h2><p>Account created for <b>${esc(v.e5 || '')}</b>.</p><p class="small muted">A confirmation email is on its way.</p></div>`;
      return;
    }
    page.innerHTML = `<div class="site"><div class="site-nav">🛒 Shop App <span>Products · Cart</span></div>
      <h2 data-ref="e2">Create your account</h2>
      <label>Email</label><div class="site-input" data-ref="e5">${esc(v.e5 || '')}</div>
      <label>Password</label><div class="site-input" data-ref="e7">${v.e7 ? '•'.repeat(v.e7.length) : ''}</div>
      <div class="site-chk" data-ref="e9"><span class="cb ${S.br.checked ? 'on' : ''}">${S.br.checked ? '✓' : ''}</span> I agree to the terms</div>
      <div class="site-btn" data-ref="e11">Create account</div>
      ${S.br.error ? `<div class="site-err">${esc(S.br.error)}</div>` : ''}</div>`;
  }
  function snapshotLines() {
    if (S.br.url.endsWith('/welcome')) return ['- heading "Welcome aboard!" [level=2] [ref=e3]', '- paragraph: Account created for ' + (S.br.values.e5 || '')];
    return ['- Page URL: ' + S.br.url, '- Page Title: ' + SITE[S.br.url].title, '- Page Snapshot:', '  - heading "Create your account" [level=2] [ref=e2]',
      `  - textbox "Email" [ref=e5]${S.br.values.e5 ? ': ' + S.br.values.e5 : ''}`, '  - textbox "Password" [ref=e7]', `  - checkbox "I agree to the terms" [${S.br.checked ? 'checked' : 'unchecked'}] [ref=e9]`, '  - button "Create account" [ref=e11]',
      ...(S.br.error ? [`  - alert: ${S.br.error}`] : [])];
  }
  async function browserAct(ref, action, text, cursorDone) {
    const w = S.wins.browser; if (!w) return;
    const el = w.querySelector(`[data-ref="${ref}"]`); if (!el) return;
    if (!cursorDone) { await moveCursor(el); if (action === 'click') await clickFx(); }
    el.classList.add('site-focus');
    if (action === 'type') {
      S.br.values[ref] = '';
      for (const ch of text) { S.br.values[ref] += ch; renderPage(); w.querySelector(`[data-ref="${ref}"]`).classList.add('site-focus'); await sleep(40); }
    }
    if (action === 'click') {
      if (ref === 'e9') S.br.checked = !S.br.checked;
      if (ref === 'e11') {
        if (!S.br.checked) S.br.error = 'Please accept the terms first.';
        else { S.br.error = ''; renderPage(); await sleep(300); S.br.url = 'http://localhost:3000/welcome'; }
      }
      renderPage();
    }
    await sleep(200);
  }

  // ------------------------------------------------- cursor, flash, coords
  function deskXY(el) {
    const d = C.$('#desk').getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - d.left + r.width / 2, y: r.top - d.top + r.height / 2, dw: d.width, dh: d.height };
  }
  function screenCoord(el) { const p = deskXY(el); return [Math.round(p.x / p.dw * 1280), Math.round(p.y / p.dh * 800)]; }
  function screenRect(el) {
    const d = C.$('#desk').getBoundingClientRect(), r = el.getBoundingClientRect();
    const sx = 1280 / d.width, sy = 800 / d.height;
    return [Math.round((r.left - d.left) * sx), Math.round((r.top - d.top) * sy), Math.round((r.right - d.left) * sx), Math.round((r.bottom - d.top) * sy)];
  }
  async function moveCursor(el) {
    const cur = C.$('#simCursor'); if (!cur || !el) return;
    el.scrollIntoView({ block: 'nearest' });
    const p = deskXY(el);
    if (cur.classList.contains('hidden')) { cur.style.transition = 'none'; cur.style.transform = `translate(${p.dw / 2}px, ${p.dh - 80}px)`; cur.classList.remove('hidden'); await sleep(30); }
    cur.style.transition = 'transform .65s cubic-bezier(.3,.8,.3,1)';
    cur.style.transform = `translate(${p.x - 4}px, ${p.y - 3}px)`;
    await sleep(700);
  }
  async function clickFx() {
    const cur = C.$('#simCursor'); if (!cur) return;
    cur.classList.add('clicking'); await sleep(220); cur.classList.remove('clicking');
  }
  async function flash(target) {
    const f = C.$('#deskFlash'); if (!f) return;
    const d = C.$('#desk').getBoundingClientRect(), r = (target || C.$('#desk')).getBoundingClientRect();
    Object.assign(f.style, { left: r.left - d.left + 'px', top: r.top - d.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    await sleep(500);
  }
  async function zoomBox(el) {
    const f = C.$('#deskFlash'); const d = C.$('#desk').getBoundingClientRect(), r = el.getBoundingClientRect();
    Object.assign(f.style, { left: r.left - d.left - 4 + 'px', top: r.top - d.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    f.classList.remove('go'); f.classList.add('zoom'); await sleep(900); f.classList.remove('zoom');
  }

  // ----------------------------------------------------- default handlers
  async function handleDefault(v, matchedStep) {
    if (S.inClaude) return claudeInput(v, matchedStep);
    return shellInput(v);
  }

  function ls(dir, all) {
    const kids = new Map();
    for (const p in S.fs) {
      if (!p.startsWith(dir + '/')) continue;
      const rest = p.slice(dir.length + 1).split('/');
      const name = rest[0];
      if (!all && name.startsWith('.')) continue;
      kids.set(name, rest.length > 1);
    }
    return [...kids.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  }
  function isDir(p) { return p === '~' || Object.keys(S.fs).some((f) => f.startsWith(p + '/')); }

  async function shellInput(v) {
    const [cmd, ...args] = v.split(/\s+/);
    const argStr = v.slice(cmd.length).trim();
    if (/^(curl .*install\.sh|irm .*install\.ps1|npm (i|install) -g @anthropic-ai\/claude-code)/.test(v)) {
      for (const l of ['Downloading Claude Code…', 'Verifying checksum… ok', 'Installing to ~/.local/bin/claude', '[g]✔ Claude Code installed. Run "claude" in any project folder.[/]']) { print(l); await sleep(350); }
      explainCard('Installing Claude Code', 'The native installer is the recommended way. In real life run this once; afterwards Claude Code auto-updates. Check with `claude --version` and `claude doctor`.', ['claude-code']);
      return;
    }
    if (/^cat\s+\S+\s*\|\s*claude\s+(-p|--print)/.test(v)) {
      await sleep(600);
      print('The crash comes from [y]cartTotal[/] in src/cart.js:3: it calls [y]items.reduce[/] but the request body had no [y]items[/] array, so [y]items[/] is undefined. Default [y]items = [][/] (or validate the body in the route and return 400) to fix it.');
      return;
    }
    switch (cmd) {
      case 'pwd': print(S.cwd.replace('~', '/home/you')); return;
      case 'clear': case 'cls': T.out.innerHTML = ''; return;
      case 'ls': case 'dir': {
        const target = resolve(S.cwd, args.find((a) => !a.startsWith('-')) || '.');
        if (!isDir(target)) { print(`[r]ls: cannot access '${esc(args[0] || '')}': No such file or directory[/]`); return; }
        const all = args.some((a) => /^-\w*a/.test(a));
        const items = ls(target, all);
        print(items.map(([n, d]) => (d ? `[b]${n}/[/]` : n)).join('    ') || '[d](empty)[/]');
        return;
      }
      case 'cd': {
        const target = resolve(S.cwd, argStr || '~');
        if (!isDir(target)) { print(`[r]cd: no such file or directory: ${esc(argStr)}[/]`); return; }
        S.cwd = target; setTermTitle(); return;
      }
      case 'mkdir': print('[d](folder created)[/]'); return;
      case 'cat': case 'type': {
        const p = resolve(S.cwd, args[0]);
        if (!S.fs[p]) { print(`[r]cat: ${esc(args[0] || '')}: No such file[/]`); return; }
        S.fs[p].content.split('\n').forEach((l) => line(esc(l)));
        return;
      }
      case 'code': openEditor(); print('[d]Opening Code editor…[/]'); return;
      case 'echo': print(argStr.replace(/^["']|["']$/g, '')); return;
      case 'node': print('v22.11.0'); return;
      case 'python': case 'python3': case 'py': print('Python 3.13.1'); return;
      case 'git': return gitCmd(args);
      case 'npm': return npmCmd(args);
      case 'help': print('Simulated shell commands: [y]ls cd pwd cat clear git npm code echo claude[/]\nStart Claude Code with [y]claude[/]. Try [y]claude --help[/] too.'); return;
      case 'claude': return claudeCli(args, argStr);
      case 'gh': return ghCli(args, argStr);
      default:
        print(`[r]${esc(cmd)}: command not found[/]`);
        if (/^(\/|init|help)/.test(cmd)) print('[d]Tip: slash commands work inside Claude Code. Type [y]claude[/] first.[/]');
    }
  }

  function gitCmd(args) {
    const sub = args[0];
    if (sub === 'status') { print('On branch main\nnothing to commit, working tree clean'); return; }
    if (sub === 'log') { print('[y]4f2a9c1[/] Allow + and % in email local part\n[y]a81b0de[/] Add cart total endpoint\n[y]19c3f77[/] Initial commit'); return; }
    if (sub === 'diff') { print(args.includes('--stat') ? ' src/auth/validate.js   | 2 [g]+[/][r]-[/]\n tests/validate.test.js | 4 [g]++++[/]\n 2 files changed, 5 insertions(+), 1 deletion(-)' : '[d](see the Code editor for diffs)[/]'); return; }
    print(`[d]git ${esc(args.join(' '))}: ok[/]`);
  }
  async function npmCmd(args) {
    if (args[0] === 'test' || args[0] === 't') {
      for (const l of ['> shop-app@1.4.0 test', '> node --test tests/', '[g]✔[/] sums items', '[g]✔[/] applies discount', '[g]✔[/] accepts a normal email', '[g]✔[/] rejects missing @', '[g]ℹ pass 4 · fail 0[/]']) { print(l); await sleep(90); }
      return;
    }
    if (args[0] === 'start') { print('Server listening on http://localhost:3000 [d](simulated; press Ctrl+C in real life)[/]'); return; }
    print(`[d]npm ${esc(args.join(' '))}: done[/]`);
  }

  // A small, read-mostly GitHub CLI for free play
  async function ghCli(args) {
    const [area, act, n] = args;
    const out = (lines) => lines.forEach((l) => print(l));
    if (area === 'auth' && act === 'status') return out(['github.com', '  [g]✓[/] Logged in to github.com account [B]you[/] (keyring)', '  - Git operations protocol: https', '  - Token scopes: repo, read:org, workflow']);
    if (area === 'repo' && act === 'view') return out(['[B]you/shop-app[/]  [d]Private[/]', 'A tiny online store API used for practice.', '[d]Default branch: main · 3 open issues · 1 open PR[/]']);
    if (area === 'issue' && act === 'list') return out(['#42  Negative totals with big discount codes  [r]bug[/]', '#38  Cart crashes when items is missing        [r]bug[/]', '#35  Add product search                       [b]enhancement[/]']);
    if (area === 'issue' && act === 'view') return out([`[B]Issue #${n || 38}[/]  Open · sam`, 'See the issue thread on github.com (simulated).']);
    if (area === 'pr' && (act === 'list' || act === 'status')) return out(['#43  fix: cap discounts at 0-100%  fix/discount-cap  [y]checks running[/]']);
    if (area === 'pr' && act === 'checks') return out(['[g]✓[/] Tests / test (pull_request)', '[g]✓[/] Claude PR review']);
    if (area === 'run' && act === 'list') return out(['[r]X[/]  Add product search  Tests  feature/search  9182', '[g]✓[/]  Cap discounts       Tests  main            9179']);
    if (area === 'pr' && act === 'create') return out(['[d]Push your branch first, then gh pr create opens a PR (try the "GitHub flow with Claude" mission).[/]']);
    explainCard('GitHub CLI (gh)', 'In this simulator `gh` knows: auth status, repo view, issue list/view, pr list/status/checks, run list. The GitHub missions show the full flow.', ['gh-cli']);
    return out([`[d]gh ${esc(args.join(' '))}: simulated. Try gh issue list, gh pr list or gh run list.[/]`]);
  }

  async function claudeCli(args, argStr) {
    if (!args.length || args[0] === '-c' || args[0] === '--continue' || args[0] === '-r' || args[0] === '--resume') return startClaude(args[0]);
    if (args[0] === '--version' || args[0] === '-v') { print('2.x.x (Claude Code) [d]· simulated[/]'); return; }
    if (args[0] === '--help' || args[0] === '-h') {
      print('Usage: claude [options] [prompt]\n\n  [y]-p, --print[/]            print response and exit (headless)\n  [y]-c, --continue[/]         continue the most recent conversation\n  [y]-r, --resume[/]           resume a conversation\n  [y]--model <model>[/]        choose model\n  [y]--output-format <f>[/]    text | json | stream-json (with -p)\n  [y]--allowedTools <list>[/]  tools allowed without asking\n  [y]--permission-mode <m>[/]  default | acceptEdits | plan | …\n  [y]--add-dir <dirs>[/]       extra working directories\n\nCommands: [y]mcp[/], [y]doctor[/], [y]update[/], [y]config[/]');
      return;
    }
    if (args[0] === 'doctor') { for (const l of ['Diagnostics', ' └ Currently running: native (2.x.x)', ' └ Auto-updates: enabled', ' └ Search: OK (bundled ripgrep)', '[g]✔ No problems found[/]']) { print(l); await sleep(120); } return; }
    if (args[0] === 'update') { print('Checking for updates… [g]Claude Code is up to date[/]'); return; }
    if (args[0] === 'mcp') return mcpCli(args.slice(1), argStr);
    if (args[0] === '-p' || args[0] === '--print') {
      const json = /--output-format\s+json/.test(argStr);
      const promptText = (argStr.match(/["']([^"']+)["']/) || [])[1] || argStr;
      await sleep(900);
      const answerText = /commit/.test(promptText) ? 'The last 3 commits: allowed + and % in emails (with a regression test), added the cart total endpoint, and the initial project setup.' : 'Done. (Simulated headless answer to: ' + promptText + ')';
      if (json) print(`{\n  [b]"type"[/]: "result",\n  [b]"subtype"[/]: "success",\n  [b]"is_error"[/]: false,\n  [b]"result"[/]: "${esc(answerText)}",\n  [b]"num_turns"[/]: 2,\n  [b]"total_cost_usd"[/]: 0.0123,\n  [b]"session_id"[/]: "8c1e…"\n}`);
      else print(answerText);
      explainCard('Headless (-p) result', json ? 'JSON output is easy for scripts to parse: `result` holds the answer; you also get cost, turn count and a `session_id` you could resume.' : 'Plain text output. Add `--output-format json` when a script needs to parse the answer.', ['headless', 'output-format']);
      return;
    }
    print('[r]Unknown option.[/] Try [y]claude --help[/]');
  }

  async function mcpCli(args, argStr) {
    if (args[0] === 'list') {
      const has = S.fs['~/shop-app/.mcp.json'] && S.cwd.startsWith('~/shop-app');
      print('Checking MCP server health…');
      await sleep(500);
      print(has ? 'github: https://api.githubcopilot.com/mcp/ (HTTP) - [y]⚠ Needs authentication[/]' : '[d]No MCP servers configured. Use `claude mcp add` to add a server.[/]');
      return;
    }
    if (args[0] === 'add') {
      const scope = (argStr.match(/--scope\s+(\w+)/) || [])[1] || 'local';
      const name = args.filter((a, i) => !a.startsWith('-') && !['http', 'sse', 'stdio', 'local', 'project', 'user'].includes(a) && i > 0)[0] || 'server';
      if (scope === 'project') EVENTS['write-silent']('~/shop-app/.mcp.json');
      print(`Added MCP server [B]${esc(name)}[/] to [y]${scope}[/] config` + (scope === 'project' ? '\nFile modified: [b]~/shop-app/.mcp.json[/]' : ''));
      return;
    }
    if (args[0] === 'remove') { print(`Removed MCP server ${esc(args[1] || '')}`); return; }
    print('Usage: claude mcp add|list|remove|get …');
  }

  async function startClaude(flag) {
    if (!S.trusted.has(S.cwd)) {
      line(`<div class="cc-perm"><div class="t-bold">Do you trust the files in this folder?</div><div class="t-dim">${esc(S.cwd.replace('~', '/home/you'))}</div><div style="margin-top:6px">Claude Code may read, write or execute files in this directory. Project files such as CLAUDE.md, settings and hooks can change how Claude behaves.</div><div class="opt" data-choice="1">❯ 1. Yes, proceed</div><div class="opt" data-choice="2">  2. No, exit</div></div>`);
      pushCard('🛡️ Trust dialog', 'The first time you run Claude Code in a folder it asks if you trust it, because project files (CLAUDE.md, hooks, MCP config) can influence what Claude does. Type **1** to continue.', ['trust-dialog']);
      const c = await ask('1-2');
      if (c !== '1') { print('[d]Exited.[/]'); return false; }
      S.trusted.add(S.cwd);
    }
    S.inClaude = true; S.mode = 'default';
    line(`<div class="cc-box"><span style="color:#E8916E">${C.logo('tiny')}</span> <span class="t-bold">Welcome to Claude Code!</span>\n\n  <span class="t-dim">/help for help, /status for your current setup</span>\n\n  <span class="t-dim">cwd: ${esc(S.cwd.replace('~', '/home/you'))}</span></div>`);
    if (flag === '-c' || flag === '--continue') print('[d]Continuing your most recent conversation (14 messages)…[/]');
    if (flag === '-r' || flag === '--resume') print('[d]Resumed: "Add discount codes" (2 days ago)[/]');
    if (!S.fs[S.cwd + '/CLAUDE.md'] && S.cwd !== '~') print('[d] Tips for getting started:\n  1. Run /init to create a CLAUDE.md file with instructions for Claude\n  2. Ask Claude questions about your codebase, or to make changes\n  3. Be as specific as you would with another engineer for the best results[/]');
    if (S.fs['~/shop-app/.mcp.json'] && S.cwd === '~/shop-app' && !S.mcpApproved) {
      line(`<div class="cc-perm"><div class="t-bold">New MCP server found in .mcp.json: github</div><div class="t-dim">Project MCP servers come from the repository; approve only ones you trust.</div><div class="opt" data-choice="1">❯ 1. Use this and all future MCP servers in this project</div><div class="opt" data-choice="2">  2. Use this MCP server</div><div class="opt" data-choice="3">  3. Continue without using this MCP server</div></div>`);
      const c = await ask('1-3');
      S.mcpApproved = c !== '3';
    }
  }

  // -------------------------------------------------------- inside Claude
  async function claudeInput(v) {
    if (S.awaitPlan && /^[123]$/.test(v)) {
      S.awaitPlan = false;
      if (v === '1') { S.mode = 'accept'; drawInput(); bulletText('Plan approved: auto-accepting edits. (Simulator: implementation skipped.)'); }
      else if (v === '2') { S.mode = 'default'; drawInput(); bulletText('Plan approved. I\'ll ask before each edit. (Simulator: implementation skipped.)'); }
      else bulletText('OK, what would you like to change about the plan?');
      return;
    }
    S.awaitPlan = false;
    if (v.startsWith('!')) {
      const cmd = v.slice(1).trim();
      line(`<span class="t-purple">! ${esc(cmd)}</span>`);
      const wasClaude = S.inClaude; S.inClaude = false;
      await shellInput(cmd);
      S.inClaude = wasClaude;
      explainCard('Bash mode (!)', 'The command ran directly in your shell (no Claude turn), and its output was added to the conversation so Claude can use it.', ['bash-mode']);
      return;
    }
    if (v.startsWith('/')) return slash(v);
    // @-mentions attach files
    const mentions = (v.match(/@[\w./-]+/g) || []).map((m) => m.slice(1));
    mentions.forEach((m) => { const p = resolve(S.cwd, m); if (S.fs[p]) result(`[d]Read ${esc(m)} (${S.fs[p].content.split('\n').length} lines)[/]`); });
    if (S.mode === 'plan' && /(fix|add|change|create|write|edit|update|refactor|implement)/i.test(v)) {
      await runEvents([['think', 700], ['tool', 'Glob', 'src/**/*.js', 'Found 3 files'], ['tool', 'Read', 'src/app.js', 'Read 19 lines']]);
      bulletText('[d](plan mode)[/] Here\'s how I\'d approach it. Nothing has been changed:\n1. Inspect the related module and its tests\n2. Make the change in the smallest set of files\n3. Add/adjust tests and run [y]npm test[/]\nApprove, or tell me what to change. (Simulator: generic plan.)');
      explainCard('Plan mode', 'In plan mode Claude only reads and proposes. Press Shift+Tab to leave plan mode before implementing.', ['plan-mode']);
      return;
    }
    const low = v.toLowerCase();
    if (/overview|explain|what does|describe|summar/.test(low)) {
      return runEvents(C.MISSIONS[0].steps[3].run);
    }
    if (/run.*test|npm test|tests? pass/.test(low)) {
      return runEvents([['bash', 'npm test', ['▶ 4 tests', '[g]ℹ pass 4 · fail 0[/]']], ['say', 'All 4 tests pass.']]);
    }
    if (/commit/.test(low)) {
      return runEvents([['bash', 'git commit -am "Update from Claude Code session"', ['[main 7d1e2aa] Update from Claude Code session', ' 1 file changed']], ['say', 'Committed.']]);
    }
    if (/claude\.md|memory/.test(low) && S.fs[S.cwd + '/CLAUDE.md']) {
      return runEvents([['tool', 'Read', 'CLAUDE.md', 'Read ' + S.fs[S.cwd + '/CLAUDE.md'].content.split('\n').length + ' lines'], ['say', 'CLAUDE.md is your project memory. It has commands, architecture, conventions and gotchas. Open it in the Files app to see it explained line by line.']]);
    }
    if (/\.env|secret/.test(low)) {
      const denied = S.fs['~/shop-app/.claude/settings.json'];
      if (denied) return runEvents([['blocked', 'Read(.env)', 'denied by permission rule Read(./.env)'], ['say', 'That file is protected by a deny rule.']]);
      return runEvents([['say', 'I\'d rather not print secrets into the conversation. Tip: add a deny rule for [y]Read(./.env)[/] in .claude/settings.json so it\'s enforced, not just a promise.']]);
    }
    if (/bug|fix|error|broken|crash/.test(low)) {
      return runEvents([['think', 800], ['tool', 'Grep', '"error|throw" in src/', '3 matches'], ['tool', 'Read', 'error.log', 'Read 4 lines'], ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
        ['say', 'The log shows a crash in [y]cartTotal[/] when the request has no [y]items[/]. I\'d default [y]items = [][/] and add a test. (Try the "Fix a bug, test, commit" mission for the full guided flow.)']]);
    }
    if (/hello|hi\b|hey/.test(low)) return runEvents([['say', 'Hi! I\'m (a simulated) Claude Code. Ask me about this project, or try [y]/help[/].']]);
    await runEvents([['think', 700], ['tool', 'Glob', '**/*.js', 'Found 5 files']]);
    bulletText(`In real Claude Code I'd now work on: "[y]${esc(v.slice(0, 80))}[/]".\nThis simulator only scripts common tasks. Try: [y]explain this project[/], [y]fix the cart crash[/], [y]run the tests[/], [y]commit[/], or any [y]/command[/]. For a real answer, use the [B]Ask Claude[/] tab.`);
  }

  async function slash(v) {
    const [cmd, ...rest] = v.split(/\s+/);
    const arg = rest.join(' ');
    const name = cmd.slice(1).toLowerCase();
    const custom = S.fs[`~/shop-app/.claude/commands/${name}.md`];
    const skill = S.fs[`~/shop-app/.claude/skills/${name}/SKILL.md`];
    if (custom && S.cwd.startsWith('~/shop-app')) {
      result(`[d]Running custom command /${name}${arg ? ' with $ARGUMENTS = "' + esc(arg) + '"' : ''}[/]`);
      await runEvents([['tool', 'Read', arg || 'src/', 'Read file'], ['say', 'Review complete. (Run the "Custom commands & skills" mission for the full scripted review.)']]);
      return;
    }
    if (skill && S.cwd.startsWith('~/shop-app')) {
      return runEvents([['out', [`[p]⏺ Skill(${name})[/]`, '[d]  ⎿ Loaded skill instructions[/]']], ['say', 'Following the skill\'s steps… (simulated)']]);
    }
    const H = SLASH[name];
    if (!H) { print(`[r]Unknown command: ${esc(cmd)}[/]  [d]Type / to see the list.[/]`); return; }
    return H(arg);
  }

  const SLASH = {
    async help() {
      print('[B]Claude Code[/] [d](simulated)[/]\n\n[B]Shortcuts[/]\n  [y]![/] bash mode   [y]@[/] mention a file   [y]/[/] commands   [y]Shift+Tab[/] cycle modes   [y]Esc[/] interrupt   [y]Esc Esc[/] rewind\n\n[B]Commands[/]');
      [...customCmds(), ...BUILTIN_CMDS].forEach(([c, d]) => print(`  [o]${c.padEnd(22)}[/][d]${esc(d)}[/]`));
      explainCard('/help', 'Every built-in command is listed, plus your custom commands and skills (marked "project"/"skill"). Type `/` and keep typing to filter.', ['slash-command', 'custom-command']);
    },
    async init() {
      if (S.fs[S.cwd + '/CLAUDE.md']) { print('[d]CLAUDE.md already exists; Claude would suggest improvements to it.[/]'); return; }
      return runEvents(C.MISSIONS[1].steps[0].run);
    },
    async clear() {
      T.out.innerHTML = '';
      print('[d](conversation cleared, CLAUDE.md will load again on the next message)[/]');
      S.prompts = []; S.busyCtx = false;
      explainCard('/clear', 'Fresh start: the old conversation is gone from context. Use it between unrelated tasks.', ['clear', 'context-window']);
    },
    async compact(arg) {
      line(`<span class="spinner-line">${C.logo()}</span> <span class="t-orange">Compacting conversation…</span>`);
      await sleep(1100);
      print(`[g]✔ Compacted.[/] [d]Summary kept${arg ? ': ' + esc(arg) : ' the key decisions and open tasks'}. Context: 71% → 18%[/]`);
      S.busyCtx = false;
      explainCard('/compact', arg ? 'Your focus instructions told the summarizer what to keep. Without them it guesses.' : 'Tip: add focus instructions, e.g. `/compact keep the schema decisions`.', ['compact', 'case-facts']);
    },
    async context() {
      const busy = S.busyCtx || (S.mission && S.mission.start.busy && S.step === 0);
      const rows = busy ? [['System prompt', 3], ['System tools', 6], ['MCP tools', 4], ['Memory files', 2], ['Messages', 56], ['Free space', 29]] : [['System prompt', 3], ['System tools', 6], ['MCP tools', S.fs['~/shop-app/.mcp.json'] ? 4 : 0], ['Memory files', 2], ['Messages', 5 + S.prompts.length * 2], ['Free space', 84 - S.prompts.length * 2]];
      print('[B]Context usage[/] [d](simulated)[/]');
      const colors = ['t-dim', 't-blue', 't-purple', 't-yellow', 't-orange', 't-dim'];
      print(rows.map(([, p], i) => `[${['d', 'b', 'p', 'y', 'o', 'd'][i]}]${(i === 5 ? '░' : '█').repeat(Math.max(0, Math.round(p / 2.5)))}[/]`).join(''));
      rows.forEach(([n, p], i) => line(`  <span class="${colors[i]}">${i === 5 ? '░' : '█'}</span> ${esc(n.padEnd(15))} ${p}%`));
      explainCard('/context', busy ? '**Messages** are eating most of the window: old exploration you no longer need. Next: `/compact` with focus instructions.' : 'Everything Claude can see right now. Memory files and tool definitions are always there; messages grow as you work.', ['context-window', 'context-cmd']);
    },
    async cost() {
      const n = S.prompts.length + 1;
      print(`Total cost:            $${(0.04 * n).toFixed(4)}\nTotal duration (API):  ${8 * n}s\nUsage:                 ${(11.2 * n).toFixed(1)}k input, ${(1.1 * n).toFixed(1)}k output, ${(28 * n).toFixed(0)}k cache read`);
      explainCard('/cost', 'Tokens in (everything Claude read) and out (what it wrote). **Cache reads** are much cheaper: Claude Code automatically caches stable parts like the system prompt and CLAUDE.md. On a subscription, see your limits with /usage.', ['token', 'prompt-caching']);
    },
    async model() {
      print('[B]Select model[/]\n  ❯ [o]1. Opus[/]    [d]most capable, for complex work[/]\n    2. Sonnet  [d]fast & capable, everyday coding[/]\n    3. Haiku   [d]fastest & cheapest, simple tasks[/]');
      const c = await ask('1-3');
      S.model = ({ 1: 'Opus', 2: 'Sonnet', 3: 'Haiku' })[c] || S.model;
      print(`[g]✔ Model set to ${S.model}[/]`);
      explainCard('/model', 'Switch models any time. Subagents can use their own (cheaper) model via the `model:` frontmatter field.', ['model', 'effort']);
    },
    async permissions() {
      const st = S.fs['~/shop-app/.claude/settings.json'];
      const allow = st ? (st.content.match(/"(Bash|Read)\([^)]*\)"/g) || []).filter((r) => !/\.env/.test(r)) : [];
      print('[B]Permissions[/]   [d]Allow · Ask · Deny · Workspace[/]');
      print('  [g]Allow[/]');
      print('    Bash(git status)            [d]user settings[/]');
      allow.forEach((r) => print(`    ${esc(r.replace(/"/g, '')).padEnd(28)}[d]project settings[/]`));
      [...S.allowCmds].forEach((r) => print(`    Bash(${esc(r)}:*)`.padEnd(32) + '[d]this session[/]'));
      print('  [r]Deny[/]');
      if (st) print('    Read(./.env)                [d]project settings[/]'); else print('    [d](none)[/]');
      explainCard('/permissions', 'Rules come from several settings files, and each shows its source. **Deny beats allow.** Option 2 on a permission prompt adds an allow rule for you.', ['permission-rules', 'settings']);
    },
    async memory() {
      const files = ['~/.claude/CLAUDE.md'];
      if (S.fs[S.cwd + '/CLAUDE.md']) files.push(S.cwd + '/CLAUDE.md');
      print('[B]Memory files loaded[/]');
      print(`  [y]User memory[/]     ~/.claude/CLAUDE.md          [d]only you · all projects[/]`);
      if (files[1]) print(`  [y]Project memory[/]  ./CLAUDE.md                  [d]shared via git · this project[/]`);
      else print('  [d]Project memory  (none yet; run /init)[/]');
      print('[d]Select a file to open it in your editor.[/]');
      explainCard('/memory', 'The [[memory-hierarchy]]: user memory is personal; project memory is shared with the team. Org-wide policy files and subfolder CLAUDE.md files can also load.', ['memory-hierarchy', 'claude-md']);
    },
    async agents() {
      print('[B]Agents[/]\n  [d]Built-in[/]\n    general-purpose   [d]multi-step tasks · all tools[/]\n    Explore           [d]fast read-only codebase search[/]\n    Plan              [d]research for plan mode[/]');
      const custom = Object.keys(S.fs).filter((p) => /\.claude\/agents\/.+\.md$/.test(p));
      print('  [d]Project (.claude/agents/)[/]');
      if (custom.length) custom.forEach((p) => print(`    [o]${base(p).replace('.md', '')}[/]`)); else print('    [d](none yet)[/]');
      print('\n  [y]Create new agent[/]');
      explainCard('/agents', 'Subagents each get their own context window, prompt, tools and model. Project agents live in `.claude/agents/`, personal ones in `~/.claude/agents/`.', ['subagent', 'context-isolation']);
    },
    async mcp() {
      if (!S.fs['~/shop-app/.mcp.json']) { print('[d]No MCP servers configured.[/] Add one from the shell: [y]claude mcp add …[/]'); explainCard('/mcp', 'Manage MCP servers and authenticate with remote ones.', ['mcp']); return; }
      print('[B]MCP servers[/]\n  ❯ github  [y]⚠ needs authentication[/]  [d](project · .mcp.json)[/]\n\n  1. Authenticate   2. View tools   3. Cancel');
      const c = await ask('1-3');
      if (c === '1') { print('Opening browser for GitHub sign-in… [g]✔ Authenticated[/]'); S.mcpAuthed = true; }
      if (c === '2' || c === '1') print('[d]Tools:[/] list_issues · get_issue · create_issue · create_pull_request · search_code …');
      explainCard('/mcp', 'Remote servers often use OAuth: `/mcp` → Authenticate. Each tool shows up to Claude as `mcp__github__<tool>`.', ['mcp', 'tool']);
    },
    async hooks() {
      const st = S.fs['~/shop-app/.claude/settings.json'];
      const configured = st && /"hooks"/.test(st.content);
      print('[B]Hooks[/]');
      ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd'].forEach((e) => {
        const n = configured && (e === 'PreToolUse' || e === 'PostToolUse') ? '[g]1 hook[/]' : '[d]0 hooks[/]';
        print(`  ${e.padEnd(18)} ${n}`);
      });
      explainCard('/hooks', 'Each event can run shell commands. PreToolUse can **block** a tool call (exit code 2). Hooks are deterministic: they run every time, unlike instructions.', ['hook', 'exit-code-2']);
    },
    async config() { print('[B]Settings[/]\n  Theme            dark\n  Auto-compact     on\n  Output style     default\n  Default model    ' + S.model + '\n[d]Changes are saved to ~/.claude/settings.json[/]'); explainCard('/config', 'Interactive settings. File-based settings (user/project/local) are listed under [[settings]].', ['settings']); },
    async status() { print(`Version: 2.x.x [d](simulated)[/]\nModel: ${S.model}\ncwd: ${esc(S.cwd)}\nSetting sources: user, project${S.fs['~/shop-app/.claude/settings.json'] ? ', project (.claude/settings.json)' : ''}\nMemory: ${S.fs[S.cwd + '/CLAUDE.md'] ? 'user + project CLAUDE.md' : 'user CLAUDE.md'}`); },
    async doctor() { print('[g]✔ No problems found[/] [d](simulated)[/]'); },
    async rewind() {
      print('[B]Rewind[/]  [d]Restore the code and/or conversation to the point before…[/]');
      const ps = S.prompts.slice(-5);
      if (!ps.length) print('  [d](no checkpoints yet; each prompt you send creates one)[/]');
      ps.forEach((p, i) => print(`  ${i === ps.length - 1 ? '❯' : ' '} ${esc(p.slice(0, 60))}`));
      print('\n  [d]Options: restore code & conversation · conversation only · code only[/]');
      explainCard('/rewind', 'Every prompt creates a [[checkpoint]]. Shortcut: Esc Esc. Shell side effects (rm, migrations) are not rewound; git is still your safety net.', ['checkpoint']);
    },
    async resume() { print('[B]Resume a conversation[/]\n  ❯ Add discount codes             [d]2 days ago · 48 messages[/]\n    Fix email validation           [d]3 days ago · 12 messages[/]\n    Explore codebase               [d]last week · 30 messages[/]'); explainCard('/resume', 'Pick up an old session with its full history. From the shell: `claude -c` (latest) or `claude -r` (choose).', ['resume', 'session']); },
    async review() { return runEvents([['tool', 'Bash', 'git diff', 'no changes'], ['say', 'No uncommitted changes to review. (Built-in /review reviews a PR or your changes.)']]); },
    async 'security-review'() { return runEvents([['tool', 'Bash', 'git diff main...HEAD', '2 files'], ['say', 'No security issues found in pending changes. (simulated)']]); },
    async plugin() { print('[B]Plugins[/]\n  1. Browse & install plugins\n  2. Manage installed plugins\n  3. Add marketplace'); explainCard('/plugin', 'Plugins bundle commands, agents, skills, hooks and MCP servers for one-step install.', ['plugin']); },
    async 'output-style'() { print('[B]Output style[/]\n  ❯ Default\n    Explanatory  [d]explains choices as it works[/]\n    Learning     [d]asks you to write small pieces[/]'); explainCard('Output styles', 'Try Explanatory or Learning while studying: Claude Code becomes a tutor.', ['output-style']); },
    async statusline() { print('[d]Claude would now help configure a custom status line (model, branch, context %…).[/]'); },
    async 'add-dir'(a) { print(`Added ${esc(a || '<dir>')} as a working directory.`); },
    async export() { print('Conversation exported to [y]2026-11-23-session.txt[/]'); },
    async 'install-github-app'() { print('Opening GitHub to install the Claude app… then adding [y].github/workflows/claude.yml[/] and the ANTHROPIC_API_KEY secret. [d](simulated)[/]'); explainCard('/install-github-app', 'Sets up Claude Code GitHub Actions so you can @claude in PRs and issues.', ['github-actions']); },
    async login() { print('Opening browser to sign in… [g]✔ Signed in[/]'); },
    async logout() { print('Signed out.'); },
    async exit() { S.inClaude = false; S.mode = 'default'; print('[d]Goodbye! (You can resume this session with claude -c)[/]'); },
    async quit() { return SLASH.exit(); },
  };

  // ------------------------------------------------------------- files app
  function openFiles(targetDir) {
    if (targetDir) S.fxDir = targetDir;
    const desk = C.$('#desk').getBoundingClientRect();
    const { body } = openWin('files', { title: 'Files', icon: '📁', w: 620, h: 420, x: desk.width - 680, y: 40 });
    body.innerHTML = '<div class="fx"><div class="fx-side"></div><div class="fx-main"></div></div>';
    renderFiles();
  }
  const FILE_NOTES = {
    'CLAUDE.md': 'memory', '.claude': 'config', 'settings.json': 'settings', '.mcp.json': 'MCP', '.env': 'secrets!', 'SKILL.md': 'skill',
    'commands': 'slash cmds', 'agents': 'subagents', 'skills': 'skills', 'hooks': 'hooks', 'package.json': 'scripts', 'settings.local.json': 'personal',
  };
  function renderFiles(flashPath) {
    const w = S.wins.files; if (!w) return;
    const side = w.querySelector('.fx-side'), main = w.querySelector('.fx-main');
    if (!side) return;
    const locs = [['~', '🏠 Home'], ['~/shop-app', '🛒 shop-app'], ['~/shop-app/.claude', '⚙️ .claude (project)'], ['~/.claude', '👤 ~/.claude (user)']];
    side.innerHTML = locs.map(([p, n]) => `<div class="fx-loc" data-dir="${p}" style="${p === S.fxDir ? 'background:var(--orange-wash);color:var(--orange-deep);font-weight:600' : ''}">${n}</div>`).join('');
    const items = isDir(S.fxDir) ? ls(S.fxDir, true) : [];
    main.innerHTML = `<div class="fx-crumb">${esc(S.fxDir.replace('~', 'Home'))}</div>
      ${S.fxDir !== '~' ? `<div class="fx-row" data-dir="${resolve(S.fxDir, '..')}"><span class="fx-ico">↩</span>..</div>` : ''}
      ${items.map(([n, d]) => {
        const p = S.fxDir + '/' + n;
        const note = FILE_NOTES[n];
        const f = !d && S.fs[p];
        return `<div class="fx-row ${flashPath && (flashPath === p || flashPath.startsWith(p + '/')) ? 'new' : ''}" ${d ? `data-dir="${p}"` : `data-file="${p}"`}>
          <span class="fx-ico">${d ? '📁' : n.endsWith('.md') ? '📝' : n.endsWith('.json') ? '🧩' : n.endsWith('.js') ? '📜' : n.endsWith('.py') ? '🐍' : '📄'}</span>
          <span style="${n.startsWith('.') ? 'opacity:.75' : ''}">${esc(n)}</span>
          ${f && f.notes ? '<span class="fx-note" data-tip="This file has line-by-line explanations">● explained</span>' : note ? `<span class="fx-note">${note}</span>` : ''}
        </div>`;
      }).join('') || '<div class="muted small" style="padding:10px">(empty)</div>'}`;
    w.querySelector('.fx').onclick = (e) => {
      const d = e.target.closest('[data-dir]'); if (d) { S.fxDir = d.dataset.dir; renderFiles(); return; }
      const f = e.target.closest('[data-file]'); if (f) openFile(f.dataset.file);
    };
  }
  function refreshFiles(path, created) {
    if (!S.wins.files) return;
    renderFiles(created ? path : null);
  }

  // ------------------------------------------------------------- editor
  function openEditor() {
    const desk = C.$('#desk').getBoundingClientRect();
    const { body, existed } = openWin('editor', { title: 'Code', icon: '<span style="color:#2D5FA0;font-weight:800">{ }</span>', w: 700, h: Math.min(560, desk.height - 120), x: desk.width - 760, y: 70 });
    if (!existed) body.innerHTML = '<div class="ed"><div class="ed-tabs"></div><div class="ed-code"></div><div class="ed-foot">Read-only preview · lines with <span style="color:#E8916E">●</span> have explanations (hover or click them)</div></div>';
    if (!S.editorTabs.length) S.editorTabs.push('~/shop-app/src/app.js');
    if (!S.editorActive) S.editorActive = S.editorTabs[0];
    renderEditor();
  }
  function openFile(path) {
    if (!S.editorTabs.includes(path)) S.editorTabs.push(path);
    if (S.editorTabs.length > 5) S.editorTabs.shift();
    S.editorActive = path;
    openEditor();
    stepAction('open:' + path);
  }
  function lang(p) { return p.endsWith('.json') ? 'json' : p.endsWith('.py') ? 'python' : p.endsWith('.md') || p.endsWith('.yml') ? 'md' : p.endsWith('.js') ? 'js' : ''; }
  function renderEditor() {
    const w = S.wins.editor; if (!w) return;
    const tabs = w.querySelector('.ed-tabs'), code = w.querySelector('.ed-code');
    tabs.innerHTML = S.editorTabs.map((p) => `<div class="ed-tab ${p === S.editorActive ? 'on' : ''}" data-tab="${p}">${esc(base(p))}</div>`).join('');
    tabs.onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) { S.editorActive = t.dataset.tab; renderEditor(); } };
    const f = S.fs[S.editorActive];
    w.querySelector('.win-title').textContent = 'Code: ' + S.editorActive.replace('~/', '');
    if (!f) { code.innerHTML = '<div style="padding:20px;color:#9c9387">File not found (it may have been reset).</div>'; return; }
    const lg = lang(S.editorActive);
    const notes = f.notes || {};
    code.innerHTML = f.content.split('\n').map((l, i) => {
      const n = notes[i + 1];
      const hl = lg === 'js' ? jsHi(l) : C.highlight(l, lg);
      return `<div class="ed-line ${n ? 'note' : ''}" ${n ? `data-tip="${esc(n)}" data-note="${i + 1}"` : ''}><span class="ed-ln">${i + 1}</span><span class="ed-txt">${hl || ' '}</span></div>`;
    }).join('');
    code.onclick = (e) => {
      const l = e.target.closest('[data-note]'); if (!l) return;
      explainCard(`${base(S.editorActive)}, line ${l.dataset.note}`, notes[l.dataset.note], []);
    };
    const notesCount = Object.keys(notes).length;
    if (notesCount && !w.dataset.hinted) { w.dataset.hinted = '1'; }
  }
  function jsHi(l) {
    let s = esc(l);
    const stash = []; const keep = (h) => { stash.push(h); return `${String.fromCharCode(0xE100 + stash.length - 1)}`; };
    s = s.replace(/(\/\/.*$)/, (m) => keep(`<span class="tk-c">${m}</span>`));
    s = s.replace(/('[^']*'|`[^`]*`)/g, (m) => keep(`<span class="tk-s">${m}</span>`));
    s = s.replace(/\b(const|let|function|return|if|require|module|exports|new|async|await|test)\b/g, '<span class="tk-k">$1</span>');
    s = s.replace(/\b(\d+)\b/g, '<span class="tk-n">$1</span>');
    return s.replace(/([-])/g, (m, c) => stash[c.charCodeAt(0) - 0xE100]);
  }

  // ------------------------------------------------------------- docs app
  function openDocs() {
    const desk = C.$('#desk').getBoundingClientRect();
    const { body } = openWin('docs', { title: 'Claude Code Quick Reference', w: 560, h: Math.min(560, desk.height - 100), x: 160, y: 40 });
    const sections = C.CHEATSHEET || [];
    body.innerHTML = `<div class="docs-body"><div class="row" style="margin-bottom:10px">${C.logo('lg')}<div><h2 style="margin:0">Quick Reference</h2><div class="muted small">Click any command to type it into the Terminal</div></div></div>
      ${sections.map((s) => `<h3>${esc(s.title)}</h3><table class="t">${s.rows.map(([k, d]) => `<tr><td class="nowrap"><code style="cursor:pointer" data-typeit="${esc(k)}">${esc(k)}</code></td><td>${C.inline(d)}</td></tr>`).join('')}</table>`).join('')}</div>`;
    body.onclick = (e) => {
      const t = e.target.closest('[data-typeit]'); if (!t) return;
      const v = t.dataset.typeit;
      if (/^(Shift|Esc|Ctrl|Tab|↑)/.test(v)) { C.toast('That one is a key: press it inside the Terminal'); return; }
      openTerminal();
      const inp = T.inWrap.querySelector('.term-input'); if (inp) { inp.value = v.replace(/<[^>]+>/g, '').trim(); inp.focus(); }
    };
  }

  // ------------------------------------------------------------- missions
  function currentStep() { return S.mission ? S.mission.steps[S.step] : null; }
  function startMission(m) {
    Object.values(S.wins).forEach((w) => w.remove());
    S.wins = {}; T = null;
    const keep = { z: S.z };
    Object.assign(S, newState(), keep);
    S.mission = m; S.step = 0; S.coachTab = 'mission';
    S.fs = freshFS(m.start.files);
    if (m.start.flags) m.start.flags.forEach((f) => { S[f] = true; });
    if (m.start.fxDir) S.fxDir = m.start.fxDir;
    S.cwd = m.start.cwd || '~';
    if (m.start.inClaude) { S.inClaude = true; S.trusted.add(S.cwd); }
    openTerminal();
    if (m.start.inClaude) {
      line(`<div class="cc-box"><span style="color:#E8916E">${C.logo('tiny')}</span> <span class="t-bold">Welcome to Claude Code!</span>\n\n  <span class="t-dim">/help for help · cwd: ${esc(S.cwd.replace('~', '/home/you'))}</span></div>`);
      if (m.start.busy) { S.busyCtx = true; print('[d]… 46 earlier messages: exploring the old auth code, a long test run, two abandoned approaches …[/]'); }
    }
    drawInput();
    renderCoach();
    updateDeskTip();
  }
  function freePlay() {
    Object.values(S.wins).forEach((w) => w.remove());
    const z = S.z;
    S = Object.assign(newState(), { z });
    openTerminal(); renderCoach(); welcome(); updateDeskTip();
  }
  function welcome() {
    print('[o]Welcome to the Claude Code Simulator![/] This is a pretend computer: nothing here can break.');
    print('[d]Type [y]cd shop-app[/] then [y]claude[/] to start, or pick a guided mission on the right →[/]');
    print('[d]Words with an [o]orange underline[/] are explained when you hover or click them, e.g. [[claude-md]] or [[subagent]].[/]');
  }
  function completeStep() {
    const m = S.mission, st = m.steps[S.step];
    explainCard(`✓ Step ${S.step + 1}: ${st.do}`, st.explain, st.terms || [], true);
    S.step++;
    C.addXP(10);
    if (S.step >= m.steps.length) {
      const first = !C.state.missions[m.id];
      C.state.missions[m.id] = true; C.save();
      if (first) C.addXP(50, 'Mission complete: ' + m.title);
      C.confetti(C.$('#desk'));
      print(`\n[g]★ Mission complete: ${esc(m.title)}![/]`);
    }
    renderCoach(); updateDeskTip();
  }
  function stepKey(k) {
    const st = currentStep();
    if (!st || st.key !== k) return;
    if (st.expectMode && S.mode !== st.expectMode) { nudge(st, `Keep pressing Shift+Tab until the status line shows the right mode.`); return; }
    completeStep();
  }
  function stepAction(a) {
    const st = currentStep();
    if (st && st.action === a) completeStep();
  }
  function nudge(st, msg) {
    const box = C.$('#coachNudge'); if (!box) return;
    box.innerHTML = `<div class="callout warn" style="margin:8px 0"><div class="ci">👉</div><div>${esc(msg || 'That worked, but for this step try:')} ${st.type && !msg ? `<code>${esc(st.type)}</code>` : ''}</div></div>`;
  }
  async function showMe() {
    const st = currentStep(); if (!st) return;
    if (st.key === 'shift+tab') { cycleMode(); return; }
    if (st.key === 'escape') { handleEscape(); return; }
    if (st.action) {
      const path = st.action.slice(5);
      openFiles(path.slice(0, path.lastIndexOf('/')));
      await sleep(500);
      openFile(path);
      return;
    }
    openTerminal();
    if (S.busy || S.waiter) { C.toast(S.waiter ? 'Claude is waiting for your answer in the terminal (type 1)' : 'Wait for Claude to finish'); return; }
    if (S.typing) return; // ignore extra clicks while "Show me" is already typing
    const inp = T.inWrap.querySelector('.term-input'); if (!inp) return;
    S.typing = true;
    try {
      inp.value = ''; inp.focus();
      for (const ch of st.type) { inp.value += ch; await sleep(st.type.length > 40 ? 12 : 35); }
      await sleep(250);
    } finally { S.typing = false; }
    const v = st.type; inp.value = '';
    submit(v);
  }

  // ------------------------------------------------------------- coach
  function updateDeskTip() {
    const tip = C.$('#deskTip'); if (!tip) return;
    const st = currentStep();
    if (!st) { tip.classList.add('hidden'); return; }
    tip.innerHTML = `${C.logo()} Step ${S.step + 1}/${S.mission.steps.length}: ${esc(st.do)}`;
    tip.classList.remove('hidden');
  }
  function pushCard(title, body, terms) {
    S.lastHint = { title, body, terms };
    const box = C.$('#coachLive'); if (!box) return;
    box.innerHTML = `<div class="explain-card" style="border-color:var(--orange)"><h4>${C.logo()} ${esc(title)}</h4><div>${C.md(body)}</div>${termChips(terms)}</div>`;
  }
  function explainCard(title, body, terms, isStep) {
    S.cards.unshift({ title, body, terms, isStep });
    if (S.cards.length > 30) S.cards.pop();
    const live = C.$('#coachLive'); if (live) live.innerHTML = '';
    const list = C.$('#coachCards');
    if (list) list.insertAdjacentHTML('afterbegin', cardHTML(S.cards[0]));
    else if (S.coachTab !== 'mission') { /* shown when the tab opens */ }
  }
  const cardHTML = (c) => `<div class="explain-card"><h4>${c.isStep ? '' : C.logo()} ${esc(c.title)}</h4><div>${C.md(c.body || '')}</div>${termChips(c.terms)}</div>`;
  function termChips(terms) {
    if (!terms || !terms.length) return '';
    return `<div class="term-list">${terms.map((t) => { const g = C.lookupTerm(t); return g ? `<span class="chip" data-term="${esc(t)}">📖 ${esc(g.term)}</span>` : ''; }).join('')}</div>`;
  }
  function showTermInCoach(key) {
    S.termKey = key; S.coachTab = 'explain'; renderCoach();
  }

  function renderCoach() {
    const coach = C.$('#coach'); if (!coach) return;
    const m = S.mission;
    const tabs = [['mission', m ? 'Mission' : 'Guide'], ['missions', 'All missions'], ['explain', 'Explain']];
    let body = '';
    if (S.coachTab === 'missions') {
      body = `<p class="muted small">Each mission starts with a fresh copy of the practice project. Done ones are green.</p>
        ${C.MISSIONS.map((x, i) => `<div class="mission ${C.state.missions[x.id] ? 'done' : ''} ${m && m.id === x.id ? 'active' : ''}" data-mission="${x.id}">
          <div class="m-num">${C.state.missions[x.id] ? '✓' : i + 1}</div><div><div class="m-title">${esc(x.title)}</div><div class="m-sub">${esc(x.sub)}</div>
          <div class="row" style="gap:6px;margin-top:4px"><span class="tag">${x.level}</span><span class="muted small">${x.steps.length} steps · ~${x.mins} min</span></div></div></div>`).join('')}
        <button class="btn ghost sm" data-free style="margin-top:6px">🧪 Free play (no mission)</button>`;
    } else if (S.coachTab === 'explain') {
      const g = S.termKey && C.lookupTerm(S.termKey);
      body = g ? `<h3 style="display:flex;gap:8px;align-items:center">${C.logo('sm')} ${esc(g.term)}</h3>${C.termHTML(g)}<button class="btn ghost sm" data-gloss>Open in Glossary</button>`
        : `<div class="empty">${C.logo()}<div>Click any <span class="hl">highlighted term</span> in the terminal, a step, or an explanation card and it will be explained here.</div></div>`;
      body += `<hr><div class="small muted" style="margin-bottom:6px">Key terms</div><div class="term-list">${['claude-code', 'claude-md', 'context-window', 'permission-mode', 'plan-mode', 'slash-command', 'subagent', 'hook', 'mcp', 'skill', 'headless', 'checkpoint'].map((t) => `<span class="chip" data-term="${t}">${esc(C.GLOSSARY[t].term)}</span>`).join('')}</div>`;
    } else if (m) {
      const st = currentStep();
      const done = S.step >= m.steps.length;
      const idx = C.MISSIONS.indexOf(m);
      const next = C.MISSIONS[idx + 1];
      body = `<div class="row between"><span class="tag">${m.level}</span><span class="muted small">Mission ${idx + 1} of ${C.MISSIONS.length}</span></div>
        <h3 style="margin:8px 0 4px">${esc(m.title)}</h3>
        <div class="small" style="color:var(--ink-2)">${C.md(m.intro)}</div>
        <div class="step-steps">${m.steps.map((_, i) => `<i class="${i < S.step ? 'done' : i === S.step ? 'cur' : ''}"></i>`).join('')}</div>
        ${done ? `<div class="callout good"><div class="ci">🎉</div><div><b>Mission complete!</b> +60 XP. ${next ? `Next up: <b>${esc(next.title)}</b>.` : 'You finished every mission!'}</div></div>
          ${next ? `<button class="btn" data-mission="${next.id}">Start next mission →</button>` : ''} <button class="btn ghost" data-restart>Replay</button>`
        : `<div class="step-card"><div class="sc-label">Step ${S.step + 1} of ${m.steps.length}</div><div class="sc-do">${C.inline(st.do)}</div>
            ${st.key ? `<div class="small">Click inside the Terminal, then press <kbd>${st.key === 'shift+tab' ? 'Shift</kbd>+<kbd>Tab' : 'Esc'}</kbd></div>` : st.action ? `<div class="small">${esc(st.type)}</div>` : `<div class="small muted">Type this in the Terminal and press Enter:</div><code class="sc-type">${esc(st.type)}</code>`}
            <div class="row" style="margin-top:8px"><button class="btn sm" data-showme>▶ Show me</button><button class="btn sm ghost" data-skip>Skip step</button></div></div>`}
        <div id="coachNudge"></div>
        <div id="coachLive"></div>
        <div class="small muted" style="margin:12px 0 4px">What just happened</div>
        <div id="coachCards">${S.cards.map(cardHTML).join('') || '<div class="muted small">Explanations appear here after each step.</div>'}</div>`;
    } else {
      body = `<h3>Free play</h3><p class="small">The terminal understands real Claude Code commands: try <code>cd shop-app</code>, <code>claude</code>, <code>/help</code>, <code>/init</code>, <code>/context</code>, <code>!git log</code>, <code>@src/cart.js explain this</code>, or press <kbd>Shift</kbd>+<kbd>Tab</kbd>.</p>
        <p class="small">New here? Start with a guided mission:</p>
        <button class="btn" data-mission="${C.MISSIONS[0].id}">▶ Mission 1: ${esc(C.MISSIONS[0].title)}</button>
        <div id="coachLive"></div>
        <div class="small muted" style="margin:14px 0 4px">What just happened</div>
        <div id="coachCards">${S.cards.map(cardHTML).join('') || '<div class="muted small">Explanations appear here as you type commands.</div>'}</div>`;
    }
    coach.innerHTML = `<div class="coach-head">${C.logo()}<div><div style="font-weight:700">Coach</div><div class="small muted">${m ? esc(m.title) : 'Free play'}</div></div></div>
      <div class="coach-tabs">${tabs.map(([k, n]) => `<button class="${S.coachTab === k ? 'on' : ''}" data-ctab="${k}">${n}</button>`).join('')}</div>
      <div class="coach-body">${body}</div>`;
    coach.onclick = (e) => {
      const t = e.target.closest('[data-ctab]'); if (t) { S.coachTab = t.dataset.ctab; renderCoach(); return; }
      const ms = e.target.closest('[data-mission]'); if (ms) { startMission(C.MISSIONS.find((x) => x.id === ms.dataset.mission)); return; }
      if (e.target.closest('[data-free]')) { freePlay(); return; }
      if (e.target.closest('[data-showme]')) { showMe(); return; }
      if (e.target.closest('[data-skip]')) { completeStep(); return; }
      if (e.target.closest('[data-restart]')) { startMission(S.mission); return; }
      if (e.target.closest('[data-gloss]')) { C.go('glossary', S.termKey); }
    };
    if (S.lastHint && S.waiter) pushCard(S.lastHint.title, S.lastHint.body, S.lastHint.terms);
  }
})(window.CCA);
