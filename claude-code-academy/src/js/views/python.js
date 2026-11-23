(function (C) {
  const codeCache = {};
  C.register('python', {
    render(host, arg) {
      const L = C.PY_LESSONS;
      const found = L.find((l) => l.id === arg) || L.find((l) => !C.state.python[l.id]) || L[0];
      const idx = L.indexOf(found);
      const sh = C.shuffleOptions(found.check.options, found.check.a);
      const cur = { ...found, check: { ...found.check, options: sh.options, a: sh.a } };
      const done = !!C.state.python[cur.id];
      host.innerHTML = `<div class="page wide"><div class="lesson-layout">
        <aside class="lesson-nav card flat" style="padding:10px">
          <div class="row" style="padding:4px 6px"><span style="font-size:18px">🐍</span><b>Python Basics</b></div>
          ${L.map((l, i) => `<div class="ln-item ${l.id === cur.id ? 'active' : ''}" data-py="${l.id}"><span class="ln-check ${C.state.python[l.id] ? 'done' : ''}">${C.state.python[l.id] ? '✓' : i + 1}</span>${l.icon} ${C.esc(l.title)}</div>`).join('')}
          <hr><div class="ln-item" data-go="pycerts">🏅 Python certifications</div>
          <div class="small" style="padding:8px 9px;font-weight:700">Great free resources</div>
          ${C.PY_LINKS.slice(0, 6).map(([n, u]) => `<a class="ln-item" href="${u}" target="_blank" rel="noopener" style="font-size:12.5px">↗ ${C.esc(n)}</a>`).join('')}
        </aside>
        <article class="card lesson-body" style="padding:28px 34px;max-width:920px">
          <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Lesson ${idx + 1} of ${L.length}</span>${idx < 8 ? '<span class="chip info">PCEP topic</span>' : '<span class="chip info">PCAP / applied</span>'}</div>
          <h1>${cur.icon} ${C.esc(cur.title)}</h1>
          ${C.md(cur.body)}
          <h2>Try it</h2>
          <div class="py-editor">
            <div class="py-bar"><span>🐍 playground.py</span><span style="margin-left:auto" class="muted">Ctrl+Enter to run · Tab = 4 spaces</span>
              <button class="btn sm subtle" id="reset">Reset</button><button class="btn sm" id="run">▶ Run</button></div>
            <textarea id="code" spellcheck="false">${C.esc(codeCache[cur.id] != null ? codeCache[cur.id] : cur.code)}</textarea>
            <div class="py-out" id="out"><span class="dim">Output appears here. Press ▶ Run.</span></div>
          </div>
          <div class="callout tip"><div class="ci">🧪</div><div><b>Your task:</b> ${C.inline(cur.task)}</div></div>
          <h2>Quick check</h2>
          <div class="q-card"><div class="q-text">${C.esc(cur.check.q)}</div>
            ${cur.check.options.map((o, i) => `<div class="q-opt" data-opt="${i}"><span class="q-letter">${'ABCD'[i]}</span><span>${C.esc(o)}</span></div>`).join('')}
            <div class="q-explain"></div></div>
          <hr>
          <div class="row between">
            <div>${idx > 0 ? `<button class="btn ghost" data-py="${L[idx - 1].id}">← ${C.esc(L[idx - 1].title)}</button>` : ''}</div>
            <div class="row"><button class="btn ${done ? 'subtle' : ''}" id="done">${done ? '✓ Completed' : 'Mark complete (+20 XP)'}</button>
            ${idx < L.length - 1 ? `<button class="btn ghost" data-py="${L[idx + 1].id}">${C.esc(L[idx + 1].title)} →</button>` : ''}</div>
          </div>
        </article></div></div>`;
      const ta = host.querySelector('#code');
      const out = host.querySelector('#out');
      ta.style.height = Math.max(200, ta.scrollHeight + 10) + 'px';
      ta.addEventListener('input', () => { codeCache[cur.id] = ta.value; });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); codeCache[cur.id] = ta.value; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
      });
      const run = async () => {
        if (!window.academy) { out.innerHTML = '<span class="err">Running Python needs the desktop app (this preview runs in a browser).</span>'; return; }
        out.innerHTML = '<span class="dim">Running…</span>';
        const r = await window.academy.python.run(ta.value, '');
        if (!r.ok) {
          out.innerHTML = `<span class="err">Python wasn't found on this computer.</span>\n<span class="dim">Install it from python.org/downloads (tick "Add python.exe to PATH"), or in PowerShell run:  winget install Python.Python.3.13\nThen restart the app. You can also set a custom path in Settings.</span>`;
          return;
        }
        const outText = C.esc(r.stdout || '');
        const errText = r.stderr ? `<span class="err">${C.esc(r.stderr)}</span>` : '';
        out.innerHTML = (outText + errText) || '<span class="dim">(no output; did you forget print()?)</span>';
        out.insertAdjacentHTML('beforeend', `\n<span class="dim">— exited with code ${r.code} · ${C.esc(r.interpreter)}</span>`);
        if (r.code === 0) C.markStudied();
      };
      host.querySelector('#run').onclick = run;
      host.querySelector('#reset').onclick = () => { delete codeCache[cur.id]; ta.value = cur.code; out.innerHTML = '<span class="dim">Code reset.</span>'; };
      host.querySelector('#done').onclick = () => {
        if (!C.state.python[cur.id]) { C.state.python[cur.id] = true; C.addXP(20, 'Python lesson complete'); }
        const next = L[idx + 1]; if (next) C.go('python', next.id); else C.render();
      };
      host.addEventListener('click', (e) => {
        const p = e.target.closest('[data-py]'); if (p) { C.go('python', p.dataset.py); return; }
        const g = e.target.closest('[data-go]'); if (g) { location.hash = '#/' + g.dataset.go; return; }
        const opt = e.target.closest('.q-opt');
        if (opt && !opt.classList.contains('locked')) {
          const q = cur.check; const pick = +opt.dataset.opt; const card = opt.closest('.q-card');
          C.$$('.q-opt', card).forEach((o, i) => { o.classList.add('locked'); if (i === q.a) o.classList.add('correct'); else if (i === pick) o.classList.add('wrong'); });
          card.querySelector('.q-explain').innerHTML = `<div class="callout ${pick === q.a ? 'good' : 'warn'}"><div class="ci">${pick === q.a ? '✅' : '💡'}</div><div><b>${pick === q.a ? 'Correct!' : 'Not quite.'}</b> ${C.esc(q.why)}</div></div>`;
          if (pick === q.a) C.addXP(5);
        }
      });
    },
  });

  C.register('pycerts', {
    render(host) {
      host.innerHTML = `<div class="page">
        ${C.pageHead('Python Certifications', 'Thinking about a Python certificate? Here are the respected options, from first steps to professional, and how they connect to your Claude Code goals.', '<button class="btn" data-go="python">🐍 Python Basics lessons</button>')}
        <div class="callout exam"><div class="ci">🧭</div><div><b>Recommended path:</b> work through this app's Python Basics (covers most PCEP topics) → free <b>Python Essentials 1</b> on edube.org → take <b>PCEP</b>. Later, Python Essentials 2 → <b>PCAP</b>. Python is optional for the Claude Architect exam, but it makes the agent concepts (tool loops, JSON schemas, SDKs) far easier to understand.</div></div>
        <div class="grid c2">${C.PY_CERTS.map((c) => `<div class="card accent">
          <div class="row between"><div style="font-size:28px">${c.icon}</div><span class="tag">${C.esc(c.level)}</span></div>
          <div class="card-title" style="margin-top:6px">${C.esc(c.name)}</div><div class="small muted" style="margin-bottom:8px">${C.esc(c.org)}</div>
          <p class="small"><b>What it covers:</b> ${C.esc(c.what)}</p>
          <p class="small"><b>Why it fits you:</b> ${C.esc(c.fit)}</p>
          <p class="small"><b>How to prepare:</b> ${C.esc(c.prep)}</p>
          <div class="row"><a class="btn sm" href="${c.url}" target="_blank" rel="noopener">Official page ↗</a>${c.course ? `<a class="btn sm ghost" href="${c.course}" target="_blank" rel="noopener">Free course ↗</a>` : ''}</div>
        </div>`).join('')}</div>
        <p class="small muted" style="margin-top:10px">Exam formats, prices and versions change. Always check the official page before booking.</p>
        <h2 style="margin-top:24px">More Python learning links</h2>
        <div class="card">${C.PY_LINKS.map(([n, u, d]) => `<div class="link-row"><div class="lr-ico">🐍</div><div><a class="lr-title" href="${u}" target="_blank" rel="noopener">${C.esc(n)}</a><div class="small">${C.esc(d)}</div><div class="lr-url">${C.esc(u)}</div></div></div>`).join('')}</div>
      </div>`;
      host.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go; });
    },
  });
})(window.CCA);
