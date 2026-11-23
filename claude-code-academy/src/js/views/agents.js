/* Two learning tracks: "Agents: hosted vs self-hosted" and
   "Claude chat & Cowork", each with an interactive decision wizard.      */
(function (C) {
  // ------------------------------------------------------ generic wizard
  function wizard(body, cfg, answers) {
    const draw = () => {
      const done = cfg.questions.every(([k]) => answers[k]);
      const recs = done ? cfg.recommend(answers) : null;
      body.innerHTML = `
        <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Interactive</span></div>
        <h1>${cfg.icon} ${C.esc(cfg.title)}</h1>
        <p>${C.esc(cfg.intro)}</p>
        ${cfg.questions.map(([k, q, opts], i) => `<div class="card flat" style="margin:10px 0;padding:12px 14px"><div style="font-weight:650;margin-bottom:8px">${i + 1}. ${C.esc(q)}</div>
          <div class="filters" style="margin:0">${opts.map(([v, l]) => `<button class="${answers[k] === v ? 'on' : ''}" data-wq="${k}" data-wv="${v}">${C.esc(l)}</button>`).join('')}</div></div>`).join('')}
        ${recs ? `<h2>Recommendation</h2>${recs.map(([t, d, ch], i) => `<div class="callout ${i === 0 ? 'good' : 'tip'}"><div class="ci">${i === 0 ? '✅' : '➕'}</div><div><b>${C.esc(t)}</b>: ${C.inline(d)}${ch ? ` <a data-ch="${ch}">Learn how →</a>` : ''}</div></div>`).join('')}
          <button class="btn ghost sm" data-wreset>Start over</button>` : '<p class="muted small">Answer every question to see a recommendation.</p>'}`;
    };
    draw();
    body.onclick = (e) => {
      const b = e.target.closest('[data-wq]'); if (b) { answers[b.dataset.wq] = b.dataset.wv; draw(); if (cfg.questions.every(([k]) => answers[k]) && !C.state[cfg.stateKey][cfg.labId]) { C.state[cfg.stateKey][cfg.labId] = true; C.addXP(10, 'Decision wizard used'); } return; }
      if (e.target.closest('[data-wreset]')) { Object.keys(answers).forEach((k) => delete answers[k]); draw(); }
    };
  }

  // ------------------------------------------------------ agents track
  const hostAnswers = {};
  const HOST = {
    title: 'Hosting decision wizard', icon: '🧭', stateKey: 'agents', labId: 'wizard',
    intro: 'Five questions about your agent and you\'ll get a recommended hosting approach, plus an alternative.',
    questions: [
      ['who', 'Who will use it?', [['me', 'Just me'], ['team', 'My team / company, internally'], ['customers', 'Customers, in a product']]],
      ['data', 'Must files and code execution stay inside your own network?', [['yes', 'Yes'], ['no', 'No']]],
      ['compliance', 'Do you need Zero Data Retention, HIPAA coverage, or a cloud platform like Bedrock/Vertex?', [['yes', 'Yes'], ['no', 'No / not sure']]],
      ['infra', 'How much infrastructure are you willing to run?', [['none', 'None'], ['some', 'Some (a container or two)'], ['platform', 'We have a platform team']]],
      ['kind', 'What does the agent mostly do?', [['code', 'Code & files'], ['chat', 'Conversations with tools/APIs'], ['sched', 'Scheduled reports & jobs']]],
    ],
    recommend: (a) => {
      const r = [];
      if (a.who === 'me' && a.infra === 'none') r.push(['Don\'t build: use Claude Code or Cowork', 'For your own work, the finished products already are agents. Use Cowork scheduled tasks for recurring knowledge work and Claude Code for code.', null]);
      if (a.compliance === 'yes') {
        r.push(['Self-host: Messages API or the Agent SDK', 'Run the loop yourself (on Bedrock/Vertex/Foundry or with eligible ZDR/HIPAA setups). Managed Agents isn\'t eligible there today.', a.kind === 'code' ? 'agent-sdk' : 'self-api']);
      } else if (a.data === 'yes') {
        r.push(a.infra === 'none' ? ['Managed Agents with a self-hosted sandbox', 'Anthropic runs the loop; a small worker in your network runs tools and files. (You\'ll need to run at least that worker.)', 'ma-selfsandbox']
          : ['Agent SDK in your own containers', 'Everything runs in your network: loop, tools and files. Add egress allowlists and a gateway.', 'deploy-self']);
        r.push(['Alternative: Managed Agents self-hosted sandbox', 'If you\'d rather not maintain the agent loop yourself.', 'ma-selfsandbox']);
      } else if (a.infra === 'none') {
        r.push(['Claude Managed Agents (cloud)', a.kind === 'sched' ? 'Use a scheduled deployment, with an outcome rubric if each run produces a report.' : 'Anthropic hosts the loop and a sandbox per session. You create the agent once and start sessions from your app.', a.kind === 'sched' ? 'ma-power' : 'ma-build']);
      } else if (a.kind === 'code') {
        r.push(['Claude Agent SDK', 'Claude Code\'s engine with built-in file, bash and search tools, deployed in your containers (ephemeral or long-running pattern).', 'agent-sdk']);
        r.push(['Alternative: Managed Agents (cloud)', 'If you\'d rather not run containers, attach the repo as a GitHub resource.', 'ma-build']);
      } else if (a.kind === 'chat') {
        r.push(['Messages API with your own loop (or Tool Runner)', 'Conversational agents with a few tools are simplest when you own the loop; add hooks-style checks in your code for hard rules.', 'self-api']);
        r.push(['Alternative: Managed Agents with custom tools', 'Hosted loop; your code answers custom tool calls for your private systems.', 'ma-build']);
      } else {
        r.push(['Claude Managed Agents scheduled deployment', 'No cron server needed; each run is a session with full history in the Console.', 'ma-power']);
        r.push(['Alternative: Agent SDK on your scheduler', 'An ephemeral container per run from your existing job runner or CI.', 'deploy-self']);
      }
      if (a.who === 'customers') r.push(['For a customer-facing product', 'Add authentication at a gateway, per-tenant isolation, budgets/caps, and monitoring of cost per completed task.', 'ops']);
      return r;
    },
  };
  C.register('agents', {
    render(host, arg) {
      C.renderTrack(host, arg, {
        route: 'agents', title: 'Agents: hosted vs self-hosted', icon: '<span style="font-size:18px">🏗️</span>', stateKey: 'agents',
        chapters: () => [...C.AGENTS_INTRO, ...C.AGENTS_SELF, ...C.AGENTS_MANAGED, ...C.AGENTS_DECIDE],
        missionFor: { spectrum: 'managed-agent', 'self-api': 'build-mcp', 'agent-sdk': 'sdk-agent', 'deploy-self': 'sdk-agent', 'ma-basics': 'managed-agent', 'ma-build': 'managed-agent', 'ma-power': 'managed-agent' },
        practice: ['managed-agent', 'sdk-agent'],
        labs: [{ id: 'wizard', title: 'Hosting decision wizard', icon: '🧭', top: true, render: (b) => wizard(b, HOST, hostAnswers) }],
        afterBody: (cur) => (cur.id === 'spectrum' || cur.id === 'compare' ? '<div class="callout tip"><div class="ci">🧭</div><div><b>Get a recommendation:</b> try the <a data-ch="wizard">Hosting decision wizard</a>.</div></div>' : ''),
      });
    },
  });

  // ------------------------------------------------------ apps track
  const appAnswers = {};
  const WHICH = {
    title: 'Which Claude should I use?', icon: '🧭', stateKey: 'apps', labId: 'which',
    intro: 'Three quick questions and you\'ll know whether a job belongs in chat, Cowork, Claude Code, or something you build.',
    questions: [
      ['goal', 'What do you need?', [['think', 'Answers, ideas, drafts'], ['do', 'Work done with my files & apps'], ['code', 'Software built or fixed'], ['product', 'Claude inside my own product']]],
      ['repeat', 'Will it repeat?', [['once', 'One-off'], ['weekly', 'Regularly']]],
      ['context', 'Does it need lots of background material?', [['yes', 'Yes, documents/notes'], ['no', 'Not really']]],
    ],
    recommend: (a) => {
      const r = [];
      if (a.goal === 'think') r.push(['Claude chat', 'Ask, brainstorm, draft. Turn on web search or Research for current, cited information.', 'chat-start']);
      if (a.goal === 'do') r.push(['Cowork', 'Connect a folder and the apps it needs, describe the outcome, approve the plan.', 'cowork-start']);
      if (a.goal === 'code') r.push(['Claude Code', 'In the terminal, IDE, desktop app or on the web; use the GitHub Action for @claude in PRs.', 'which-tool']);
      if (a.goal === 'product') r.push(['Build with the Claude API', 'See the Agents: hosted vs self-hosted section to choose Managed Agents, the Agent SDK or the Messages API.', null]);
      if (a.context === 'yes' && a.goal !== 'product') r.push(['Put the material in a Project', 'Project knowledge + instructions give every chat (and Cowork task) the background automatically.', 'projects']);
      if (a.repeat === 'weekly') r.push(a.goal === 'code' ? ['Automate with GitHub Actions or a schedule', 'Scheduled workflows or the Claude Code Action in automation mode.', null] : ['Schedule it', a.goal === 'product' ? 'Managed Agents scheduled deployments.' : 'Cowork scheduled tasks (/schedule).', a.goal === 'product' ? null : 'cowork-power']);
      return r;
    },
  };
  C.register('apps', {
    render(host, arg) {
      C.renderTrack(host, arg, {
        route: 'apps', title: 'Claude chat & Cowork', icon: C.logo('sm'), stateKey: 'apps',
        chapters: () => C.APPS,
        missionFor: { 'cowork-what': 'cowork', 'cowork-start': 'cowork', 'cowork-power': 'cowork', 'cowork-safety': 'cowork', connectors: 'mcp' },
        practice: ['cowork'],
        labs: [{ id: 'which', title: 'Which Claude should I use?', icon: '🧭', top: true, render: (b) => wizard(b, WHICH, appAnswers) }],
      });
    },
  });
})(window.CCA);
