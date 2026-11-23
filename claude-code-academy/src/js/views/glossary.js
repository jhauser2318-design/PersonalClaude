(function (C) {
  let filter = 'All';
  C.register('glossary', {
    render(host, arg) {
      const cats = ['All', ...new Set(Object.values(C.GLOSSARY).map((g) => g.cat))];
      const draw = (q) => {
        q = (q || '').toLowerCase();
        const items = Object.entries(C.GLOSSARY)
          .filter(([, g]) => filter === 'All' || g.cat === filter || (filter.startsWith('D') && g.domain === filter))
          .filter(([, g]) => !q || (g.term + ' ' + (g.aliases || []).join(' ') + ' ' + g.short).toLowerCase().includes(q))
          .sort((a, b) => a[1].term.localeCompare(b[1].term));
        host.querySelector('#gl').innerHTML = items.map(([id, g]) => `
          <div class="gloss-item" id="g-${id}">
            <div class="gloss-term">${C.esc(g.term)} ${g.domain ? `<span class="chip info" style="height:20px;font-size:11px">${g.domain}</span>` : ''}<span class="tag" style="margin-left:auto">${C.esc(g.cat)}</span></div>
            <div style="margin-top:4px">${C.esc(g.short)}</div>
            <details style="margin-top:6px"><summary class="small" style="cursor:pointer;color:var(--orange-deep)">Full beginner explanation</summary><div style="margin-top:8px">${C.termHTML(g)}</div></details>
          </div>`).join('') || '<div class="empty">No matching terms.</div>';
        host.querySelector('#count').textContent = `${items.length} terms`;
      };
      host.innerHTML = `<div class="page">
        ${C.pageHead('Glossary', 'Every term used in the app, explained for beginners. Domain tags (D1–D5) show where a term appears on the Architect exam.')}
        <div class="row" style="margin-bottom:12px"><input type="text" id="gq" placeholder="Filter terms…" style="max-width:340px"><span class="muted small" id="count"></span></div>
        <div class="filters">${[...cats, 'D1', 'D2', 'D3', 'D4', 'D5'].map((c) => `<button class="${c === filter ? 'on' : ''}" data-f="${c}">${c.startsWith('D') && c.length === 2 ? 'Exam ' + c : c}</button>`).join('')}</div>
        <div class="card" style="padding:4px 4px" id="gl"></div>
      </div>`;
      draw();
      host.querySelector('#gq').addEventListener('input', (e) => draw(e.target.value));
      host.querySelector('.filters').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; C.render(); };
      if (arg) {
        const el = host.querySelector('#g-' + CSS.escape(arg));
        if (el) { el.scrollIntoView({ block: 'center' }); el.querySelector('details').open = true; el.style.background = 'var(--orange-wash)'; }
      }
    },
  });
})(window.CCA);
