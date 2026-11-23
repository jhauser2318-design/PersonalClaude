(function (C) {
  const all = () => C.LESSONS.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m })));
  C.register('learn', {
    render(host, arg) {
      const lessons = all();
      const found = lessons.find((l) => l.id === arg) || lessons.find((l) => !C.state.lessons[l.id]) || lessons[0];
      const cur = { ...found, check: found.check.map((q) => { const r = C.shuffleOptions(q.options, q.a); return { ...q, options: r.options, a: r.a }; }) };
      const idx = lessons.indexOf(found);
      const done = !!C.state.lessons[cur.id];
      const mission = cur.mission && C.MISSIONS.find((m) => m.id === cur.mission);
      host.innerHTML = `<div class="page wide"><div class="lesson-layout">
        <aside class="lesson-nav card flat" style="padding:10px">
          <div class="row" style="padding:4px 6px">${C.logo('sm')}<b>Claude Code Lessons</b></div>
          ${C.LESSONS.map((m) => `<div class="ln-mod">${m.icon} ${C.esc(m.title)}</div>${m.lessons.map((l) => `
            <div class="ln-item ${l.id === cur.id ? 'active' : ''}" data-lesson="${l.id}"><span class="ln-check ${C.state.lessons[l.id] ? 'done' : ''}">${C.state.lessons[l.id] ? '✓' : ''}</span>${C.esc(l.title)}</div>`).join('')}`).join('')}
        </aside>
        <article class="card lesson-body" style="padding:28px 34px;max-width:900px">
          <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">${C.esc(cur.module.title)}</span>${cur.domain ? `<span class="chip info">Exam ${cur.domain}: ${C.esc(C.DOMAIN_NAMES[cur.domain])}</span>` : ''}<span class="muted small">⏱ ${cur.mins} min</span></div>
          <h1>${C.esc(cur.title)}</h1>
          ${C.md(cur.body)}
          ${mission ? `<div class="callout tip"><div class="ci">${C.logo()}</div><div><b>Try it hands-on:</b> the Simulator mission <b>"${C.esc(mission.title)}"</b> walks you through this with a fake project. <a data-go="simulator/${mission.id}">Open the mission →</a></div></div>` : ''}
          <h2>Quick check</h2>
          <div id="checks">${cur.check.map((q, qi) => `
            <div class="q-card" data-q="${qi}" style="margin-bottom:16px"><div class="q-text">${C.esc(q.q)}</div>
              ${q.options.map((o, i) => `<div class="q-opt" data-opt="${i}"><span class="q-letter">${'ABCD'[i]}</span><span>${C.esc(o)}</span></div>`).join('')}
              <div class="q-explain"></div></div>`).join('')}</div>
          <hr>
          <div class="row between">
            <div>${idx > 0 ? `<button class="btn ghost" data-lesson="${lessons[idx - 1].id}">← ${C.esc(lessons[idx - 1].title)}</button>` : ''}</div>
            <div class="row">
              <button class="btn ${done ? 'subtle' : ''}" id="markDone">${done ? '✓ Completed' : 'Mark complete (+20 XP)'}</button>
              ${idx < lessons.length - 1 ? `<button class="btn ghost" data-lesson="${lessons[idx + 1].id}">${C.esc(lessons[idx + 1].title)} →</button>` : ''}
            </div>
          </div>
        </article>
      </div></div>`;
      host.addEventListener('click', (e) => {
        const l = e.target.closest('[data-lesson]'); if (l) { C.go('learn', l.dataset.lesson); return; }
        const g = e.target.closest('[data-go]'); if (g) { location.hash = '#/' + g.dataset.go; return; }
        const opt = e.target.closest('.q-opt');
        if (opt && !opt.classList.contains('locked')) {
          const card = opt.closest('[data-q]'); const q = cur.check[+card.dataset.q];
          const pick = +opt.dataset.opt;
          C.$$('.q-opt', card).forEach((o, i) => { o.classList.add('locked'); if (i === q.a) o.classList.add('correct'); else if (i === pick) o.classList.add('wrong'); });
          card.querySelector('.q-explain').innerHTML = `<div class="callout ${pick === q.a ? 'good' : 'warn'}"><div class="ci">${pick === q.a ? '✅' : '💡'}</div><div><b>${pick === q.a ? 'Correct!' : 'Not quite.'}</b> ${C.esc(q.why)}</div></div>`;
          if (pick === q.a) C.addXP(5);
        }
      });
      host.querySelector('#markDone').onclick = () => {
        if (!C.state.lessons[cur.id]) { C.state.lessons[cur.id] = true; C.addXP(20, 'Lesson complete'); }
        const next = lessons[idx + 1];
        if (next) C.go('learn', next.id); else C.render();
      };
    },
  });
})(window.CCA);
