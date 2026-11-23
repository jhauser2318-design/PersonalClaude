/* Context & Memory Engineering track + two labs:
   Context Budget Visualizer and Prompt Cache Lab.                         */
(function (C) {
  // Prices per million input tokens and cache-read multipliers
  const MODELS = {
    'claude-opus-5-5': { name: 'Claude Opus 5.5', input: 4, read: 0.05, window: 1000000 },
    'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', input: 2, read: 0.05, window: 1000000 },
    'claude-haiku-5-5': { name: 'Claude Haiku 5.5', input: 0.1, read: 0.1, window: 1000000 },
  };
  const fmt$ = (x) => (x < 0.01 ? '$' + x.toFixed(4) : '$' + x.toFixed(3));
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n)));

  // ---------------------------------------------------- budget visualizer
  const B = { model: 'claude-opus-5-5', system: 6000, tools: 25, turns: 30, files: 12, chunks: 8, cache: true };
  const SLIDERS = [
    ['system', 'System prompt + CLAUDE.md / memory (tokens)', 0, 40000, 500],
    ['tools', 'Tool definitions (≈300 tokens each)', 0, 150, 1],
    ['turns', 'Conversation turns so far (≈1,500 tokens each)', 0, 400, 1],
    ['files', 'Files read into context (≈2,500 tokens each)', 0, 200, 1],
    ['chunks', 'Retrieved chunks for this question (≈400 tokens each)', 0, 60, 1],
  ];
  function renderBudget(body) {
    const m = MODELS[B.model];
    const parts = [
      ['Tools', B.tools * 300, '#3B6EA5', true],
      ['System & memory', B.system, '#D97757', true],
      ['Conversation', B.turns * 1500, '#9C4A2E', true],
      ['File reads', B.files * 2500, '#B7791F', true],
      ['Retrieved chunks', B.chunks * 400, '#3F8F5B', false],
      ['Question', 200, '#7A766C', false],
    ];
    const total = parts.reduce((s, p) => s + p[1], 0);
    const pct = total / m.window * 100;
    const stable = parts.filter((p) => p[3]).reduce((s, p) => s + p[1], 0);
    const uncached = total / 1e6 * m.input;
    const cached = ((total - stable) + stable * m.read) / 1e6 * m.input;
    const perReq = B.cache ? cached : uncached;
    const tips = [];
    if (B.system > 12000) tips.push(['Slim the system prompt / CLAUDE.md', 'Move file-type rules to .claude/rules with paths:, procedures to skills, details behind @imports.', 'ctx-claudecode']);
    if (B.tools > 40) tips.push(['Too many tools loaded', 'Scope tools per agent or use tool search / deferred loading for big catalogs.', 'ctx-agents']);
    if (B.files > 30) tips.push(['Lots of whole files in context', 'Search first (Grep/Glob) and read only what matters, or delegate exploration to a subagent.', 'ctx-agents']);
    if (B.turns > 120 || pct > 50) tips.push(['Long conversation', 'Use context editing for stale tool results, /compact or server-side compaction, and keep key facts in a file or facts block.', 'ctx-long']);
    if (B.chunks > 25) tips.push(['Many retrieved chunks', 'Retrieve fewer, better chunks: hybrid search + reranking, then cite.', 'ctx-rag']);
    if (!B.cache && stable > 512) tips.push(['Turn on prompt caching', `The stable prefix (${fmtK(stable)} tokens) could be read at ${m.read}× the price on repeat requests.`, 'ctx-caching']);
    if (!tips.length) tips.push(['Looks healthy', 'Lean context, with caching doing its job. Keep it that way as the agent grows.', null]);
    body.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Interactive</span><span class="chip info">Estimates</span></div>
      <h1>📊 Context Budget Visualizer</h1>
      <p>Drag the sliders to describe one request from an agent or Claude Code session. See how full the context window gets and what each request costs, with and without prompt caching.</p>
      <div class="grid c2" style="align-items:start">
        <div class="card flat">
          <label class="field"><span>Model</span><select id="bModel">${Object.entries(MODELS).map(([id, x]) => `<option value="${id}" ${id === B.model ? 'selected' : ''}>${x.name} ($${x.input}/MTok input)</option>`).join('')}</select></label>
          ${SLIDERS.map(([k, label, min, max, step]) => `<label class="field"><span>${label}: <b id="v-${k}">${k === 'system' ? fmtK(B[k]) : B[k]}</b></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${B[k]}" style="width:100%;accent-color:var(--orange)"></label>`).join('')}
          <label class="check-item" style="cursor:pointer"><input type="checkbox" id="bCache" ${B.cache ? 'checked' : ''} style="accent-color:var(--orange)"><div>Prompt caching on <div class="small muted">Tools, system prompt and earlier conversation (as automatic caching does in a multi-turn session) are read at ${m.read}× the input price; only this turn's retrieved chunks and question are new</div></div></label>
        </div>
        <div>
          <div class="card">
            <div class="row between"><b>Context window usage</b><span class="chip ${pct > 80 ? 'bad' : pct > 50 ? '' : 'good'}">${fmtK(total)} / ${fmtK(m.window)} tokens · ${pct.toFixed(1)}%</span></div>
            <div class="ctx-bar">${parts.map(([n, t, c]) => t ? `<div style="width:${Math.max(t / m.window * 100, 0)}%;background:${c}" data-tip="${n}: ${fmtK(t)} tokens"></div>` : '').join('')}</div>
            <div class="ctx-legend">${parts.map(([n, t, c]) => `<span><i style="background:${c}"></i>${n} <b>${fmtK(t)}</b></span>`).join('')}</div>
            <div class="small muted" style="margin-top:6px">Quality tends to drop well before the window is full: aim to keep what's in context relevant, not merely under the limit.</div>
          </div>
          <div class="grid c2" style="margin-top:12px">
            <div class="card stat"><span class="lbl">Input cost per request</span><span class="num">${fmt$(perReq)}</span><span class="small muted">${B.cache ? `without caching: ${fmt$(uncached)}` : 'caching off'}</span></div>
            <div class="card stat"><span class="lbl">100 such requests</span><span class="num">${fmt$(perReq * 100)}</span><span class="small muted">input tokens only; output billed separately</span></div>
          </div>
          <h3 style="margin-top:16px">Suggestions</h3>
          ${tips.map(([t, d, ch]) => `<div class="callout tip" style="margin:6px 0"><div class="ci">💡</div><div><b>${t}</b>: ${C.esc(d)}${ch ? ` <a data-ch="${ch}">Learn more →</a>` : ''}</div></div>`).join('')}
        </div>
      </div>`;
    body.querySelectorAll('input[type=range]').forEach((r) => { r.oninput = () => { B[r.dataset.k] = +r.value; renderBudget(body); }; });
    body.querySelector('#bModel').onchange = (e) => { B.model = e.target.value; renderBudget(body); };
    body.querySelector('#bCache').onchange = (e) => { B.cache = e.target.checked; renderBudget(body); };
    const st = C.state.context || (C.state.context = {});
    if (!st.budget) { st.budget = true; C.addXP(10, 'Context budget explored'); }
  }

  // ------------------------------------------------------ prompt cache lab
  const BLOCKS = {
    tools: { name: 'Tool definitions', tokens: 6000, changes: 'never' },
    rules: { name: 'System rules', tokens: 3000, changes: 'never' },
    docs: { name: 'Reference docs', tokens: 20000, changes: 'never' },
    time: { name: 'Current timestamp', tokens: 20, changes: 'every' },
    user: { name: 'User profile (same user)', tokens: 300, changes: 'never' },
    question: { name: 'The question', tokens: 100, changes: 'every' },
  };
  const L = { order: ['time', 'tools', 'rules', 'docs', 'user', 'question'], bp: 4 }; // breakpoint after index bp
  function renderCacheLab(body) {
    const before = L.order.slice(0, L.bp + 1);
    const prefixTokens = before.reduce((s, k) => s + BLOCKS[k].tokens, 0);
    const restTokens = L.order.slice(L.bp + 1).reduce((s, k) => s + BLOCKS[k].tokens, 0);
    const prefixStable = before.every((k) => BLOCKS[k].changes === 'never');
    const firstChanging = before.find((k) => BLOCKS[k].changes !== 'never');
    const price = 4; // Opus 5.5 input $/MTok
    const rows = [1, 2, 3, 4, 5].map((n) => {
      const hit = n > 1 && prefixStable && prefixTokens >= 512;
      const write = !hit && prefixTokens >= 512;
      const cost = ((hit ? prefixTokens * 0.05 : write ? prefixTokens * 1.25 : prefixTokens) + restTokens) / 1e6 * price;
      return { n, hit, write, cost };
    });
    const total = rows.reduce((s, r) => s + r.cost, 0);
    const noCache = 5 * (prefixTokens + restTokens) / 1e6 * price;
    body.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Interactive</span><span class="chip info">Claude Opus 5.5 prices</span></div>
      <h1>♻️ Prompt Cache Lab</h1>
      <p>Arrange the blocks of a prompt (top = first) and choose where the <b>cache breakpoint</b> goes. Then see what happens over 5 consecutive requests where the timestamp and the question change each time.</p>
      <div class="grid c2" style="align-items:start">
        <div class="card flat">
          <div class="small" style="font-weight:700;margin-bottom:8px">Prompt order (render order: tools → system → messages, simplified)</div>
          ${L.order.map((k, i) => `<div class="cl-block ${BLOCKS[k].changes === 'every' ? 'changing' : ''}">
              <span class="cl-name">${BLOCKS[k].changes === 'every' ? '🔄' : '🧊'} ${BLOCKS[k].name} <span class="muted small">${fmtK(BLOCKS[k].tokens)}</span></span>
              <span class="row" style="gap:4px"><button class="btn sm ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn sm ghost" data-down="${i}" ${i === L.order.length - 1 ? 'disabled' : ''}>↓</button></span>
            </div>
            ${i === L.bp ? '<div class="cl-bp">⟵ cache breakpoint (cache_control) here</div>' : `<div class="cl-bp-slot" data-bp="${i}">place breakpoint here</div>`}`).join('')}
          <div class="small muted" style="margin-top:8px">🧊 same every request · 🔄 changes every request</div>
        </div>
        <div>
          <div class="callout ${prefixStable ? 'good' : 'warn'}"><div class="ci">${prefixStable ? '✅' : '💥'}</div><div>${prefixStable
            ? `<b>Cache works.</b> The ${fmtK(prefixTokens)}-token prefix is identical every time, so requests 2–5 read it at 0.05× the price.`
            : `<b>Cache never hits.</b> "${BLOCKS[firstChanging].name}" changes every request and sits <i>before</i> the breakpoint, so the cached prefix is never the same twice. Move it below the breakpoint.`}</div></div>
          ${prefixTokens < 512 ? '<div class="callout warn"><div class="ci">⚠️</div><div>The prefix is under 512 tokens: too short to cache on current models.</div></div>' : ''}
          <table class="t"><thead><tr><th>Request</th><th>Cache</th><th>Input cost</th></tr></thead><tbody>
            ${rows.map((r) => `<tr><td>#${r.n}</td><td>${r.hit ? '<span class="chip good">read (hit)</span>' : r.write ? '<span class="chip">write</span>' : '<span class="chip bad">none</span>'}</td><td>${fmt$(r.cost)}</td></tr>`).join('')}
          </tbody></table>
          <div class="row between"><b>Total for 5 requests: ${fmt$(total)}</b><span class="muted small">no caching at all: ${fmt$(noCache)}</span></div>
          <div class="callout tip" style="margin-top:12px"><div class="ci">💡</div><div><b>Challenge:</b> get requests 2–5 to hit the cache while caching as many tokens as possible. (Hint: everything that changes goes <i>after</i> the breakpoint.)</div></div>
        </div>
      </div>`;
    body.onclick = (e) => {
      const up = e.target.closest('[data-up]'); const down = e.target.closest('[data-down]'); const bp = e.target.closest('[data-bp]');
      if (up || down) {
        const i = +(up ? up.dataset.up : down.dataset.down); const j = up ? i - 1 : i + 1;
        [L.order[i], L.order[j]] = [L.order[j], L.order[i]]; renderCacheLab(body);
      }
      if (bp) { L.bp = +bp.dataset.bp; renderCacheLab(body); }
    };
    // Reward the optimal layout: every stable block cached, everything that changes after the breakpoint
    const st = C.state.context || (C.state.context = {});
    if (prefixStable && prefixTokens >= 29000 && !st.cachelab) { st.cachelab = true; C.addXP(15, 'Prompt Cache Lab solved'); C.toast('🏆 Optimal cache layout!'); }
  }

  C.register('context', {
    render(host, arg) {
      C.renderTrack(host, arg, {
        route: 'context', title: 'Context & Memory', icon: '<span style="font-size:18px">🧠</span>', stateKey: 'context',
        chapters: () => C.CONTEXT,
        missionFor: { 'ctx-claudecode': 'context-eng', 'ctx-what': 'context-eng', 'ctx-agents': 'subagents', 'ctx-apps': 'cowork' },
        practice: ['context-eng', 'context', 'memory'],
        labs: [
          { id: 'budget', title: 'Context Budget Visualizer', icon: '📊', top: true, render: renderBudget },
          { id: 'cachelab', title: 'Prompt Cache Lab', icon: '♻️', top: true, render: renderCacheLab },
        ],
        afterBody: (cur) => (cur.id === 'ctx-budget' ? '<div class="callout tip"><div class="ci">📊</div><div>Try the <a data-ch="budget">Context Budget Visualizer</a>.</div></div>'
          : cur.id === 'ctx-caching' ? '<div class="callout tip"><div class="ci">♻️</div><div>Try the <a data-ch="cachelab">Prompt Cache Lab</a>.</div></div>'
            : cur.id === 'ctx-rag' ? '<div class="callout tip"><div class="ci">🐍</div><div>Run the mini-RAG yourself: <a data-go="python/py12">Python Basics → Mini RAG in pure Python</a>.</div></div>' : ''),
      });
    },
  });
})(window.CCA);
