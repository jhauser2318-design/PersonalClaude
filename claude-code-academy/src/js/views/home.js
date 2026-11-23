(function (C) {
  C.register('home', {
    render(host) {
      const st = C.state;
      const lv = C.level();
      const allLessons = C.LESSONS.flatMap((m) => m.lessons);
      const nextLesson = allLessons.find((l) => !st.lessons[l.id]);
      const nextMission = C.MISSIONS.find((m) => !st.missions[m.id]);
      const best = st.quiz.reduce((b, q) => Math.max(b, Math.round(q.score / q.total * 100)), 0);
      const daysLeft = st.examDate ? Math.ceil((new Date(st.examDate) - new Date(C.today())) / 86400000) : null;
      const pct = C.overall();
      const xpPct = lv.next ? Math.round((st.xp - lv.min) / (lv.next - lv.min) * 100) : 100;
      const hello = st.name ? `Welcome back, ${C.esc(st.name)}` : 'Welcome to Claude Code Academy';
      const weak = weakestDomain();
      host.innerHTML = `<div class="page">
        <div class="hero">
          <svg class="hero-logo"><use href="#spark"/></svg>
          <div class="row" style="gap:10px;margin-bottom:6px"><span class="chip" style="background:rgba(255,255,255,.2);color:#fff">${C.esc(lv.name)}</span>${daysLeft != null ? `<span class="chip" style="background:rgba(255,255,255,.2);color:#fff">🗓 ${daysLeft >= 0 ? daysLeft + ' days to exam' : 'exam date passed'}</span>` : ''}</div>
          <h1>${hello}</h1>
          <p>Learn Claude Code from zero, practice in a safe simulator, and get ready for the <b>Claude Certified Architect</b> exam, with an AI tutor whenever you're stuck.</p>
          <div class="row" style="margin-top:16px">
            ${nextMission ? `<button class="btn lg" data-go="simulator/${nextMission.id}">${C.logo()} Continue in the Simulator</button>` : `<button class="btn lg" data-go="practice">📝 Take a practice exam</button>`}
            ${nextLesson ? `<button class="btn lg ghost" data-go="learn/${nextLesson.id}">📘 Next lesson: ${C.esc(nextLesson.title)}</button>` : ''}
          </div>
        </div>

        <div class="grid c4" style="margin-top:20px">
          <div class="card"><div class="row"><div class="ring" style="--p:${pct}"><span>${pct}%</span></div><div class="stat"><span class="lbl">Overall</span><b>Ready-meter</b><span class="small muted">lessons · missions · tests</span></div></div></div>
          <div class="card stat"><span class="num">${Object.keys(st.lessons).length}<span class="muted" style="font-size:16px">/${allLessons.length}</span></span><span class="lbl">Lessons done</span><div class="bar"><i style="width:${Object.keys(st.lessons).length / allLessons.length * 100}%"></i></div></div>
          <div class="card stat"><span class="num">${Object.keys(st.missions).length}<span class="muted" style="font-size:16px">/${C.MISSIONS.length}</span></span><span class="lbl">Simulator missions</span><div class="bar"><i style="width:${Object.keys(st.missions).length / C.MISSIONS.length * 100}%"></i></div></div>
          <div class="card stat"><span class="num">${best}%</span><span class="lbl">Best practice score (pass ≈ 72%)</span><div class="bar"><i style="width:${best}%"></i></div></div>
        </div>

        <div class="grid c3" style="margin-top:16px">
          <div class="card accent">
            <div class="card-title">${C.logo('sm')} Level: ${C.esc(lv.name)}</div>
            <div class="bar" style="margin:8px 0"><i style="width:${xpPct}%"></i></div>
            <div class="small muted">${st.xp} XP${lv.next ? ` · ${lv.next - st.xp} XP to <b>${C.esc(lv.nextName)}</b>` : ' · max level!'}</div>
            <div class="small" style="margin-top:10px">🔥 Study streak: <b>${C.streak()} day${C.streak() === 1 ? '' : 's'}</b></div>
          </div>
          <div class="card accent">
            <div class="card-title">🎯 Focus area</div>
            ${weak ? `<p class="small">Your weakest exam domain so far is <b>${weak.id}: ${C.esc(weak.name)}</b> (${weak.pct}%).</p><button class="btn sm" data-go="practice/${weak.id}">Practice ${weak.id}</button>` : `<p class="small">Take a practice test to see which exam domain needs the most work.</p><button class="btn sm" data-go="practice">Start a quick test</button>`}
          </div>
          <div class="card accent">
            <div class="card-title">${C.logo('sm')} Ask the tutor</div>
            <p class="small">Stuck on a concept? The tutor knows this app's lessons, glossary and exam guide.</p>
            <button class="btn sm" data-go="chat">Ask Claude</button>
          </div>
        </div>

        <h2 style="margin-top:28px">Jump in</h2>
        <div class="grid c4">
          ${tile('simulator', C.logo('lg'), 'Simulator', 'A mock desktop with a scripted Claude Code session that explains every step.')}
          ${tile('learn', '📘', 'Lessons', '22 beginner-friendly lessons from "what is a terminal" to multi-agent design.')}
          ${tile('exam', '🎓', 'Exam Guide', 'The 5 domains, weights, scenarios, principles and a 5-week plan.')}
          ${tile('practice', '📝', 'Practice Tests', `${C.QUESTIONS.length} scenario questions with full explanations; timed mock exams.`)}
          ${tile('flashcards', '🃏', 'Flashcards', 'Spaced-repetition cards for every key term.')}
          ${tile('python', '🐍', 'Python Basics', '11 lessons with a live playground that runs your code.')}
          ${tile('next', '🚀', "What's Next", 'Latest models, Claude Code features and platform news.')}
          ${tile('resources', '🔗', 'Resources', 'Curated official docs, courses, blog posts and exam guides.')}
        </div>
      </div>`;
      host.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) location.hash = '#/' + g.dataset.go; });
    },
  });
  function tile(route, ico, title, sub) {
    return `<div class="card clickable" data-go="${route}"><div style="font-size:30px;height:44px;display:flex;align-items:center">${ico}</div><div class="card-title" style="margin-top:6px">${title}</div><div class="small muted">${sub}</div></div>`;
  }
  function weakestDomain() {
    const agg = {};
    C.state.quiz.forEach((q) => Object.entries(q.byDomain || {}).forEach(([d, [r, t]]) => { agg[d] = agg[d] || [0, 0]; agg[d][0] += r; agg[d][1] += t; }));
    const list = Object.entries(agg).filter(([, [, t]]) => t >= 2).map(([d, [r, t]]) => ({ id: d, name: C.DOMAIN_NAMES[d], pct: Math.round(r / t * 100) }));
    list.sort((a, b) => a.pct - b.pct);
    return list[0] || null;
  }
})(window.CCA);
