(function (C) {
  C.register('path', {
    render(host) {
      const st = C.state;
      const plan = C.EXAM.studyPlan;
      host.innerHTML = `<div class="page">
        ${C.pageHead('My Study Plan', 'A 5-week path from beginner to exam-ready. Tick items off as you go. Your progress is saved on this computer.')}
        <div class="grid c2">
          <div class="card">
            <div class="card-title">🗓 Exam date</div>
            <p class="small muted">Set a target date and the Home screen counts down.</p>
            <div class="row"><input type="date" id="examDate" value="${st.examDate || ''}" style="max-width:220px"><button class="btn sm" id="saveDate">Save</button></div>
          </div>
          <div class="card">
            <div class="card-title">👤 Your name</div>
            <p class="small muted">Optional: used to greet you on Home.</p>
            <div class="row"><input type="text" id="name" value="${C.esc(st.name || '')}" placeholder="First name" style="max-width:220px"><button class="btn sm" id="saveName">Save</button></div>
          </div>
        </div>
        <div class="timeline" style="margin-top:24px">
          ${plan.map((w, wi) => {
            const done = w.items.filter((_, i) => st.plan[`w${wi}-${i}`]).length;
            return `<div class="tl-item"><div class="card">
              <div class="row between"><div><span class="tag">${w.week}</span> <b style="font-size:16px;margin-left:6px">${C.esc(w.title)}</b></div><span class="chip ${done === w.items.length ? 'good' : ''}">${done}/${w.items.length}</span></div>
              <div style="margin-top:8px">${w.items.map((it, i) => `<div class="check-item ${st.plan[`w${wi}-${i}`] ? 'done' : ''}" data-ck="w${wi}-${i}"><div class="check-box">✓</div><div class="ck-text">${C.esc(it)}</div></div>`).join('')}</div>
            </div></div>`;
          }).join('')}
        </div>
        <div class="callout tip"><div class="ci">💡</div><div><b>Also on the side:</b> one Python lesson every few days (Python Basics tab) gets you to PCEP level in about a month.</div></div>
      </div>`;
      host.querySelector('#saveDate').onclick = () => { st.examDate = host.querySelector('#examDate').value; C.save(); C.toast('Exam date saved'); };
      host.querySelector('#saveName').onclick = () => { st.name = host.querySelector('#name').value.trim(); C.save(); C.toast('Saved'); };
      host.addEventListener('click', (e) => {
        const ck = e.target.closest('[data-ck]'); if (!ck) return;
        const id = ck.dataset.ck;
        if (st.plan[id]) delete st.plan[id]; else { st.plan[id] = true; C.addXP(5); }
        C.save(); C.render();
      });
    },
  });
})(window.CCA);
