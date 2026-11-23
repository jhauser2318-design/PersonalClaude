/* App shell: theme, sidebar navigation, global search, header stats, boot. */
(function (C) {
  'use strict';

  // ------------------------------------------------------------------ theme
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  C.applyTheme = () => {
    const mode = C.state.theme || 'system';
    const dark = mode === 'dark' || (mode === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (window.academy) window.academy.setTheme(mode);
  };
  media.addEventListener('change', C.applyTheme);

  // ------------------------------------------------------------ header stats
  C.refreshChrome = () => {
    const s = C.$('#streakChip'); if (s) s.textContent = `🔥 ${C.streak()}`;
    const x = C.$('#xpChip'); if (x) { x.textContent = `${C.state.xp} XP`; x.title = `Level: ${C.level().name}`; }
    const pct = C.overall();
    const p = C.$('#overallPct'); if (p) p.textContent = pct + '%';
    const b = C.$('#overallBar'); if (b) b.style.width = pct + '%';
  };

  // -------------------------------------------------------------- navigation
  C.$('#sidebar').addEventListener('click', (e) => {
    const n = e.target.closest('[data-route]');
    if (n) C.go(n.dataset.route, n.dataset.arg);
  });

  // ----------------------------------------------------------- global search
  let index = null;
  function buildIndex() {
    const out = [];
    for (const id in C.GLOSSARY) { const g = C.GLOSSARY[id]; out.push({ kind: 'Term', title: g.term, sub: g.short, text: [g.term, ...(g.aliases || []), g.short].join(' '), go: () => C.go('glossary', id) }); }
    C.LESSONS.forEach((m) => m.lessons.forEach((l) => out.push({ kind: 'Lesson', title: l.title, sub: m.title, text: l.title + ' ' + l.body, go: () => C.go('learn', l.id) })));
    C.MISSIONS.forEach((m) => out.push({ kind: 'Simulator', title: m.title, sub: m.sub, text: m.title + ' ' + m.sub + ' ' + m.steps.map((s) => s.do + ' ' + (s.type || '')).join(' '), go: () => C.go('simulator', m.id) }));
    C.QUESTIONS.forEach((q) => out.push({ kind: 'Question', title: q.q.slice(0, 90) + '…', sub: `${q.d} · ${q.s}`, text: q.q + ' ' + q.o.join(' '), go: () => C.go('practice', q.d) }));
    [...(C.AGENTS_INTRO || []), ...(C.AGENTS_SELF || []), ...(C.AGENTS_MANAGED || []), ...(C.AGENTS_DECIDE || [])].forEach((c) => out.push({ kind: 'Agents', title: c.title, sub: c.group, text: c.title + ' ' + c.group + ' ' + c.body, go: () => C.go('agents', c.id) }));
    (C.APPS || []).forEach((c) => out.push({ kind: 'Apps', title: c.title, sub: c.group, text: c.title + ' ' + c.group + ' ' + c.body, go: () => C.go('apps', c.id) }));
    (C.GITHUB || []).forEach((c) => out.push({ kind: 'GitHub', title: c.title, sub: c.group, text: c.title + ' ' + c.group + ' ' + c.body, go: () => C.go('github', c.id) }));
    (C.CONNECT || []).forEach((c) => out.push({ kind: 'Connect', title: c.title, sub: c.group, text: c.title + ' ' + c.group + ' ' + c.body, go: () => C.go('connect', c.id) }));
    C.PY_LESSONS.forEach((l) => out.push({ kind: 'Python', title: l.title, sub: 'Python Basics', text: l.title + ' ' + l.body, go: () => C.go('python', l.id) }));
    C.RESOURCES.forEach((g) => g.items.forEach(([n, u, d]) => out.push({ kind: 'Link', title: n, sub: d, text: n + ' ' + d + ' ' + u, go: () => (window.academy ? window.academy.openLink(u) : window.open(u, '_blank')) })));
    C.CHEATSHEET.forEach((s) => s.rows.forEach(([k, d]) => out.push({ kind: 'Command', title: k, sub: d, text: k + ' ' + d, go: () => C.go('cheatsheet') })));
    return out;
  }
  const searchInput = C.$('#globalSearch');
  const resultsBox = C.$('#searchResults');
  let hits = []; let active = 0;
  function search(q) {
    if (!index) index = buildIndex();
    q = q.trim().toLowerCase();
    if (q.length < 2) { resultsBox.classList.add('hidden'); return; }
    const terms = q.split(/\s+/);
    hits = index.map((it) => {
      const t = it.text.toLowerCase(); const title = it.title.toLowerCase();
      let s = 0;
      for (const w of terms) { if (!t.includes(w)) return null; s += title.includes(w) ? 5 : 1; if (title.startsWith(w)) s += 3; }
      if (it.kind === 'Term' || it.kind === 'Command') s += 1;
      return [s, it];
    }).filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 12).map((x) => x[1]);
    active = 0;
    resultsBox.innerHTML = hits.length ? hits.map((h, i) => `<div class="sr-item ${i === 0 ? 'active' : ''}" data-hit="${i}"><span class="sr-kind">${h.kind}</span><div><div class="sr-title">${C.esc(h.title)}</div><div class="sr-sub">${C.esc((h.sub || '').slice(0, 110))}</div></div></div>`).join('')
      : `<div class="sr-item"><span class="sr-kind">Tip</span><div><div class="sr-title">No matches</div><div class="sr-sub">Press Enter to ask the tutor instead</div></div></div>`;
    resultsBox.classList.remove('hidden');
  }
  searchInput.addEventListener('input', C.debounce(() => search(searchInput.value), 90));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!hits.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      C.$$('.sr-item', resultsBox).forEach((el, i) => el.classList.toggle('active', i === active));
    }
    if (e.key === 'Enter') {
      if (hits[active]) pick(active);
      else if (searchInput.value.trim()) { sessionStorage.setItem('cca.ask', searchInput.value.trim()); closeSearch(); C.go('chat'); }
    }
    if (e.key === 'Escape') closeSearch();
  });
  resultsBox.addEventListener('mousedown', (e) => { const h = e.target.closest('[data-hit]'); if (h) { e.preventDefault(); pick(+h.dataset.hit); } });
  searchInput.addEventListener('blur', () => setTimeout(() => resultsBox.classList.add('hidden'), 120));
  function pick(i) { const h = hits[i]; closeSearch(); h.go(); }
  function closeSearch() { searchInput.value = ''; resultsBox.classList.add('hidden'); searchInput.blur(); }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  });

  // ------------------------------------------------------------------- boot
  C.applyTheme();
  C.refreshChrome();
  if (!location.hash) location.hash = '#/home';
  C.render();
  setTimeout(() => { const s = C.$('#splash'); s.classList.add('fade'); setTimeout(() => s.remove(), 500); }, 650);
})(window.CCA);
