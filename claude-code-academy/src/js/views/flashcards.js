(function (C) {
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
  let deck = 'due';
  let queue = [];
  let flipped = false;

  function allCards() {
    return Object.entries(C.GLOSSARY).map(([id, g]) => ({ id, front: g.term, back: g.short, long: g.long, cat: g.cat, domain: g.domain }));
  }
  function isDue(id) { const c = C.state.cards[id]; return !c || c.due <= C.today(); }
  function build() {
    let cards = allCards();
    if (deck === 'due') cards = cards.filter((c) => isDue(c.id));
    else if (/^D\d$/.test(deck)) cards = cards.filter((c) => c.domain === deck);
    else if (deck !== 'all') cards = cards.filter((c) => c.cat === deck);
    queue = C.shuffle(cards);
    flipped = false;
  }
  function grade(id, g) {
    const c = C.state.cards[id] || { box: 0 };
    if (g === 'again') c.box = 0;
    else if (g === 'hard') c.box = Math.max(1, c.box);
    else if (g === 'good') c.box = Math.min(INTERVALS.length - 1, c.box + 1);
    else c.box = Math.min(INTERVALS.length - 1, c.box + 2);
    const d = new Date(); d.setDate(d.getDate() + INTERVALS[c.box]);
    c.due = d.toISOString().slice(0, 10);
    C.state.cards[id] = c;
    C.addXP(g === 'again' ? 1 : 2);
  }

  C.register('flashcards', {
    render(host) {
      build();
      const draw = () => {
        const total = allCards().length;
        const mastered = Object.values(C.state.cards).filter((c) => c.box >= 4).length;
        const dueCount = allCards().filter((c) => isDue(c.id)).length;
        const card = queue[0];
        const cats = [...new Set(allCards().map((c) => c.cat))];
        host.innerHTML = `<div class="page">
          ${C.pageHead('Flashcards', 'Spaced repetition: cards you know come back less often, cards you miss come back soon. A few minutes a day beats cramming.')}
          <div class="row between" style="margin-bottom:14px">
            <div class="filters" style="margin:0">
              <button class="${deck === 'due' ? 'on' : ''}" data-deck="due">Due today (${dueCount})</button>
              <button class="${deck === 'all' ? 'on' : ''}" data-deck="all">All (${total})</button>
              ${['D1', 'D2', 'D3', 'D4', 'D5'].map((d) => `<button class="${deck === d ? 'on' : ''}" data-deck="${d}">Exam ${d}</button>`).join('')}
              ${cats.map((c) => `<button class="${deck === c ? 'on' : ''}" data-deck="${C.esc(c)}">${C.esc(c)}</button>`).join('')}
            </div>
          </div>
          <div class="row" style="justify-content:center;margin-bottom:12px"><span class="chip good">🏆 ${mastered} mastered</span><span class="chip">${queue.length} left in this deck</span></div>
          ${card ? `<div class="fc-wrap"><div class="fc ${flipped ? 'flipped' : ''}" id="fc">
              <div class="fc-face fc-front">${C.logo()}<div class="muted small" style="margin-bottom:10px">${C.esc(card.cat)}${card.domain ? ' · Exam ' + card.domain : ''}</div><div class="fc-term">${C.esc(card.front)}</div><div class="fc-hint">Click or press Space to flip</div></div>
              <div class="fc-face fc-back">${C.logo()}<div style="font-weight:650;font-size:18px;margin-bottom:10px">${C.esc(card.back)}</div><div style="font-size:13.5px;opacity:.92;max-height:150px;overflow:auto">${C.inline(card.long).replace(/<a /g, '<a style="color:#fff" ')}</div><div class="fc-hint">How well did you know it?</div></div>
            </div></div>
            <div class="row" style="justify-content:center;margin-top:18px;${flipped ? '' : 'visibility:hidden'}">
              <button class="btn ghost" data-g="again">↺ Again <kbd>1</kbd></button>
              <button class="btn ghost" data-g="hard">Hard <kbd>2</kbd></button>
              <button class="btn" data-g="good">Good <kbd>3</kbd></button>
              <button class="btn ghost" data-g="easy">Easy <kbd>4</kbd></button>
            </div>`
          : `<div class="card empty">${C.logo('xl')}<h2>All done for this deck!</h2><p>Come back tomorrow for due cards, or pick another deck.</p><button class="btn" data-deck="all">Practice all cards anyway</button></div>`}
        </div>`;
      };
      draw();
      host.onclick = (e) => {
        const d = e.target.closest('[data-deck]'); if (d) { deck = d.dataset.deck; build(); draw(); return; }
        if (e.target.closest('#fc')) { flipped = !flipped; draw(); return; }
        const g = e.target.closest('[data-g]'); if (g && queue[0]) act(g.dataset.g);
      };
      const act = (g) => {
        const card = queue.shift();
        grade(card.id, g);
        if (g === 'again') queue.splice(Math.min(3, queue.length), 0, card);
        flipped = false; draw();
      };
      document.onkeydown = (e) => {
        if (C.current !== C.views.flashcards || /input|textarea/i.test(document.activeElement.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); flipped = !flipped; draw(); }
        if (flipped && queue[0] && ['1', '2', '3', '4'].includes(e.key)) act(['again', 'hard', 'good', 'easy'][+e.key - 1]);
      };
    },
  });
})(window.CCA);
