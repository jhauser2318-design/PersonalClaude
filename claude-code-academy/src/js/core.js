/* Core helpers shared by every view: storage & progress, markdown, syntax
   highlighting, glossary tooltips, toasts, modals, routing. */
window.CCA = window.CCA || {};
(function (C) {
  'use strict';

  // ------------------------------------------------------------------ utils
  C.esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  C.$ = (sel, root) => (root || document).querySelector(sel);
  C.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  C.logo = (cls) => `<svg class="logo ${cls || ''}"><use href="#spark"/></svg>`;
  C.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // Shuffle answer options so the correct one isn't always in the same slot.
  C.shuffleOptions = (options, answer) => {
    const order = C.shuffle(options.map((_, i) => i));
    return { options: order.map((i) => options[i]), a: order.indexOf(answer) };
  };
  C.today = () => new Date().toISOString().slice(0, 10);
  C.uid = () => Math.random().toString(36).slice(2, 10);
  C.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------------------------------------------------------------- storage
  const KEY = 'cca.progress.v1';
  const defaults = () => ({
    xp: 0,
    days: [],            // ISO dates you studied
    lessons: {},         // lessonId -> true
    missions: {},        // missionId -> true
    python: {},          // pyLessonId -> true
    quiz: [],            // {date, mode, score, total, byDomain}
    missed: {},          // questionId -> times missed
    seenQ: {},           // questionId -> times answered
    cards: {},           // cardId -> {box, due}
    plan: {},            // checklist id -> true
    examDate: '',
    theme: 'system',
    chats: [],           // saved tutor conversations
    connect: {},         // Connect & Automate chapterId -> true
    github: {},          // GitHub & Claude chapterId -> true
    gitplay: {},         // Git Playground challengeId -> true
    agents: {},          // Agents track chapterId -> true
    apps: {},            // Claude apps track chapterId -> true
    context: {},         // Context & Memory track chapterId -> true
    name: '',
  });
  let state;
  try { state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { state = defaults(); }
  C.state = state;
  C.save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full / blocked */ } C.refreshChrome && C.refreshChrome(); };
  C.resetProgress = () => { const theme = state.theme; Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, defaults(), { theme }); C.save(); };

  C.markStudied = () => {
    const d = C.today();
    if (!state.days.includes(d)) { state.days.push(d); if (state.days.length > 400) state.days.shift(); }
  };
  C.addXP = (n, why) => {
    state.xp += n; C.markStudied(); C.save();
    if (why) C.toast(`+${n} XP · ${why}`);
  };
  C.streak = () => {
    const set = new Set(state.days);
    let n = 0; const d = new Date();
    if (!set.has(C.today())) d.setDate(d.getDate() - 1);
    while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  };
  C.level = () => {
    const xp = state.xp;
    const levels = [[0, 'Curious Beginner'], [150, 'Prompt Apprentice'], [400, 'Terminal Explorer'], [800, 'Context Wrangler'], [1400, 'Tool Smith'], [2200, 'Agent Builder'], [3200, 'Claude Code Architect']];
    let cur = levels[0], next = null;
    for (let i = 0; i < levels.length; i++) { if (xp >= levels[i][0]) { cur = levels[i]; next = levels[i + 1] || null; } }
    return { name: cur[1], min: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null };
  };
  C.overall = () => {
    const L = (C.LESSONS || []).reduce((n, m) => n + m.lessons.length, 0) || 1;
    const M = (C.MISSIONS || []).length || 1;
    const P = (C.PY_LESSONS || []).length || 1;
    const lessons = Object.keys(state.lessons).length / L;
    const missions = Object.keys(state.missions).length / M;
    const py = Object.keys(state.python).length / P;
    const best = state.quiz.reduce((b, q) => Math.max(b, q.score / q.total), 0);
    const CN = (C.CONNECT || []).length || 1;
    const connect = Object.keys(state.connect || {}).filter((k) => (C.CONNECT || []).some((c) => c.id === k)).length / CN;
    const GH = (C.GITHUB || []).length || 1;
    const github = Object.keys(state.github || {}).filter((k) => (C.GITHUB || []).some((c) => c.id === k)).length / GH;
    const AG = C.AGENTS_INTRO ? [...C.AGENTS_INTRO, ...C.AGENTS_SELF, ...C.AGENTS_MANAGED, ...C.AGENTS_DECIDE] : [];
    const agents = Object.keys(state.agents || {}).filter((k) => AG.some((c) => c.id === k)).length / (AG.length || 1);
    const apps = Object.keys(state.apps || {}).filter((k) => (C.APPS || []).some((c) => c.id === k)).length / ((C.APPS || []).length || 1);
    const ctx = Object.keys(state.context || {}).filter((k) => (C.CONTEXT || []).some((c) => c.id === k)).length / ((C.CONTEXT || []).length || 1);
    return Math.round((lessons * 0.22 + missions * 0.18 + best * 0.2 + py * 0.05 + connect * 0.08 + github * 0.07 + agents * 0.07 + apps * 0.05 + ctx * 0.08) * 100);
  };

  // ------------------------------------------------------------- highlight
  const PY_KW = /\b(def|return|if|elif|else|for|while|in|not|and|or|import|from|as|class|try|except|finally|with|lambda|pass|break|continue|None|True|False|is|raise|yield|global|async|await)\b/g;
  const PY_BI = /\b(print|len|range|input|int|str|float|list|dict|set|tuple|type|open|enumerate|zip|sorted|sum|min|max|isinstance|abs|round)\b(?=\()/g;
  const SH_KW = /(^|\s)(claude|npm|cd|ls|git|cat|echo|curl|pip|python3?|py|mkdir|export|irm|iex|npx|brew|winget)\b/g;
  C.highlight = (code, lang) => {
    let s = C.esc(code);
    const stash = [];
    // Placeholders use private-use characters (no digits or word chars), so later
    // regexes such as the number highlighter can never match inside them.
    const keep = (html) => { stash.push(html); return `${String.fromCharCode(0xE100 + stash.length - 1)}`; };
    lang = (lang || '').toLowerCase();
    if (lang === 'python' || lang === 'py') {
      s = s.replace(/(#[^\n]*)/g, (m) => keep(`<span class="tk-c">${m}</span>`));
      s = s.replace(/(f?"""[\s\S]*?"""|f?'[^'\n]*'|f?"[^"\n]*")/g, (m) => keep(`<span class="tk-s">${m}</span>`));
      s = s.replace(PY_KW, '<span class="tk-k">$1</span>');
      s = s.replace(PY_BI, '<span class="tk-f">$1</span>');
      s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-n">$1</span>');
    } else if (lang === 'json') {
      s = s.replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, (m, a, b) => keep(`<span class="tk-key">${a}</span>`) + b);
      s = s.replace(/("(?:[^"\\]|\\.)*")/g, (m) => keep(`<span class="tk-s">${m}</span>`));
      s = s.replace(/\b(true|false|null)\b/g, '<span class="tk-k">$1</span>');
      s = s.replace(/\b(\d+)\b/g, '<span class="tk-n">$1</span>');
    } else if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'powershell') {
      s = s.replace(/(^|\n)(\s*#[^\n]*)/g, (m, a, b) => a + keep(`<span class="tk-c">${b}</span>`));
      s = s.replace(/("[^"\n]*"|'[^'\n]*')/g, (m) => keep(`<span class="tk-s">${m}</span>`));
      s = s.replace(SH_KW, '$1<span class="tk-k">$2</span>');
      s = s.replace(/(\s)(--?[a-zA-Z][\w-]*)/g, '$1<span class="tk-f">$2</span>');
    } else if (lang === 'md' || lang === 'markdown' || lang === 'yaml' || lang === 'yml') {
      s = s.replace(/(^|\n)(#{1,6} [^\n]*)/g, (m, a, b) => a + keep(`<span class="tk-k">${b}</span>`));
      s = s.replace(/(^|\n)([a-zA-Z_-]+)(:)/g, (m, a, b, c) => a + keep(`<span class="tk-key">${b}</span>`) + c);
      s = s.replace(/(^|\n)(---)/g, (m, a, b) => a + keep(`<span class="tk-c">${b}</span>`));
      s = s.replace(/(\$ARGUMENTS|\$\d|@[\w./-]+)/g, (m) => keep(`<span class="tk-b">${m}</span>`));
    }
    return s.replace(/([-])/g, (m, c) => stash[c.charCodeAt(0) - 0xE100]);
  };

  // --------------------------------------------------------------- markdown
  // [[key]] or [[key|label]] -> highlighted glossary term with tooltip.
  C.termify = (html) => html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, key, label) => {
    const k = key.trim();
    return `<span class="hl" data-term="${C.esc(k)}">${label || (C.GLOSSARY && C.GLOSSARY[k] ? C.esc(C.GLOSSARY[k].term) : C.esc(k))}</span>`;
  });
  function inline(t) {
    const stash = [];
    const keep = (h) => { stash.push(h); return `\u0001${stash.length - 1}\u0001`; };
    t = t.replace(/`([^`]+)`/g, (m, c) => keep(`<code>${C.esc(c)}</code>`));
    t = C.esc(t);
    t = t.replace(/\[\[([^\]]+)\]\]/g, (m) => keep(C.termify(m.replace(/&amp;/g, '&'))));
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, a, u) => keep(`<a href="${u}" target="_blank" rel="noopener">${a}</a>`));
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
    t = t.replace(/&lt;kbd&gt;(.+?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>');
    return t.replace(/\u0001(\d+)\u0001/g, (m, i) => stash[+i]);
  }
  C.inline = inline;
  const CALLOUT = { TIP: ['tip', '💡'], NOTE: ['info', 'ℹ️'], WARN: ['warn', '⚠️'], EXAM: ['exam', '🎓'], GOOD: ['good', '✅'], BEGINNER: ['tip', '🌱'] };
  C.md = (src) => {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    let out = '', i = 0;
    const para = [];
    const flush = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para.length = 0; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w*)/);
      if (fence) {
        flush();
        const lang = fence[1]; const buf = []; i++;
        while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
        i++;
        out += `<pre class="code" data-lang="${lang}"><button class="btn sm subtle copy" data-copy>Copy</button><code>${C.highlight(buf.join('\n'), lang)}</code></pre>`;
        continue;
      }
      const co = line.match(/^> \[!(\w+)\]\s*(.*)$/);
      if (co) {
        flush();
        const [cls, ico] = CALLOUT[co[1].toUpperCase()] || ['info', 'ℹ️'];
        const buf = [co[2]]; i++;
        while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
        out += `<div class="callout ${cls}"><div class="ci">${ico}</div><div>${C.md(buf.join('\n'))}</div></div>`;
        continue;
      }
      const h = line.match(/^(#{1,4}) (.*)$/);
      if (h) { flush(); const n = h[1].length + 1; out += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
      if (/^\s*[-*] /.test(line)) {
        flush(); out += '<ul>';
        while (i < lines.length && /^\s*[-*] /.test(lines[i])) { out += `<li>${inline(lines[i].replace(/^\s*[-*] /, '').replace(/^\[ \] /, '☐ '))}</li>`; i++; }
        out += '</ul>'; continue;
      }
      if (/^\s*\d+\. /.test(line)) {
        flush(); out += '<ol>';
        while (i < lines.length && /^\s*\d+\. /.test(lines[i])) { out += `<li>${inline(lines[i].replace(/^\s*\d+\. /, ''))}</li>`; i++; }
        out += '</ol>'; continue;
      }
      if (/^\|.*\|\s*$/.test(line)) {
        flush();
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(rows[1] && /^\|[\s:|-]+\|$/.test(rows[1].trim()) ? 2 : 1);
        out += `<table class="t"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        continue;
      }
      if (/^---\s*$/.test(line)) { flush(); out += '<hr>'; i++; continue; }
      if (!line.trim()) { flush(); i++; continue; }
      para.push(line.trim()); i++;
    }
    flush();
    return out;
  };

  // ---------------------------------------------------------------- glossary
  C.lookupTerm = (key) => {
    const G = C.GLOSSARY || {};
    if (G[key]) return G[key];
    const k = String(key).toLowerCase();
    for (const id in G) {
      const g = G[id];
      if (g.term.toLowerCase() === k || (g.aliases || []).some((a) => a.toLowerCase() === k)) return g;
    }
    return null;
  };

  const tip = () => C.$('#tooltip');
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-term], [data-tip]');
    if (!t) return;
    let html;
    if (t.dataset.term) {
      const g = C.lookupTerm(t.dataset.term);
      if (!g) return;
      html = `<b>${C.esc(g.term)}</b><br>${C.esc(g.short)}<div style="opacity:.6;margin-top:4px">Click for the full explanation</div>`;
    } else html = t.dataset.tip;
    const el = tip(); el.innerHTML = html; el.classList.remove('hidden');
    const r = t.getBoundingClientRect();
    const w = el.offsetWidth, hgt = el.offsetHeight;
    let x = Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2));
    let y = r.bottom + 8; if (y + hgt > window.innerHeight - 10) y = r.top - hgt - 8;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-term], [data-tip]')) tip().classList.add('hidden');
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-term]');
    if (t && !e.defaultPrevented) {
      tip().classList.add('hidden');
      const handled = C.onTermClick && C.onTermClick(t.dataset.term, t);
      if (!handled) C.showTerm(t.dataset.term);
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const code = cp.parentElement.querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => C.toast('Copied to clipboard'));
    }
    const a = e.target.closest('a[href^="http"]');
    if (a && window.academy) { e.preventDefault(); window.academy.openLink(a.href); }
  });
  C.termHTML = (g) => `
    <div class="row" style="gap:8px;margin-bottom:6px">${g.cat ? `<span class="tag">${C.esc(g.cat)}</span>` : ''}${g.domain ? `<span class="chip info">Exam: ${C.esc(g.domain)}</span>` : ''}</div>
    <p style="font-size:15px">${C.inline(g.long || g.short)}</p>
    ${g.example ? `<div class="small muted" style="margin-top:8px">Example</div><pre class="code"><code>${C.highlight(g.example, g.lang || 'bash')}</code></pre>` : ''}
    ${g.analogy ? `<div class="callout tip"><div class="ci">🌱</div><div><b>Think of it like:</b> ${C.inline(g.analogy)}</div></div>` : ''}`;
  C.showTerm = (key) => {
    const g = C.lookupTerm(key);
    if (!g) return;
    C.modal(`${C.logo()}<h2 style="margin:0">${C.esc(g.term)}</h2>`, C.termHTML(g));
  };

  // ------------------------------------------------------- toasts & modals
  C.toast = (msg, icon) => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon || C.logo('sm')}<div>${C.esc(msg)}</div>`;
    C.$('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  };
  C.modal = (titleHTML, bodyHTML, opts) => {
    const root = C.$('#modalRoot');
    root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog">
      <div class="modal-head">${titleHTML}<button class="btn sm ghost x" data-close>Close ✕</button></div>
      <div class="modal-body">${bodyHTML}</div></div></div>`;
    const close = () => { root.innerHTML = ''; opts && opts.onClose && opts.onClose(); };
    root.querySelector('.modal-back').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-back') || e.target.closest('[data-close]')) close();
    });
    return { root: root.querySelector('.modal'), close };
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && C.$('#modalRoot').innerHTML) C.$('#modalRoot').innerHTML = ''; });

  C.confetti = (host) => {
    host = host || document.body;
    const colors = ['#D97757', '#F0A585', '#F2C66D', '#FFFFFF', '#C15F3C'];
    const r = host.getBoundingClientRect();
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.background = colors[i % colors.length];
      p.style.left = (r.width / 2) + 'px'; p.style.top = (r.height / 3) + 'px';
      p.style.borderRadius = i % 3 ? '2px' : '50%';
      host.appendChild(p);
      const a = Math.random() * Math.PI * 2, v = 160 + Math.random() * 260;
      p.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 220}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1300 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
    }
  };

  // ----------------------------------------------------------------- router
  C.views = {};
  C.register = (name, view) => { C.views[name] = view; };
  C.current = null;
  C.go = (route, arg) => {
    const hash = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : '');
    if (location.hash !== hash) location.hash = hash; else C.render();
  };
  C.render = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const route = parts[0] || 'home';
    const arg = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null;
    const view = C.views[route] || C.views.home;
    if (C.current && C.current.unmount) C.current.unmount();
    C.onTermClick = null;
    C.current = view;
    const host = C.$('#view');
    host.scrollTop = 0;
    host.innerHTML = '';
    // A fresh container per render, so listeners a view adds never pile up.
    const page = document.createElement('div');
    page.className = 'view-root';
    host.appendChild(page);
    view.render(page, arg);
    const navArg = route === 'connect' ? navGroupFor(arg) : route === 'github' ? ghNavFor(arg) : route === 'agents' ? agNavFor(arg) : route === 'apps' ? appNavFor(arg) : route === 'context' ? (['budget', 'cachelab'].includes(arg) ? arg : 'ctx-what') : null;
    C.$$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route && (!n.dataset.arg || n.dataset.arg === navArg)));
  };
  window.addEventListener('hashchange', C.render);
  function agNavFor(arg) {
    if (arg === 'agent-sdk' || arg === 'deploy-self' || arg === 'self-api') return 'agent-sdk';
    if (arg && arg.startsWith('ma-')) return 'ma-basics';
    return 'spectrum';
  }
  function appNavFor(arg) { return arg && (arg.startsWith('cowork') || arg === 'which-tool') ? 'cowork-what' : 'chat-start'; }
  function ghNavFor(arg) {
    if (arg === 'play') return 'play';
    if (arg === 'learn') return 'learn';
    const ch = (C.GITHUB || []).find((c) => c.id === arg);
    return ch && ch.group === 'Claude + GitHub' ? 'actions-claude' : 'why';
  }
  // Which "Connect & Automate" sidebar entry a chapter belongs to
  function navGroupFor(arg) {
    if (arg === 'lab') return 'lab';
    const ch = (C.CONNECT || []).find((c) => c.id === arg) || (C.CONNECT || [])[0];
    if (!ch) return 'mcp';
    if (ch.group === 'Claude API') return 'api';
    if (ch.group === 'Act on your computer' || ch.group === 'Recipes & safety') return 'computer';
    return 'mcp';
  }

  C.pageHead = (title, sub, actions) => `
    <div class="page-head">${C.logo('lg')}<div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
})(window.CCA);
