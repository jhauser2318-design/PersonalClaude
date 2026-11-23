/* Generic "learning track" page: a sidebar of grouped chapters, the chapter
   body (Markdown), quick checks, completion tracking, tutor link, and
   optional interactive "labs". Used by Connect & Automate and GitHub.     */
(function (C) {
  C.renderTrack = (host, arg, cfg) => {
    const CH = cfg.chapters();
    const done = C.state[cfg.stateKey] || (C.state[cfg.stateKey] = {});
    const lab = (cfg.labs || []).find((l) => l.id === arg);
    const cur = lab ? null : (CH.find((c) => c.id === arg) || CH[0]);
    const groups = [...new Set(CH.map((c) => c.group))];
    const pct = Math.round(Object.keys(done).filter((k) => CH.find((c) => c.id === k)).length / CH.length * 100);
    const labLink = (l) => `<div class="ln-item ${lab && lab.id === l.id ? 'active' : ''}" data-ch="${l.id}"><span class="ln-check" style="border-color:var(--orange)">▶</span>${l.icon} ${C.esc(l.title)}</div>`;
    host.innerHTML = `<div class="page wide"><div class="lesson-layout">
      <aside class="lesson-nav card flat" style="padding:10px">
        <div class="row" style="padding:4px 6px">${cfg.icon || C.logo('sm')}<b>${C.esc(cfg.title)}</b></div>
        <div style="padding:2px 8px 6px"><div class="bar"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">${pct}% complete · ${CH.length} chapters</div></div>
        ${(cfg.labs || []).filter((l) => l.top).map(labLink).join('')}
        ${groups.map((g) => `<div class="ln-mod">${C.esc(g)}</div>${CH.filter((c) => c.group === g).map((c) => `
          <div class="ln-item ${cur && c.id === cur.id ? 'active' : ''}" data-ch="${c.id}"><span class="ln-check ${done[c.id] ? 'done' : ''}">${done[c.id] ? '✓' : ''}</span>${c.icon} ${C.esc(c.title)}</div>`).join('')}
          ${(cfg.labs || []).filter((l) => l.afterGroup === g).map(labLink).join('')}`).join('')}
        ${cfg.practice && cfg.practice.length ? `<hr><div class="small" style="padding:4px 9px;font-weight:700">Practice in the Simulator</div>
        ${cfg.practice.map((id) => { const m = C.MISSIONS.find((x) => x.id === id); return m ? `<div class="ln-item" data-go="simulator/${id}">${C.logo('tiny')} ${C.esc(m.title)}</div>` : ''; }).join('')}` : ''}
      </aside>
      <article class="card lesson-body" style="padding:28px 34px;max-width:980px;min-width:0" id="chBody"></article>
    </div></div>`;
    const body = host.querySelector('#chBody');
    if (lab) lab.render(body); else chapter(body, cur, CH, done, cfg);
    host.addEventListener('click', (e) => {
      const ch = e.target.closest('[data-ch]'); if (ch) { C.go(cfg.route, ch.dataset.ch); return; }
      const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go;
    });
  };

  function chapter(body, cur, CH, done, cfg) {
    const idx = CH.indexOf(cur);
    const checks = cur.check.map((q) => { const r = C.shuffleOptions(q.options, q.a); return { ...q, options: r.options, a: r.a }; });
    const missionId = cfg.missionFor && cfg.missionFor[cur.id];
    const mission = missionId && C.MISSIONS.find((m) => m.id === missionId);
    body.innerHTML = `
      <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">${C.esc(cur.group)}</span>${cur.domain ? `<span class="chip info">Exam ${cur.domain}: ${C.esc(C.DOMAIN_NAMES[cur.domain])}</span>` : ''}<span class="muted small">⏱ ${cur.mins} min</span></div>
      <h1>${cur.icon} ${C.esc(cur.title)}</h1>
      ${C.md(cur.body)}
      ${cfg.afterBody ? cfg.afterBody(cur) : ''}
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
      const next = CH[idx + 1]; C.go(cfg.route, next ? next.id : cur.id);
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
      if (cfg.onBodyClick) cfg.onBodyClick(e, body, cur);
    });
  }
})(window.CCA);
