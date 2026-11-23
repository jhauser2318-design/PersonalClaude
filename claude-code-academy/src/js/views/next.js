(function (C) {
  let tab = 'models';
  C.register('next', {
    render(host) {
      const N = C.NEXT;
      const t = N.tabs.find((x) => x.id === tab) || N.tabs[0];
      host.innerHTML = `<div class="page">
        ${C.pageHead("What's Next with Claude", `A snapshot of where Claude and Claude Code stand (as of ${N.asOf}) and where to go next. Things move fast: the News links at the bottom are always current.`)}
        <div class="seg" style="margin-bottom:18px">${N.tabs.map((x) => `<button class="${x.id === t.id ? 'on' : ''}" data-tab="${x.id}">${x.icon} ${C.esc(x.title)}</button>`).join('')}</div>
        <p class="muted">${C.esc(t.intro)}</p>
        <div class="${t.id === 'roadmap' ? 'timeline' : 'grid c2'}">${t.items.map(([h, b]) => t.id === 'roadmap'
          ? `<div class="tl-item"><div class="card"><div class="card-title">${C.esc(h)}</div><div>${C.esc(b)}</div></div></div>`
          : `<div class="card accent"><div class="card-title">${C.logo('sm')} ${C.esc(h)}</div><div class="small">${C.esc(b)}</div></div>`).join('')}</div>
        <h2 style="margin-top:26px">Stay current</h2>
        <div class="grid c3">
          ${link('Anthropic news', 'https://www.anthropic.com/news', '📣')}
          ${link('Claude Code changelog', 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md', '📝')}
          ${link('Claude blog', 'https://claude.com/blog', '✍️')}
          ${link('Engineering blog', 'https://www.anthropic.com/engineering', '🛠️')}
          ${link('Models overview', 'https://platform.claude.com/docs/en/about-claude/models/overview', '🧠')}
          ${link('Claude Academy courses', 'https://anthropic.skilljar.com/', '🎓')}
        </div>
        <div class="callout tip" style="margin-top:18px"><div class="ci">${C.logo()}</div><div>Want a personalised take? Ask the tutor: <a data-ask="Based on what's new with Claude and Claude Code, what should a beginner preparing for the Architect exam focus on next?">"What should I focus on next?"</a></div></div>
      </div>`;
      host.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; C.render(); }
        const a = e.target.closest('[data-ask]'); if (a) { sessionStorage.setItem('cca.ask', a.dataset.ask); C.go('chat'); }
      });
    },
  });
  const link = (n, u, i) => `<a class="card clickable" href="${u}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div style="font-size:24px">${i}</div><div class="card-title" style="margin-top:4px">${n} ↗</div><div class="lr-url">${u}</div></a>`;
})(window.CCA);
