(function (C) {
  const MODELS = [
    ['claude-opus-5-5', 'Claude Opus 5.5', 'Default. Best explanations. $4 / $20 per million tokens'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Faster and cheaper. $2 / $10'],
    ['claude-haiku-5-5', 'Claude Haiku 5.5', 'Fastest and cheapest. $0.10 / $0.50'],
    ['claude-fable-5-2', 'Claude Fable 5.2', 'Most capable, priciest. $8 / $40'],
  ];
  C.register('settings', {
    async render(host) {
      const s = window.academy ? await window.academy.settings.get() : null;
      host.innerHTML = `<div class="page" style="max-width:860px">
        ${C.pageHead('Settings', 'Your API key, the tutor\'s model, appearance, and your saved progress.')}
        <div class="card" style="margin-bottom:16px">
          <div class="card-title">${C.logo('sm')} Anthropic API key (for the Ask Claude tutor)</div>
          ${!s ? '<div class="callout warn"><div class="ci">⚠️</div><div>You are viewing the app in a browser preview. Settings like the API key only work in the desktop app.</div></div>' : `
          <p class="small">The tutor works offline without a key, but with one it answers any question using Claude. The key is stored <b>encrypted</b> with your operating system's keychain, on this computer only, and is never shown to the app's pages.</p>
          <div class="row" style="margin-bottom:8px">Status: ${s.hasKey ? `<span class="chip good">✓ Key saved ${C.esc(s.keyHint)}</span>${s.keyFromEnv ? '<span class="chip info">from ANTHROPIC_API_KEY env var</span>' : ''}` : '<span class="chip bad">No key</span>'}</div>
          <div class="row"><input type="password" id="key" placeholder="sk-ant-…" style="max-width:420px" autocomplete="off"><button class="btn" id="saveKey">Save key</button>${s.hasKey && !s.keyFromEnv ? '<button class="btn ghost" id="delKey">Remove</button>' : ''}</div>
          <details style="margin-top:10px"><summary class="small" style="cursor:pointer;color:var(--orange-deep)">How do I get an API key?</summary>
            <ol class="small" style="margin-top:8px"><li>Go to <a href="https://platform.claude.com/" target="_blank" rel="noopener">platform.claude.com</a> and sign in.</li><li>Add a little credit under <b>Billing</b> (pay-as-you-go; a tutor answer typically costs a cent or two).</li><li>Open <b>API Keys → Create Key</b>, name it <code>claude-code-academy</code>, copy it (starts with <code>sk-ant-</code>) and paste it above.</li></ol></details>`}
        </div>
        ${s ? `<div class="card" style="margin-bottom:16px">
          <div class="card-title">🧠 Tutor model</div>
          ${MODELS.map(([id, n, d]) => `<label class="check-item" style="cursor:pointer"><input type="radio" name="model" value="${id}" ${s.model === id ? 'checked' : ''} style="accent-color:var(--orange);margin-top:4px"><div><b>${n}</b><div class="small muted">${d}</div></div></label>`).join('')}
          <label class="field" style="margin-top:10px;max-width:300px"><span>Effort (how hard the model thinks)</span>
            <select id="effort">${['low', 'medium', 'high'].map((e) => `<option ${s.effort === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
          <p class="small muted">"medium" is a good balance for tutoring. Use "high" for tricky architecture questions.</p>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-title">🐍 Python for the playground</div>
          <p class="small">The playground uses the Python installed on your computer (tries <code>py</code>, <code>python</code>, <code>python3</code>). Set a full path only if it can't find yours.</p>
          <div class="row"><input type="text" id="pyPath" value="${C.esc(s.pythonPath)}" placeholder="e.g. C:\\Users\\you\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" style="max-width:560px"><button class="btn ghost" id="savePy">Save</button></div>
        </div>` : ''}
        <div class="card" style="margin-bottom:16px">
          <div class="card-title">🎨 Appearance</div>
          <div class="seg">${['system', 'light', 'dark'].map((m) => `<button class="${(C.state.theme || 'system') === m ? 'on' : ''}" data-theme="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-title">💾 Progress</div>
          <p class="small">XP ${C.state.xp} · ${Object.keys(C.state.lessons).length} lessons · ${Object.keys(C.state.missions).length} missions · ${C.state.quiz.length} tests · ${Object.keys(C.state.cards).length} flashcards studied.</p>
          <div class="row"><button class="btn ghost" id="export">Export progress</button><label class="btn ghost" style="cursor:pointer">Import progress<input type="file" id="import" accept=".json" hidden></label><button class="btn ghost" id="reset" style="color:var(--bad)">Reset all progress</button></div>
        </div>
        <p class="small muted center">${C.logo('tiny')} Claude Code Academy ${s ? 'v' + C.esc(s.version) : ''} · An independent study app. Not affiliated with or endorsed by Anthropic.</p>
      </div>`;
      const $ = (q) => host.querySelector(q);
      if (s) {
        $('#saveKey').onclick = async () => {
          const r = await window.academy.settings.setKey($('#key').value);
          if (!r.ok) { C.toast(r.error); return; }
          C.toast('API key saved securely'); C.render();
        };
        if ($('#delKey')) $('#delKey').onclick = async () => { await window.academy.settings.setKey(''); C.toast('Key removed'); C.render(); };
        host.querySelectorAll('[name=model]').forEach((r) => r.onchange = () => window.academy.settings.set({ model: r.value }).then(() => C.toast('Tutor model saved')));
        $('#effort').onchange = () => window.academy.settings.set({ effort: $('#effort').value }).then(() => C.toast('Effort saved'));
        $('#savePy').onclick = () => window.academy.settings.set({ pythonPath: $('#pyPath').value.trim() }).then(() => C.toast('Python path saved'));
      }
      host.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { C.state.theme = b.dataset.theme; C.save(); C.applyTheme(); C.render(); });
      $('#export').onclick = () => {
        const blob = new Blob([JSON.stringify(C.state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `claude-academy-progress-${C.today()}.json`; a.click();
      };
      $('#import').onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((t) => { try { Object.assign(C.state, JSON.parse(t)); C.save(); C.toast('Progress imported'); C.render(); } catch { C.toast('That file is not a valid progress export'); } });
      };
      $('#reset').onclick = () => { if (confirm('Reset ALL progress (XP, lessons, missions, tests, flashcards)? This cannot be undone.')) { C.resetProgress(); C.toast('Progress reset'); C.render(); } };
    },
  });
})(window.CCA);
