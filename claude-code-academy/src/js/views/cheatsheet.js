(function (C) {
  C.register('cheatsheet', {
    render(host) {
      host.innerHTML = `<div class="page">
        ${C.pageHead('Cheat Sheet', 'Every command, key and config file you need day to day. Click a command to copy it.', '<button class="btn ghost" data-go="simulator">Practice in the Simulator</button>')}
        <div class="grid c2">${C.CHEATSHEET.map((s) => `<div class="card"><div class="card-title">${C.logo('sm')} ${C.esc(s.title)}</div>
          <table class="t">${s.rows.map(([k, d]) => `<tr><td style="width:46%"><code style="cursor:copy" data-cp="${C.esc(k)}" data-tip="Click to copy">${C.esc(k)}</code></td><td>${C.inline(d)}</td></tr>`).join('')}</table></div>`).join('')}</div>
        <div class="card" style="margin-top:16px"><div class="card-title">🗂 The .claude folder at a glance</div>
<pre class="code"><code>your-project/
├── CLAUDE.md                 <span class="tk-c"># project memory (commit)</span>
├── .mcp.json                 <span class="tk-c"># project MCP servers (commit, no secrets!)</span>
└── .claude/
    ├── settings.json         <span class="tk-c"># team permissions, hooks, env (commit)</span>
    ├── settings.local.json   <span class="tk-c"># your private overrides (git-ignored)</span>
    ├── rules/*.md            <span class="tk-c"># modular rules, optional paths: globs</span>
    ├── commands/*.md         <span class="tk-c"># custom /slash commands</span>
    ├── skills/name/SKILL.md  <span class="tk-c"># skills (+ scripts, references)</span>
    └── agents/*.md           <span class="tk-c"># subagents</span>

~/.claude/                    <span class="tk-c"># the same, but personal: applies to all your projects</span></code></pre></div>
      </div>`;
      host.addEventListener('click', (e) => {
        const c = e.target.closest('[data-cp]'); if (c) navigator.clipboard.writeText(c.dataset.cp).then(() => C.toast('Copied: ' + c.dataset.cp));
        const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go;
      });
    },
  });
})(window.CCA);
