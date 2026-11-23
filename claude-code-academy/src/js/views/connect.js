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
      C.renderTrack(host, arg, {
        route: 'connect', title: 'Connect & Automate', stateKey: 'connect',
        chapters: () => C.CONNECT, missionFor: MISSION_FOR,
        practice: ['browser', 'computer-use', 'build-mcp', 'mcp'],
        labs: [{ id: 'lab', title: 'Agent Loop Visualizer', icon: '🔬', afterGroup: 'Claude API', render: renderLab }],
        afterBody: (cur) => `${cur.id === 'map' ? pickerHTML() : ''}${cur.id === 'tools' || cur.id === 'computer' ? `<div class="callout tip"><div class="ci">🔬</div><div><b>See the JSON move:</b> open the <a data-ch="lab">Agent Loop Visualizer</a> and step through the "${cur.id === 'tools' ? 'Custom tool' : 'Computer use'}" scenario.</div></div>` : ''}`,
        onBodyClick: (e, body) => {
          const pk = e.target.closest('[data-pick-q]');
          if (pk) { picks[pk.dataset.pickQ] = pk.dataset.val; const box = body.querySelector('#picker'); if (box) box.outerHTML = pickerHTML(); }
        },
      });
    },
    unmount() { clearInterval(autoTimer); },
  });

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
