(function (C) {
  let Q = null;      // active quiz
  let timer = null;

  C.register('practice', {
    render(host, arg) {
      if (Q && Q.host && !arg) { Q.host = host; draw(); return; }
      Q = null;
      if (arg && /^D[1-5]$/.test(arg)) { start(host, 'drill', arg); return; }
      landing(host);
    },
    unmount() { clearInterval(timer); },
  });

  function landing(host) {
    const st = C.state;
    const missedIds = Object.keys(st.missed).filter((id) => C.QUESTIONS.find((q) => q.id === id));
    const hist = st.quiz.slice(-8).reverse();
    host.innerHTML = `<div class="page">
      ${C.pageHead('Practice Tests', `${C.QUESTIONS.length} original scenario questions in the style of the Architect exam, each with a full explanation. Questions are drawn in proportion to the real domain weights.`)}
      <div class="grid c3">
        ${mode('quick', '⚡', 'Quick 10', 'Ten random questions with instant feedback after each answer.', 'Study mode')}
        ${mode('mock', '⏱', 'Timed mock exam', `All ${C.QUESTIONS.length} questions, 2 minutes each, results at the end. Feels like the real thing.`, 'Exam mode')}
        ${mode('missed', '🎯', 'Review my mistakes', missedIds.length ? `${missedIds.length} question${missedIds.length > 1 ? 's' : ''} you got wrong before.` : 'Nothing yet: questions you miss will collect here.', 'Study mode', !missedIds.length)}
      </div>
      <h2 style="margin-top:24px">Drill one domain</h2>
      <div class="grid c3">${C.EXAM.domains.map((d) => {
        const n = C.QUESTIONS.filter((q) => q.d === d.id).length;
        return `<div class="card clickable" data-drill="${d.id}" style="border-left:5px solid ${d.color}"><div class="card-title">${d.id} · ${C.esc(d.name)}</div><div class="small muted">${n} questions · ${d.weight}% of the exam</div></div>`;
      }).join('')}</div>
      <h2 style="margin-top:24px">History</h2>
      <div class="card">${hist.length ? `<table class="t"><thead><tr><th>Date</th><th>Mode</th><th>Score</th><th>Scaled</th><th>Result</th></tr></thead><tbody>${hist.map((h) => {
        const pct = h.score / h.total; const scaled = Math.round(100 + pct * 900);
        return `<tr><td>${h.date}</td><td>${C.esc(h.mode)}</td><td>${h.score}/${h.total} (${Math.round(pct * 100)}%)</td><td>${scaled}</td><td>${scaled >= 720 ? '<span class="chip good">Pass level</span>' : '<span class="chip bad">Below 720</span>'}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="muted">No tests taken yet.</div>'}</div>
      <p class="small muted" style="margin-top:10px">The "scaled" score maps your percentage onto 100–1000 as a rough guide; the real exam's scaling isn't published.</p>
    </div>`;
    host.onclick = (e) => {
      const m = e.target.closest('[data-mode]'); if (m && !m.classList.contains('disabled')) start(host, m.dataset.mode);
      const d = e.target.closest('[data-drill]'); if (d) start(host, 'drill', d.dataset.drill);
    };
  }
  const mode = (id, ico, title, sub, tag, disabled) => `<div class="card clickable ${disabled ? 'disabled' : ''}" data-mode="${id}" style="${disabled ? 'opacity:.55;cursor:default' : ''}"><div style="font-size:28px">${ico}</div><div class="card-title">${title}</div><div class="small muted">${sub}</div><span class="tag" style="margin-top:10px">${tag}</span></div>`;

  function weighted(n) {
    const out = [];
    C.EXAM.domains.forEach((d) => {
      const pool = C.shuffle(C.QUESTIONS.filter((q) => q.d === d.id));
      out.push(...pool.slice(0, Math.max(1, Math.round(n * d.weight / 100))));
    });
    return C.shuffle(out).slice(0, n);
  }

  function start(host, kind, domain) {
    clearInterval(timer);
    let qs, exam = false, label;
    if (kind === 'quick') { qs = weighted(10); label = 'Quick 10'; }
    else if (kind === 'mock') { qs = C.shuffle(C.QUESTIONS); exam = true; label = 'Timed mock'; }
    else if (kind === 'missed') { qs = C.shuffle(C.QUESTIONS.filter((q) => C.state.missed[q.id])); label = 'Mistakes review'; }
    else { qs = C.shuffle(C.QUESTIONS.filter((q) => q.d === domain)); label = domain + ' drill'; }
    qs = qs.map((q) => { const r = C.shuffleOptions(q.o, q.a); return { ...q, o: r.options, a: r.a }; });
    Q = { host, qs, idx: 0, answers: {}, flags: {}, exam, label, done: false, startAt: Date.now(), limit: exam ? qs.length * 120 : 0, revealed: {} };
    if (exam) timer = setInterval(() => { if (!Q || Q.done) return; const left = Q.limit - Math.floor((Date.now() - Q.startAt) / 1000); const el = C.$('#qTimer'); if (el) el.textContent = fmtTime(left); if (left <= 0) finish(); }, 1000);
    draw();
  }
  const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

  function draw() {
    const host = Q.host;
    if (Q.done) return results();
    const q = Q.qs[Q.idx];
    const pick = Q.answers[q.id];
    const revealed = !Q.exam && Q.revealed[q.id];
    host.innerHTML = `<div class="page">
      <div class="row between" style="margin-bottom:14px">
        <div class="row">${C.logo('lg')}<div><h2 style="margin:0">${C.esc(Q.label)}</h2><div class="muted small">${Q.exam ? 'Exam mode: answers revealed at the end' : 'Study mode: instant feedback'}</div></div></div>
        <div class="row">${Q.exam ? `<span class="timer" id="qTimer">${fmtTime(Q.limit - Math.floor((Date.now() - Q.startAt) / 1000))}</span>` : ''}<button class="btn ghost sm" id="quit">Exit</button>${Q.exam ? '<button class="btn sm" id="submitAll">Submit exam</button>' : ''}</div>
      </div>
      <div class="q-dots" style="margin-bottom:16px">${Q.qs.map((x, i) => {
        let cls = '';
        if (!Q.exam && Q.revealed[x.id]) cls = Q.answers[x.id] === x.a ? 'right' : 'wrongd';
        else if (Q.answers[x.id] != null) cls = 'answered';
        return `<div class="q-dot ${cls} ${i === Q.idx ? 'current' : ''} ${Q.flags[x.id] ? 'flag' : ''}" data-jump="${i}">${i + 1}</div>`;
      }).join('')}</div>
      <div class="card q-card">
        <div class="q-scenario"><span class="tag">${q.d}</span><span>${C.esc(C.DOMAIN_NAMES[q.d])}</span><span>·</span><span>Scenario: ${C.esc(q.s)}</span><span style="margin-left:auto">Question ${Q.idx + 1} of ${Q.qs.length}</span></div>
        <div class="q-text">${C.esc(q.q)}</div>
        ${q.o.map((o, i) => {
          let cls = '';
          if (revealed) cls = i === q.a ? 'correct' : i === pick ? 'wrong' : '';
          else if (pick === i) cls = 'selected';
          return `<div class="q-opt ${cls} ${revealed ? 'locked' : ''}" data-pick="${i}"><span class="q-letter">${'ABCD'[i]}</span><span>${C.esc(o)}</span></div>`;
        }).join('')}
        ${revealed ? `<div class="q-explain"><div class="callout ${pick === q.a ? 'good' : 'warn'}"><div class="ci">${pick === q.a ? '✅' : '💡'}</div><div><b>${pick === q.a ? 'Correct.' : `The best answer is ${'ABCD'[q.a]}.`}</b> ${C.esc(q.why)}</div></div>
          <button class="btn sm ghost" id="askTutor">${C.logo()} Ask the tutor to explain more</button></div>` : ''}
        <div class="row between" style="margin-top:14px">
          <button class="btn ghost sm" id="flag">${Q.flags[q.id] ? '🚩 Flagged' : '⚑ Flag for review'}</button>
          <div class="row">
            ${Q.idx > 0 ? '<button class="btn ghost" id="prev">← Back</button>' : ''}
            ${!Q.exam && !revealed ? `<button class="btn" id="check" ${pick == null ? 'disabled' : ''}>Check answer</button>` : ''}
            ${(Q.exam || revealed) ? (Q.idx < Q.qs.length - 1 ? '<button class="btn" id="next">Next →</button>' : `<button class="btn" id="${Q.exam ? 'submitAll2' : 'finish'}">Finish</button>`) : ''}
          </div>
        </div>
      </div>
      <p class="small muted" style="margin-top:10px">Keyboard: <kbd>A</kbd>–<kbd>D</kbd> to choose, <kbd>Enter</kbd> to check / continue.</p>
    </div>`;
    const $ = (s) => host.querySelector(s);
    host.onclick = (e) => {
      const p = e.target.closest('[data-pick]'); if (p && !p.classList.contains('locked')) { Q.answers[q.id] = +p.dataset.pick; draw(); return; }
      const j = e.target.closest('[data-jump]'); if (j) { Q.idx = +j.dataset.jump; draw(); }
    };
    $('#quit').onclick = () => { if (confirm('Leave this test? Progress in it will be lost.')) { clearInterval(timer); Q = null; landing(host); } };
    $('#flag').onclick = () => { Q.flags[q.id] = !Q.flags[q.id]; draw(); };
    if ($('#prev')) $('#prev').onclick = () => { Q.idx--; draw(); };
    if ($('#next')) $('#next').onclick = () => { Q.idx++; draw(); };
    if ($('#check')) $('#check').onclick = () => { Q.revealed[q.id] = true; if (Q.answers[q.id] === q.a) C.addXP(5); draw(); };
    if ($('#finish')) $('#finish').onclick = finish;
    if ($('#submitAll')) $('#submitAll').onclick = () => { const un = Q.qs.filter((x) => Q.answers[x.id] == null).length; if (!un || confirm(`${un} unanswered. Submit anyway?`)) finish(); };
    if ($('#submitAll2')) $('#submitAll2').onclick = () => $('#submitAll').click();
    if ($('#askTutor')) $('#askTutor').onclick = () => {
      sessionStorage.setItem('cca.ask', `Explain this practice question for me. Why is "${q.o[q.a]}" the best answer, and why are the other options wrong?\n\nScenario: ${q.s}\nQuestion: ${q.q}\nOptions:\n${q.o.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n')}${pick != null && pick !== q.a ? `\n\nI chose ${'ABCD'[pick]}.` : ''}`);
      C.go('chat');
    };
    document.onkeydown = (e) => {
      if (!Q || Q.done || C.current !== C.views.practice || /input|textarea/i.test(document.activeElement.tagName)) return;
      const k = e.key.toUpperCase();
      if ('ABCD'.includes(k) && k.length === 1 && !(revealed)) { Q.answers[q.id] = 'ABCD'.indexOf(k); draw(); }
      if (e.key === 'Enter') { const b = $('#check:not([disabled])') || $('#next') || $('#finish'); if (b) b.click(); }
    };
  }

  function finish() {
    clearInterval(timer);
    Q.done = true;
    const byDomain = {};
    let score = 0;
    Q.qs.forEach((q) => {
      const ok = Q.answers[q.id] === q.a;
      byDomain[q.d] = byDomain[q.d] || [0, 0];
      byDomain[q.d][1]++;
      C.state.seenQ[q.id] = (C.state.seenQ[q.id] || 0) + 1;
      if (ok) { score++; byDomain[q.d][0]++; if (C.state.missed[q.id]) delete C.state.missed[q.id]; }
      else C.state.missed[q.id] = (C.state.missed[q.id] || 0) + 1;
    });
    Q.score = score; Q.byDomain = byDomain;
    C.state.quiz.push({ date: C.today(), mode: Q.label, score, total: Q.qs.length, byDomain });
    if (C.state.quiz.length > 100) C.state.quiz.shift();
    C.addXP(score * (Q.exam ? 6 : 3), `${Q.label} finished`);
    results();
  }

  function results() {
    const host = Q.host;
    const pct = Q.score / Q.qs.length;
    const scaled = Math.round(100 + pct * 900);
    const pass = scaled >= 720;
    host.innerHTML = `<div class="page">
      <div class="hero" style="${pass ? '' : 'background:linear-gradient(135deg,#8C6A5A,#5E4A40)'}"><svg class="hero-logo"><use href="#spark"/></svg>
        <h1>${pass ? 'Pass level! 🎉' : 'Keep going, you\'re building it'}</h1>
        <p>${Q.score} of ${Q.qs.length} correct (${Math.round(pct * 100)}%) · scaled ≈ <b>${scaled}</b> / 1000 (passing is 720)</p>
        <div class="row" style="margin-top:12px"><button class="btn" id="again">Try another test</button><button class="btn ghost" id="review">Review answers ↓</button></div></div>
      <h2 style="margin-top:22px">By domain</h2>
      <div class="card">${C.EXAM.domains.filter((d) => Q.byDomain[d.id]).map((d) => { const [r, t] = Q.byDomain[d.id]; const p = Math.round(r / t * 100); return `<div class="row" style="margin:8px 0"><b style="width:40px">${d.id}</b><span style="width:330px" class="small">${C.esc(d.name)}</span><div class="bar grow"><i style="width:${p}%;background:${p >= 72 ? 'var(--good)' : d.color}"></i></div><b style="width:90px;text-align:right">${r}/${t} · ${p}%</b></div>`; }).join('')}</div>
      <h2 style="margin-top:22px" id="reviewH">Review</h2>
      ${Q.qs.map((q, i) => { const pick = Q.answers[q.id]; const ok = pick === q.a; return `<div class="card" style="margin-bottom:12px;border-left:4px solid ${ok ? 'var(--good)' : 'var(--bad)'}">
        <div class="q-scenario"><span class="tag">${q.d}</span> Q${i + 1} · ${C.esc(q.s)}</div><div style="font-weight:600;margin-bottom:8px">${C.esc(q.q)}</div>
        ${q.o.map((o, j) => `<div class="small" style="padding:3px 0;${j === q.a ? 'color:var(--good);font-weight:650' : j === pick ? 'color:var(--bad);text-decoration:line-through' : 'color:var(--muted)'}">${'ABCD'[j]}. ${C.esc(o)} ${j === q.a ? '✓' : ''}${j === pick && !ok ? ' (your answer)' : ''}</div>`).join('')}
        ${pick == null ? '<div class="small" style="color:var(--warn)">Not answered</div>' : ''}
        <div class="callout ${ok ? 'good' : 'warn'}" style="margin-bottom:0"><div class="ci">💡</div><div class="small">${C.esc(q.why)}</div></div></div>`; }).join('')}
    </div>`;
    host.querySelector('#again').onclick = () => { Q = null; landing(host); };
    host.querySelector('#review').onclick = () => host.querySelector('#reviewH').scrollIntoView({ behavior: 'smooth' });
    if (pass) C.confetti(document.body);
  }
})(window.CCA);
