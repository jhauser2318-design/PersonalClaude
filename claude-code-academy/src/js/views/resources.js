(function (C) {
  let cat = 'All';
  C.register('resources', {
    render(host) {
      const R = C.RESOURCES;
      const draw = (q) => {
        q = (q || '').toLowerCase();
        const groups = R.filter((g) => cat === 'All' || g.cat === cat).map((g) => ({ ...g, items: g.items.filter(([n, u, d]) => !q || (n + ' ' + u + ' ' + d).toLowerCase().includes(q)) })).filter((g) => g.items.length);
        host.querySelector('#res').innerHTML = groups.map((g) => `<h2 style="margin-top:20px">${g.icon} ${C.esc(g.cat)}</h2><div class="card grid c2" style="gap:2px">${g.items.map(([n, u, d]) => `
          <div class="link-row"><div class="lr-ico">${g.icon}</div><div style="min-width:0"><a class="lr-title" href="${u}" target="_blank" rel="noopener">${C.esc(n)} ↗</a><div class="small">${C.esc(d)}</div><div class="lr-url">${C.esc(u)}</div></div></div>`).join('')}</div>`).join('') || '<div class="empty">No links match.</div>';
      };
      host.innerHTML = `<div class="page">
        ${C.pageHead('Resources', `${R.reduce((n, g) => n + g.items.length, 0)} hand-picked links: official docs, free courses, must-read engineering posts, exam guides and tools. Everything opens in your browser.`)}
        <input type="text" id="rq" placeholder="Search links…" style="max-width:360px;margin-bottom:12px">
        <div class="filters">${['All', ...R.map((g) => g.cat)].map((c) => `<button class="${c === cat ? 'on' : ''}" data-cat="${C.esc(c)}">${C.esc(c)}</button>`).join('')}</div>
        <div id="res"></div>
        <div class="callout info" style="margin-top:18px"><div class="ci">🐍</div><div>Python links live in <a data-go="pycerts">Python Certifications</a>.</div></div>
      </div>`;
      draw();
      host.querySelector('#rq').addEventListener('input', (e) => draw(e.target.value));
      host.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; C.render(); }
        const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go;
      });
    },
  });
})(window.CCA);
