/* Connect & Automate hub: MCP, the Claude API, computer & browser use.
   Includes the Agent Loop Visualizer and the "which approach?" picker.    */
(function (C) {
  const MISSION_FOR = { mcp: 'mcp', 'mcp-code': 'mcp', 'mcp-build': 'build-mcp', 'mcp-desktop': 'build-mcp', computer: 'computer-use', browser: 'browser', desktop: 'browser', tools: 'build-mcp', 'api-mcp': 'build-mcp' };
  let demo = 'tool';
  let stepIdx = 0;
  let autoTimer = null;
  const picks = {};

  C.register('connect', {
    render(host, arg) {
      clearInterval(autoTimer);
      const CH = C.CONNECT;
      const done = C.state.connect || (C.state.connect = {});
      const isLab = arg === 'lab';
      const cur = isLab ? null : (CH.find((c) => c.id === arg) || CH[0]);
      const groups = [...new Set(CH.map((c) => c.group))];
      const pct = Math.round(Object.keys(done).filter((k) => CH.find((c) => c.id === k)).length / CH.length * 100);
      host.innerHTML = `<div class="page wide"><div class="lesson-layout">
        <aside class="lesson-nav card flat" style="padding:10px">
          <div class="row" style="padding:4px 6px">${C.logo('sm')}<b>Connect & Automate</b></div>
          <div style="padding:2px 8px 6px"><div class="bar"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">${pct}% complete</div></div>
          ${groups.map((g) => `<div class="ln-mod">${C.esc(g)}</div>${CH.filter((c) => c.group === g).map((c) => `
            <div class="ln-item ${cur && c.id === cur.id ? 'active' : ''}" data-ch="${c.id}"><span class="ln-check ${done[c.id] ? 'done' : ''}">${done[c.id] ? '✓' : ''}</span>${c.icon} ${C.esc(c.title)}</div>`).join('')}
            ${g === 'Claude API' ? `<div class="ln-item ${isLab ? 'active' : ''}" data-ch="lab"><span class="ln-check" style="border-color:var(--orange)">▶</span>🔬 Agent Loop Visualizer</div>` : ''}`).join('')}
          <hr><div class="small" style="padding:4px 9px;font-weight:700">Practice in the Simulator</div>
          ${['browser', 'computer-use', 'build-mcp', 'mcp'].map((id) => { const m = C.MISSIONS.find((x) => x.id === id); return m ? `<div class="ln-item" data-go="simulator/${id}">${C.logo('tiny')} ${C.esc(m.title)}</div>` : ''; }).join('')}
        </aside>
        <article class="card lesson-body" style="padding:28px 34px;max-width:980px" id="chBody"></article>
      </div></div>`;
      const body = host.querySelector('#chBody');
      if (isLab) renderLab(body); else renderChapter(body, cur);
      host.addEventListener('click', (e) => {
        const ch = e.target.closest('[data-ch]'); if (ch) { C.go('connect', ch.dataset.ch); return; }
        const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go;
      });
    },
    unmount() { clearInterval(autoTimer); },
  });

  // ------------------------------------------------------------- chapter
  function renderChapter(body, cur) {
    const CH = C.CONNECT;
    const idx = CH.indexOf(cur);
    const done = C.state.connect;
    const checks = cur.check.map((q) => { const r = C.shuffleOptions(q.options, q.a); return { ...q, options: r.options, a: r.a }; });
    const mission = MISSION_FOR[cur.id] && C.MISSIONS.find((m) => m.id === MISSION_FOR[cur.id]);
    body.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">${C.esc(cur.group)}</span>${cur.domain ? `<span class="chip info">Exam ${cur.domain}: ${C.esc(C.DOMAIN_NAMES[cur.domain])}</span>` : ''}<span class="muted small">⏱ ${cur.mins} min</span></div>
      <h1>${cur.icon} ${C.esc(cur.title)}</h1>
      ${C.md(cur.body)}
      ${cur.id === 'map' ? pickerHTML() : ''}
      ${cur.id === 'tools' || cur.id === 'computer' ? `<div class="callout tip"><div class="ci">🔬</div><div><b>See the JSON move:</b> open the <a data-ch="lab">Agent Loop Visualizer</a> and step through the "${cur.id === 'tools' ? 'Custom tool' : 'Computer use'}" scenario.</div></div>` : ''}
      ${mission ? `<div class="callout tip"><div class="ci">${C.logo()}</div><div><b>Try it hands-on:</b> Simulator mission <b>"${C.esc(mission.title)}"</b>. <a data-go="simulator/${mission.id}">Open it →</a></div></div>` : ''}
      <h2>Quick check</h2>
      ${checks.map((q, qi) => `<div class="q-card" data-q="${qi}" style="margin-bottom:16px"><div class="q-text">${C.esc(q.q)}</div>
        ${q.options.map((o, i) => `<div class="q-opt" data-opt="${i}"><span class="q-letter">${'ABCD'[i]}</span><span>${C.esc(o)}</span></div>`).join('')}<div class="q-explain"></div></div>`).join('')}
      <div class="callout info"><div class="ci">${C.logo()}</div><div>Still fuzzy? <a data-ask="Explain the chapter '${C.esc(cur.title)}' to me like I'm a beginner, with one small example, then quiz me with one question.">Ask the tutor about this chapter</a></div></div>
      <hr>
      <div class="row between">
        <div>${idx > 0 ? `<button class="btn ghost" data-ch="${CH[idx - 1].id}">← ${C.esc(CH[idx - 1].title)}</button>` : ''}</div>
        <div class="row"><button class="btn ${done[cur.id] ? 'subtle' : ''}" id="chDone">${done[cur.id] ? '✓ Completed' : 'Mark complete (+25 XP)'}</button>
        ${idx < CH.length - 1 ? `<button class="btn ghost" data-ch="${CH[idx + 1].id}">${C.esc(CH[idx + 1].title)} →</button>` : ''}</div>
      </div>`;
    body.querySelector('#chDone').onclick = () => {
      if (!done[cur.id]) { done[cur.id] = true; C.addXP(25, 'Chapter complete'); }
      const next = CH[idx + 1]; C.go('connect', next ? next.id : cur.id);
    };
    body.addEventListener('click', (e) => {
      const opt = e.target.closest('.q-opt');
      if (opt && !opt.classList.contains('locked')) {
        const card = opt.closest('[data-q]'); const q = checks[+card.dataset.q]; const pick = +opt.dataset.opt;
        C.$$('.q-opt', card).forEach((o, i) => { o.classList.add('locked'); if (i === q.a) o.classList.add('correct'); else if (i === pick) o.classList.add('wrong'); });
        card.querySelector('.q-explain').innerHTML = `<div class="callout ${pick === q.a ? 'good' : 'warn'}"><div class="ci">${pick === q.a ? '✅' : '💡'}</div><div><b>${pick === q.a ? 'Correct!' : 'Not quite.'}</b> ${C.esc(q.why)}</div></div>`;
        if (pick === q.a) C.addXP(5);
      }
      const a = e.target.closest('[data-ask]'); if (a) { sessionStorage.setItem('cca.ask', a.dataset.ask); C.go('chat'); }
      const pk = e.target.closest('[data-pick-q]');
      if (pk) { picks[pk.dataset.pickQ] = pk.dataset.val; const box = body.querySelector('#picker'); if (box) box.outerHTML = pickerHTML(); }
    });
  }

  // ------------------------------------------------------ approach picker
  const PICK_QS = [
    ['what', 'What do you want Claude to control?', [['web', '🌐 A website'], ['gui', '🖥️ A desktop app with no API'], ['service', '🔌 A service with an API (GitHub, Slack, Jira…)'], ['files', '📁 Files, scripts & folders on my PC']]],
    ['often', 'How often will it run?', [['once', 'Once or now and then'], ['daily', 'Regularly, the same way']]],
    ['where', 'Where do you want to use it?', [['code', 'In Claude Code while coding'], ['desktop', 'In the Claude Desktop chat app'], ['app', 'In my own program']]],
  ];
  function recommend() {
    const { what, often, where } = picks;
    if (!what || !often || !where) return null;
    const recs = [];
    if (often === 'daily') recs.push(['Have Claude write a script, then schedule it', 'Ask Claude Code to write a Python/PowerShell/Playwright script once and run it with Task Scheduler or CI. No AI cost per run, same result every time.', 'desktop']);
    if (what === 'service') recs.push(where === 'app' ? ['MCP connector or custom tools (API)', 'Call the hosted MCP server from the Messages API with `mcp_servers` + `mcp_toolset`, or wrap the service\'s API as custom tools.', 'api-mcp'] : ['Connect the service\'s MCP server', where === 'code' ? '`claude mcp add --transport http …` (project scope if the team needs it).' : 'Settings → Connectors (remote) or Extensions in Claude Desktop.', where === 'code' ? 'mcp-code' : 'mcp-desktop']);
    if (what === 'web') recs.push(where === 'app' ? ['API browser toolset', '`{"type": "browser_toolset_20260801"}` with your own Chromium; target elements by ref.', 'browser'] : where === 'code' ? ['Playwright MCP in Claude Code', '`claude mcp add playwright npx @playwright/mcp@latest`, or `claude --chrome` for your logged-in browser.', 'browser'] : ['Playwright MCP in Claude Desktop (or Claude in Chrome)', 'Add `{"command": "npx", "args": ["@playwright/mcp@latest"]}` to claude_desktop_config.json.', 'browser']);
    if (what === 'gui') recs.push(['Computer use, in a VM', 'Screenshots + `computer_toolset_20260801`. Run it in a sandbox with human confirmation for risky steps. If the app has any API or CLI, prefer that.', 'computer']);
    if (what === 'files') recs.push(where === 'code' ? ['Claude Code\'s built-in tools', 'Read/Edit/Bash already work on files and scripts: just ask. Add a small MCP server for special actions.', 'mcp-build'] : where === 'desktop' ? ['Filesystem MCP server (one folder)', 'Allow only the folders needed; approve each action.', 'desktop'] : ['Custom tools or your own MCP server', 'Expose small, validated actions like list_files and move_file.', 'mcp-build']);
    return recs;
  }
  function pickerHTML() {
    const recs = recommend();
    return `<div class="card" id="picker" style="margin:18px 0;border:2px solid var(--orange)">
      <div class="card-title">${C.logo('sm')} Which approach should I use? Answer 3 questions</div>
      ${PICK_QS.map(([k, q, opts]) => `<div class="small" style="font-weight:650;margin:10px 0 6px">${q}</div><div class="filters" style="margin:0">${opts.map(([v, l]) => `<button class="${picks[k] === v ? 'on' : ''}" data-pick-q="${k}" data-val="${v}">${l}</button>`).join('')}</div>`).join('')}
      ${recs ? `<div style="margin-top:14px">${recs.map(([t, d, ch], i) => `<div class="callout ${i === 0 ? 'good' : 'tip'}" style="margin:8px 0"><div class="ci">${i === 0 ? '✅' : '➕'}</div><div><b>${C.esc(t)}</b>: ${C.inline(d)} <a data-ch="${ch}">Learn how →</a></div></div>`).join('')}</div>` : '<div class="small muted" style="margin-top:10px">Pick one option per question.</div>'}
    </div>`;
  }

  // ------------------------------------------------- agent loop visualizer
  const WHO = { you: ['Your program', 'info'], claude: ['Claude (API)', 'orange'], run: ['Real-world action', 'good'] };
  function renderLab(body) {
    const D = C.LOOP_DEMOS.find((d) => d.id === demo) || C.LOOP_DEMOS[0];
    stepIdx = Math.min(stepIdx, D.steps.length - 1);
    body.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Interactive</span><span class="chip info">Exam D1 + D2</span></div>
      <h1>🔬 Agent Loop Visualizer</h1>
      <p>Step through exactly what travels between <b>your program</b>, <b>Claude</b> and <b>the real world</b> in four common setups. Blue = your code, orange = Claude, green = something actually happens.</p>
      <div class="seg" style="margin:6px 0 16px;flex-wrap:wrap">${C.LOOP_DEMOS.map((d) => `<button class="${d.id === D.id ? 'on' : ''}" data-demo="${d.id}">${C.esc(d.title)}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:14px">
        <button class="btn ghost sm" data-step="-1" ${stepIdx === 0 ? 'disabled' : ''}>← Back</button>
        <button class="btn sm" data-step="1" ${stepIdx >= D.steps.length - 1 ? 'disabled' : ''}>Next step →</button>
        <button class="btn ghost sm" id="auto">${autoTimer ? '⏸ Pause' : '▶ Auto-play'}</button>
        <button class="btn ghost sm" id="restart">↺ Restart</button>
        <span class="muted small" style="margin-left:auto">Step ${stepIdx + 1} of ${D.steps.length}</span>
      </div>
      <div class="timeline">${D.steps.slice(0, stepIdx + 1).map((s, i) => {
        const [who, cls] = WHO[s.who];
        return `<div class="tl-item"><div class="card ${i === stepIdx ? 'accent' : 'flat'}" style="${i === stepIdx ? '' : 'opacity:.72'}">
          <div class="row between"><b>${i + 1}. ${C.esc(s.label)}</b><span class="chip ${cls}">${who}</span></div>
          <p class="small" style="margin:6px 0">${C.inline(s.note)}</p>
          ${s.action ? `<div class="callout good" style="margin:6px 0"><div class="ci">⚡</div><div><b>${C.esc(s.action)}</b></div></div>` : ''}
          ${s.json ? `<pre class="code"><code>${C.highlight(JSON.stringify(s.json, null, 2), 'json')}</code></pre>` : ''}
        </div></div>`;
      }).join('')}</div>
      ${stepIdx >= D.steps.length - 1 ? `<div class="callout exam"><div class="ci">🎓</div><div><b>What to remember:</b> Claude only ever <i>requests</i> actions. Your program (or the MCP server / harness) performs them and sends the results back, and the loop continues until <code>stop_reason</code> is <code>end_turn</code>.</div></div>` : ''}`;
    const last = body.querySelectorAll('.tl-item'); if (last.length > 1) last[last.length - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    body.onclick = (e) => {
      const d = e.target.closest('[data-demo]'); if (d) { demo = d.dataset.demo; stepIdx = 0; stopAuto(); renderLab(body); return; }
      const st = e.target.closest('[data-step]'); if (st && !st.disabled) { stepIdx += +st.dataset.step; renderLab(body); return; }
      if (e.target.closest('#restart')) { stepIdx = 0; stopAuto(); renderLab(body); return; }
      if (e.target.closest('#auto')) {
        if (autoTimer) { stopAuto(); renderLab(body); return; }
        autoTimer = setInterval(() => { if (stepIdx < D.steps.length - 1) { stepIdx++; renderLab(body); } else { stopAuto(); renderLab(body); } }, 2200);
        renderLab(body);
      }
    };
    if (stepIdx >= D.steps.length - 1 && !(C.state.connect || {}).lab) { C.state.connect.lab = true; C.addXP(15, 'Agent loop explored'); }
  }
  function stopAuto() { clearInterval(autoTimer); autoTimer = null; }
})(window.CCA);
