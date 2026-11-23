(function (C) {
  C.register('exam', {
    render(host) {
      const E = C.EXAM;
      host.innerHTML = `<div class="page">
        ${C.pageHead('Exam Guide: ' + E.name, 'Everything about the exam in one place: format, the five domains and their weights, the scenarios, the principles that decide most questions, and a study plan.', '<button class="btn" data-go="practice">📝 Practice now</button>')}
        <div class="callout info"><div class="ci">ℹ️</div><div>These details come from published study guides (late 2026). Logistics like fee, eligibility and scheduling can change, so confirm them on Anthropic's official certification page before you book.</div></div>

        <div class="grid c2">
          <div class="card"><div class="card-title">📋 Exam at a glance</div>
            <table class="t">${E.facts.map(([a, b]) => `<tr><th style="width:34%;text-transform:none;letter-spacing:0;font-size:13px">${a}</th><td>${C.esc(b)}</td></tr>`).join('')}</table></div>
          <div class="card"><div class="card-title">⚖️ Domain weights</div>
            <div class="domain-bar">${E.domains.map((d) => `<div style="width:${d.weight}%;background:${d.color}" data-tip="${C.esc(d.name)}">${d.id}</div>`).join('')}</div>
            ${E.domains.map((d) => `<div class="row" style="gap:8px;margin:6px 0"><span style="width:12px;height:12px;border-radius:3px;background:${d.color}"></span><b style="width:30px">${d.id}</b><span class="grow">${C.esc(d.name)}</span><b>${d.weight}%</b><span class="muted small" style="width:70px;text-align:right">≈${Math.round(d.weight * 0.6)} Qs</span></div>`).join('')}
          </div>
        </div>

        <h2 style="margin-top:26px">The five domains</h2>
        ${E.domains.map((d) => `<div class="card" style="margin-bottom:14px;border-left:5px solid ${d.color}">
          <div class="row between"><div class="card-title" style="margin:0">${d.id} · ${C.esc(d.name)}</div><span class="chip orange">${d.weight}%</span></div>
          <p class="muted" style="margin:6px 0 10px">${C.esc(d.summary)}</p>
          <div class="small" style="font-weight:650;margin-bottom:4px">What you must be able to do</div>
          <ul>${d.tasks.map((t) => `<li>${C.esc(t)}</li>`).join('')}</ul>
          <div class="small" style="font-weight:650;margin:8px 0 4px">Key terms (hover or click)</div>
          <div class="term-list">${d.terms.map((t) => `<span class="chip" data-term="${t}">${C.esc(C.GLOSSARY[t].term)}</span>`).join('')}</div>
          <div class="row" style="margin-top:12px">${d.lessons.map((id) => { const l = C.LESSONS.flatMap((m) => m.lessons).find((x) => x.id === id); return `<button class="btn sm ghost" data-go="learn/${id}">📘 ${C.esc(l.title)}</button>`; }).join('')}<button class="btn sm" data-go="practice/${d.id}">Drill ${d.id}</button></div>
        </div>`).join('')}

        <h2 style="margin-top:26px">The six scenarios</h2>
        <p class="muted">Questions are grouped under realistic production scenarios. Each sitting reportedly uses about four of these.</p>
        <div class="grid c3">${E.scenarios.map((s) => `<div class="card"><div style="font-size:26px">${s.icon}</div><div class="card-title">${C.esc(s.name)}</div><div class="small muted">${C.esc(s.focus)}</div></div>`).join('')}</div>

        <h2 style="margin-top:26px">Principles that decide most questions</h2>
        <div class="grid c2">${E.principles.map(([a, b], i) => `<div class="card flat"><div class="card-title"><span class="chip orange" style="height:22px">${i + 1}</span> ${C.esc(a)}</div><div class="small">${C.esc(b)}</div></div>`).join('')}</div>

        <h2 style="margin-top:26px">Exam-day tactics</h2>
        <div class="card"><ul>${E.tips.map((t) => `<li>${C.esc(t)}</li>`).join('')}</ul></div>

        <h2 style="margin-top:26px">Sources & further reading</h2>
        <div class="card">${E.sources.map(([n, u]) => `<div class="link-row"><div class="lr-ico">🔗</div><div><a href="${u}" target="_blank" rel="noopener" class="lr-title">${C.esc(n)}</a><div class="lr-url">${C.esc(u)}</div></div></div>`).join('')}</div>
      </div>`;
      host.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go; });
    },
  });
})(window.CCA);
