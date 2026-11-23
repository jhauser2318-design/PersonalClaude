/* Git Playground: a small git + GitHub simulator with a live commit graph.
   Type real commands (git add/commit/switch/merge/push/pull, gh pr ...);
   guided challenges check your progress.                                  */
(function (C) {
  let G = null;
  const hex = () => Math.random().toString(16).slice(2, 9);

  function fresh() {
    const c0 = { id: hex(), msg: 'Initial commit', parents: [], files: ['README.md', 'app.js', 'cart.js'], lane: 0, by: 'you', user: false };
    return {
      commits: { [c0.id]: c0 }, order: [c0.id], branches: { main: c0.id }, head: 'main',
      modified: [], staged: [], remote: { main: c0.id }, prs: [], conflict: null, lanes: { main: 0 },
      files: ['README.md', 'app.js', 'cart.js'], out: [], hist: [], hIdx: -1, flags: {},
    };
  }

  // ------------------------------------------------------------ git model
  const tip = (b) => G.branches[b];
  function ancestors(id) {
    const seen = new Set(); const stack = [id];
    while (stack.length) { const x = stack.pop(); if (!x || seen.has(x)) continue; seen.add(x); (G.commits[x].parents || []).forEach((p) => stack.push(p)); }
    return seen;
  }
  const isAncestor = (a, b) => ancestors(b).has(a);
  function mergeBase(a, b) {
    const A = ancestors(a);
    const queue = [b]; const seen = new Set();
    while (queue.length) { const x = queue.shift(); if (seen.has(x)) continue; seen.add(x); if (A.has(x)) return x; queue.push(...G.commits[x].parents); }
    return null;
  }
  function filesSince(base, t) {
    const out = new Set(); const baseAnc = ancestors(base);
    ancestors(t).forEach((id) => { if (!baseAnc.has(id)) G.commits[id].files.forEach((f) => out.add(f)); });
    return out;
  }
  function laneFor(branch) {
    if (G.lanes[branch] == null) G.lanes[branch] = Math.max(...Object.values(G.lanes)) + 1;
    return G.lanes[branch];
  }
  function newCommit(msg, parents, files, branch, extra) {
    const c = { id: hex(), msg, parents, files, lane: laneFor(branch), by: 'you', user: true, branch, ...(extra || {}) };
    G.commits[c.id] = c; G.order.push(c.id);
    return c;
  }

  // ------------------------------------------------------------ commands
  const say = (t, cls) => G.out.push([t, cls || '']);
  function run(raw) {
    const line = raw.trim(); if (!line) return;
    G.hist.push(line); G.hIdx = -1;
    say('$ ' + line, 'cmd');
    const args = (line.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((a) => a.replace(/^["']|["']$/g, ''));
    const [cmd, sub] = args;
    try {
      if (cmd === 'clear') { G.out = []; return; }
      if (cmd === 'help') return help();
      if (cmd === 'edit' || cmd === 'echo' || cmd === 'code') return edit(args[args.length - 1]);
      if (cmd === 'ls') return say(G.files.join('   '));
      if (cmd === 'gh') return gh(args.slice(1));
      if (cmd !== 'git') return say(`${cmd}: command not found. Type "help" for the commands this playground knows.`, 'err');
      switch (sub) {
        case 'status': return status();
        case 'add': return add(args.slice(2));
        case 'commit': return commit(args.slice(2));
        case 'log': return log();
        case 'branch': return branch(args.slice(2));
        case 'switch': case 'checkout': return sw(args.slice(2));
        case 'merge': return merge(args[2]);
        case 'push': return push(args.slice(2));
        case 'pull': return pull();
        case 'fetch': return say('Fetched origin. Run "git status" to compare.');
        case 'restore': return restore(args.slice(2));
        case 'diff': return diff();
        case 'init': return say('Reinitialized existing Git repository (this playground already has one).');
        case 'clone': return say('This playground already has the repo cloned. Try "git status".');
        default: return say(`git ${sub || ''}: not supported here. Type "help".`, 'err');
      }
    } finally { check(); }
  }
  function help() {
    ['Files:   edit <file>  (pretend to change a file)   ls',
      'Look:    git status   git diff   git log   git branch',
      'Save:    git add <file|.>   git commit -m "message"   git restore <file>',
      'Branch:  git switch -c <name>   git switch <name>   git merge <name>',
      'GitHub:  git push [-u origin <branch>]   git pull',
      'PRs:     gh pr create   gh pr list   gh pr merge [--squash]',
      'Other:   clear   help'].forEach((l) => say(l, 'dim'));
  }
  function edit(file) {
    if (!file || file === 'edit') return say('Usage: edit <file>   e.g. edit cart.js', 'err');
    if (!G.files.includes(file)) G.files.push(file);
    if (G.conflict && G.conflict.files.includes(file)) { G.conflict.resolved.add(file); say(`Resolved conflict markers in ${file}. Now: git add ${file}`, 'ok'); }
    else say(`(edited ${file})`, 'dim');
    if (!G.modified.includes(file)) G.modified.push(file);
    G.staged = G.staged.filter((f) => f !== file);
  }
  function status() {
    say(`On branch ${G.head}`);
    const r = G.remote[G.head];
    if (r) {
      const local = tip(G.head);
      if (r === local) say(`Your branch is up to date with 'origin/${G.head}'.`);
      else if (isAncestor(r, local)) say(`Your branch is ahead of 'origin/${G.head}'. (use "git push")`, 'warn');
      else if (isAncestor(local, r)) say(`Your branch is behind 'origin/${G.head}'. (use "git pull")`, 'warn');
      else say(`Your branch and 'origin/${G.head}' have diverged. (use "git pull")`, 'warn');
    } else if (G.head !== 'main') say('This branch is not on GitHub yet. (use "git push -u origin ' + G.head + '")', 'dim');
    if (G.conflict) say(`You have unmerged paths: ${G.conflict.files.join(', ')}. Fix them (edit), then git add + git commit.`, 'err');
    if (G.staged.length) { say('Changes to be committed:'); G.staged.forEach((f) => say('    modified: ' + f, 'ok')); }
    if (G.modified.length) { say('Changes not staged for commit:'); G.modified.forEach((f) => say('    modified: ' + f, 'err')); }
    if (!G.staged.length && !G.modified.length && !G.conflict) say('nothing to commit, working tree clean');
  }
  function add(files) {
    if (!files.length) return say('Nothing specified. Try "git add ." or "git add cart.js"', 'err');
    const pick = files.includes('.') || files.includes('-A') ? G.modified.slice() : files.filter((f) => G.modified.includes(f));
    if (!pick.length) return say('No changes to add. Edit a file first (edit cart.js).', 'warn');
    if (G.conflict) { const unresolved = pick.filter((f) => G.conflict.files.includes(f) && !G.conflict.resolved.has(f)); if (unresolved.length) return say(`${unresolved.join(', ')} still has conflict markers. Edit it first.`, 'err'); }
    pick.forEach((f) => { if (!G.staged.includes(f)) G.staged.push(f); });
    G.modified = G.modified.filter((f) => !pick.includes(f));
    say(`Staged: ${pick.join(', ')}`, 'dim');
  }
  function commit(args) {
    const mi = args.findIndex((a) => a === '-m' || a === '-am');
    if (args.includes('-am') || args.includes('-a')) { G.staged.push(...G.modified.filter((f) => !G.staged.includes(f))); G.modified = []; }
    let msg = mi >= 0 ? args[mi + 1] : null;
    if (G.conflict) {
      if (G.conflict.files.some((f) => !G.staged.includes(f))) return say('Fix and "git add" every conflicted file before committing.', 'err');
      const c = newCommit(msg || `Merge branch '${G.conflict.other}' into ${G.head}`, [tip(G.head), G.conflict.otherTip], G.staged.slice(), G.head, { merge: true, resolved: true });
      G.branches[G.head] = c.id; G.staged = []; G.conflict = null; G.flags.resolved = true;
      return say(`[${G.head} ${c.id}] ${c.msg}   ✓ conflict resolved`, 'ok');
    }
    if (!G.staged.length) return say('nothing added to commit (use "git add")', 'warn');
    if (!msg) return say('Please add a message: git commit -m "Describe your change"', 'err');
    const c = newCommit(msg, [tip(G.head)], G.staged.slice(), G.head);
    G.branches[G.head] = c.id; G.staged = [];
    say(`[${G.head} ${c.id}] ${msg}`, 'ok'); say(` ${c.files.length} file(s) changed`, 'dim');
  }
  function log() {
    let id = tip(G.head);
    while (id) {
      const c = G.commits[id];
      const refs = Object.entries(G.branches).filter(([, v]) => v === id).map(([b]) => (b === G.head ? `HEAD -> ${b}` : b));
      Object.entries(G.remote).filter(([, v]) => v === id).forEach(([b]) => refs.push('origin/' + b));
      say(`${c.id}${refs.length ? ' (' + refs.join(', ') + ')' : ''} ${c.msg}`, refs.length ? 'ok' : '');
      id = c.parents[0];
    }
  }
  function branch(args) {
    if (!args.length) return Object.keys(G.branches).forEach((b) => say((b === G.head ? '* ' : '  ') + b, b === G.head ? 'ok' : ''));
    if (args[0] === '-d' || args[0] === '-D') {
      const b = args[1];
      if (b === G.head) return say(`Cannot delete the branch you are on.`, 'err');
      if (!G.branches[b]) return say(`branch '${b}' not found.`, 'err');
      delete G.branches[b]; return say(`Deleted branch ${b}.`, 'dim');
    }
    const b = args[0];
    if (G.branches[b]) return say(`a branch named '${b}' already exists`, 'err');
    G.branches[b] = tip(G.head); laneFor(b);
    say(`Created branch ${b} (you are still on ${G.head}; use "git switch ${b}")`, 'dim');
  }
  function sw(args) {
    const create = args[0] === '-c' || args[0] === '-b';
    const b = create ? args[1] : args[0];
    if (!b) return say('Usage: git switch <branch>   or   git switch -c <new-branch>', 'err');
    if (G.conflict) return say('Finish the merge first (resolve, add, commit).', 'err');
    if (create) { if (G.branches[b]) return say(`a branch named '${b}' already exists`, 'err'); G.branches[b] = tip(G.head); laneFor(b); }
    else if (!G.branches[b]) {
      if (G.remote[b]) { G.branches[b] = G.remote[b]; laneFor(b); } else return say(`invalid reference: ${b}`, 'err');
    }
    G.head = b;
    say(create ? `Switched to a new branch '${b}'` : `Switched to branch '${b}'`, 'ok');
  }
  function merge(other) {
    if (!other) return say('Usage: git merge <branch>', 'err');
    const ot = G.branches[other] || (other.startsWith('origin/') && G.remote[other.slice(7)]);
    if (!ot) return say(`merge: ${other} - not something we can merge`, 'err');
    if (G.staged.length || G.modified.length) return say('Commit or restore your changes before merging.', 'err');
    const cur = tip(G.head);
    if (isAncestor(ot, cur)) return say('Already up to date.');
    if (isAncestor(cur, ot)) { G.branches[G.head] = ot; return say(`Updating ${cur}..${ot}\nFast-forward (${G.head} now points at ${other}'s latest commit)`, 'ok'); }
    const base = mergeBase(cur, ot);
    const both = [...filesSince(base, cur)].filter((f) => filesSince(base, ot).has(f));
    if (both.length) {
      G.conflict = { files: both, other, otherTip: ot, resolved: new Set() };
      G.modified = both.slice();
      both.forEach((f) => say(`CONFLICT (content): Merge conflict in ${f}`, 'err'));
      return say('Automatic merge failed; fix conflicts (edit the file), then git add and git commit.', 'err');
    }
    const c = newCommit(`Merge branch '${other}' into ${G.head}`, [cur, ot], [], G.head, { merge: true });
    G.branches[G.head] = c.id;
    say(`Merge made by the 'ort' strategy. [${c.id}]`, 'ok');
  }
  function push(args) {
    const b = G.head;
    const local = tip(b); const r = G.remote[b];
    if (r && !isAncestor(r, local)) return say(`! [rejected] ${b} -> ${b} (fetch first)\nThe remote has work you don't have. Run "git pull" first.`, 'err');
    if (!r && !args.includes('-u') && !args.includes('--set-upstream')) return say(`fatal: The current branch ${b} has no upstream branch.\nTo push it, use:  git push -u origin ${b}`, 'err');
    G.remote[b] = local;
    say(`To github.com:you/shop-app.git\n   ${(r || '0000000').slice(0, 7)}..${local}  ${b} -> ${b}`, 'ok');
    if (b !== 'main') say(`Create a pull request: gh pr create   (or open github.com/you/shop-app/pull/new/${b})`, 'dim');
  }
  function pull() {
    const b = G.head; const r = G.remote[b]; const local = tip(b);
    if (!r) return say('There is no tracking information for this branch.', 'err');
    if (r === local || isAncestor(r, local)) return say('Already up to date.');
    if (isAncestor(local, r)) { G.branches[b] = r; G.flags.pulled = G.flags.pulled || G.commits[r].by === 'teammate' || ancestors(r).size > 0; return say(`Updating ${local}..${r}\nFast-forward`, 'ok'); }
    merge('origin/' + b);
  }
  function restore(files) {
    const f = files.filter((x) => x !== '--staged');
    if (files.includes('--staged')) { G.staged = G.staged.filter((x) => !f.includes(x)); G.modified.push(...f.filter((x) => !G.modified.includes(x))); return say(`Unstaged ${f.join(', ')}`, 'dim'); }
    G.modified = G.modified.filter((x) => !f.includes(x)); say(`Discarded changes in ${f.join(', ')}`, 'dim');
  }
  function diff() {
    if (!G.modified.length) return say('(no unstaged changes)', 'dim');
    G.modified.forEach((f) => { say(`diff --git a/${f} b/${f}`, 'dim'); say(`-  old line in ${f}`, 'err'); say(`+  your new line in ${f}`, 'ok'); });
  }
  function gh(args) {
    const [area, act] = args;
    if (area === 'pr' && act === 'create') {
      if (G.head === 'main') return say('You are on main. Create a branch, commit, push it, then open a PR from it.', 'err');
      if (G.remote[G.head] !== tip(G.head)) return say(`Push your branch first: git push -u origin ${G.head}`, 'err');
      const n = 40 + G.prs.length + 1;
      G.prs.push({ n, from: G.head, state: 'open' });
      return say(`Creating pull request for ${G.head} into main in you/shop-app\nhttps://github.com/you/shop-app/pull/${n}`, 'ok');
    }
    if (area === 'pr' && act === 'list') { const open = G.prs.filter((p) => p.state === 'open'); return open.length ? open.forEach((p) => say(`#${p.n}  ${p.from} → main  OPEN`)) : say('no open pull requests', 'dim'); }
    if (area === 'pr' && act === 'merge') {
      const num = args.find((a) => /^\d+$/.test(a));
      const pr = num ? G.prs.find((p) => p.n === +num) : G.prs.filter((p) => p.state === 'open').slice(-1)[0];
      if (!pr || pr.state !== 'open') return say('No open pull request found. Create one with gh pr create.', 'err');
      const from = G.remote[pr.from]; const main = G.remote.main;
      let c;
      if (args.includes('--squash')) c = newCommit(`${G.commits[from].msg} (#${pr.n})`, [main], [...filesSince(mergeBase(main, from), from)], 'main', { pr: pr.n });
      else c = newCommit(`Merge pull request #${pr.n} from ${pr.from}`, [main, from], [], 'main', { merge: true, pr: pr.n });
      G.remote.main = c.id; pr.state = 'merged'; G.flags.prMerged = c.id;
      return say(`✓ Merged pull request #${pr.n} (${args.includes('--squash') ? 'squash' : 'merge commit'}) on GitHub.\nYour local main doesn't have it yet: git switch main && git pull`, 'ok');
    }
    if (area === 'repo' && act === 'view') return say('you/shop-app · private · default branch: main');
    return say('This playground supports: gh pr create | gh pr list | gh pr merge [--squash]', 'warn');
  }

  // Scenario buttons
  function teammate() {
    const base = G.remote.main;
    const c = { id: hex(), msg: 'Add product search (by Sam)', parents: [base], files: ['search.js'], lane: 0, by: 'teammate', user: false };
    G.commits[c.id] = c; G.order.push(c.id); G.remote.main = c.id; G.flags.teammate = c.id;
    say('👥 Your teammate Sam pushed a commit to origin/main. Your local main is now behind. Try: git switch main, git pull', 'warn');
  }
  function setupConflict() {
    if (G.conflict) return;
    if (G.staged.length || G.modified.length) { say('Commit or restore your changes first.', 'err'); return; }
    G.head = 'main';
    const base = tip('main');
    G.branches.sale = base; laneFor('sale');
    const s = newCommit('Sale: allow 90% max discount', [base], ['cart.js'], 'sale'); G.branches.sale = s.id; s.user = false;
    const m = newCommit('Cap discounts at 100%', [base], ['cart.js'], 'main'); G.branches.main = m.id; m.user = false;
    say("⚔️ Set up: 'main' and a new branch 'sale' both changed cart.js. You're on main. Run: git merge sale", 'warn');
  }

  // ------------------------------------------------------------ challenges
  const userCommits = () => Object.values(G.commits).filter((c) => c.user && !c.merge);
  const CHALLENGES = [
    ['first', 'Make your first commit', 'edit cart.js → git add . → git commit -m "Cap discounts at 100%"', () => userCommits().some((c) => isAncestor(c.id, tip('main')) || c.branch === 'main')],
    ['branch', 'Commit on a feature branch', 'git switch -c feature/search → edit search.js → git add . → git commit -m "Add search"', () => userCommits().some((c) => c.branch && c.branch !== 'main')],
    ['merge', 'Merge your branch into main', 'git switch main → git merge feature/search', () => userCommits().some((c) => c.branch && c.branch !== 'main' && isAncestor(c.id, tip('main')))],
    ['push', 'Push main to GitHub', 'git push   (then git status shows "up to date")', () => G.remote.main === tip('main') && userCommits().some((c) => isAncestor(c.id, G.remote.main))],
    ['pull', 'Get a teammate\'s work', 'click "👥 Teammate pushes", then git switch main → git pull', () => G.flags.teammate && isAncestor(G.flags.teammate, tip('main'))],
    ['conflict', 'Resolve a merge conflict', 'click "⚔️ Set up a conflict" → git merge sale → edit cart.js → git add cart.js → git commit', () => G.flags.resolved],
    ['pr', 'Open & merge a pull request', 'git switch -c fix/typo → edit README.md → git commit -am "Fix typo" → git push -u origin fix/typo → gh pr create → gh pr merge --squash → git switch main → git pull', () => G.flags.prMerged && isAncestor(G.flags.prMerged, tip('main'))],
  ];
  function check() {
    const st = C.state.gitplay || (C.state.gitplay = {});
    CHALLENGES.forEach(([id, title, , fn]) => {
      if (!st[id] && fn()) { st[id] = true; C.addXP(15, 'Git challenge: ' + title); say(`🏆 Challenge complete: ${title}`, 'trophy'); }
    });
    C.save();
  }

  // ------------------------------------------------------------ rendering
  function graphSVG() {
    const X0 = 34, DX = 58, Y0 = 34, DY = 50;
    const idx = Object.fromEntries(G.order.map((id, i) => [id, i]));
    const pos = (id) => [X0 + idx[id] * DX, Y0 + G.commits[id].lane * DY];
    const lanes = Math.max(...Object.values(G.commits).map((c) => c.lane)) + 1;
    const W = Math.max(560, X0 + G.order.length * DX + 120), H = Y0 + lanes * DY + 40;
    const colors = ['#D97757', '#3B6EA5', '#3F8F5B', '#9C4A2E', '#7A5BA8', '#B7791F'];
    let edges = '', nodes = '', labels = '';
    G.order.forEach((id) => {
      const c = G.commits[id]; const [x, y] = pos(id);
      c.parents.forEach((p) => {
        const [px, py] = pos(p);
        edges += py === y ? `<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="${colors[c.lane % 6]}" stroke-width="3"/>`
          : `<path d="M${px},${py} C${px + DX * 0.6},${py} ${x - DX * 0.6},${y} ${x},${y}" fill="none" stroke="${colors[Math.max(c.lane, G.commits[p].lane) % 6]}" stroke-width="3"/>`;
      });
      const onLocal = Object.values(G.branches).some((b) => isAncestor(id, b));
      nodes += `<circle cx="${x}" cy="${y}" r="${c.merge ? 9 : 8}" fill="${onLocal ? colors[c.lane % 6] : 'var(--surface)'}" stroke="${colors[c.lane % 6]}" stroke-width="3" ${onLocal ? '' : 'stroke-dasharray="3 2"'}><title>${C.esc(c.id + ' ' + c.msg + (c.by === 'teammate' ? ' (teammate, on GitHub only until you pull)' : ''))}</title></circle>`;
      const refs = Object.entries(G.branches).filter(([, v]) => v === id).map(([b]) => b);
      const rrefs = Object.entries(G.remote).filter(([, v]) => v === id).map(([b]) => 'origin/' + b);
      let ly = y - 16;
      refs.forEach((b) => { labels += tag(x, ly, (b === G.head ? 'HEAD → ' : '') + b, b === G.head ? '#D97757' : colors[(G.lanes[b] || 0) % 6], true); ly -= 20; });
      rrefs.forEach((b) => { labels += tag(x, y + 26, b, '#7A766C', false); });
      labels += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="0">.</text>`;
    });
    return `<svg width="${W}" height="${H}" style="display:block">${edges}${nodes}${labels}</svg>`;
  }
  function tag(x, y, text, color, solid) {
    const w = text.length * 6.6 + 12;
    return `<g><rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="17" rx="5" fill="${solid ? color : 'var(--surface)'}" stroke="${color}" ${solid ? '' : 'stroke-dasharray="3 2"'}/><text x="${x}" y="${y}" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="${solid ? '#fff' : color}">${C.esc(text)}</text></g>`;
  }

  C.renderGitPlayground = (body) => {
    if (!G) { G = fresh(); say('Welcome! This is a pretend repo "shop-app" that is already on GitHub. Type "help" to see commands, or follow the challenges below.', 'dim'); }
    const st = C.state.gitplay || {};
    const draw = () => {
      body.innerHTML = `
        <div class="row" style="gap:8px;margin-bottom:6px"><span class="tag">Interactive</span><span class="chip info">No setup needed</span></div>
        <h1>🎮 Git Playground</h1>
        <p>Type real git commands and watch the <b>commit graph</b> update. Filled dots are commits on your computer; dashed dots exist only on GitHub until you pull. Badges show branches (<b>HEAD →</b> marks where you are) and dashed badges show GitHub's copy (<code>origin/…</code>).</p>
        <div class="gp-graph card flat">${graphSVG()}</div>
        <div class="gp-grid">
          <div class="gp-term">
            <div class="gp-out" id="gpOut">${G.out.slice(-160).map(([t, c]) => `<div class="gp-l ${c}">${C.esc(t)}</div>`).join('')}</div>
            <div class="gp-in"><span>you@laptop:~/shop-app (${C.esc(G.head)})$</span><input id="gpIn" spellcheck="false" autocomplete="off" placeholder="git status"></div>
          </div>
          <div class="gp-side">
            <div class="small" style="font-weight:700;margin-bottom:6px">Working folder</div>
            <div class="row" style="gap:6px;flex-wrap:wrap">${[...new Set([...G.files, 'search.js'])].map((f) => `<button class="btn sm ghost" data-edit="${f}" data-tip="Pretend to change ${f} (same as typing: edit ${f})">✏️ ${f}</button>`).join('')}</div>
            <div class="small" style="margin-top:10px"><b>On:</b> ${C.esc(G.head)} · <b>Modified:</b> ${G.modified.join(', ') || '–'} · <b>Staged:</b> ${G.staged.join(', ') || '–'}${G.conflict ? ` · <span style="color:var(--bad)"><b>Conflict:</b> ${G.conflict.files.join(', ')}</span>` : ''}</div>
            <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
              <button class="btn sm subtle" id="gpTeam">👥 Teammate pushes</button>
              <button class="btn sm subtle" id="gpConf">⚔️ Set up a conflict</button>
              <button class="btn sm subtle" id="gpReset">↺ Reset repo</button>
            </div>
          </div>
        </div>
        <h2>Challenges</h2>
        <div class="grid c2">${CHALLENGES.map(([id, title, hint], i) => `<div class="card flat" style="padding:12px 14px;${st[id] ? 'border-color:var(--good)' : ''}">
          <div class="row between"><b>${st[id] ? '✅' : i + 1 + '.'} ${C.esc(title)}</b>${st[id] ? '<span class="chip good">+15 XP</span>' : ''}</div>
          <details style="margin-top:6px"><summary class="small" style="cursor:pointer;color:var(--orange-deep)">Show the commands</summary><code style="display:block;margin-top:6px;white-space:normal;line-height:1.7">${C.esc(hint)}</code></details></div>`).join('')}</div>
        <div class="callout tip" style="margin-top:16px"><div class="ci">${C.logo()}</div><div>In real projects you rarely type all this yourself: you tell Claude Code <i>"create a branch, commit with a good message, push and open a PR"</i>. Knowing what each step means lets you <b>review what Claude does</b>, and that's the real skill.</div></div>`;
      const out = body.querySelector('#gpOut'); out.scrollTop = out.scrollHeight;
      const input = body.querySelector('#gpIn');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { run(input.value); draw(); body.querySelector('#gpIn').focus(); }
        if (e.key === 'ArrowUp' && G.hist.length) { e.preventDefault(); G.hIdx = Math.max(0, (G.hIdx < 0 ? G.hist.length : G.hIdx) - 1); input.value = G.hist[G.hIdx]; }
        if (e.key === 'ArrowDown' && G.hIdx >= 0) { e.preventDefault(); G.hIdx = Math.min(G.hist.length, G.hIdx + 1); input.value = G.hist[G.hIdx] || ''; }
      });
      body.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => { run('edit ' + b.dataset.edit); draw(); }; });
      body.querySelector('#gpTeam').onclick = () => { teammate(); check(); draw(); };
      body.querySelector('#gpConf').onclick = () => { setupConflict(); draw(); };
      body.querySelector('#gpReset').onclick = () => { G = fresh(); say('Repo reset. Challenges you completed stay completed.', 'dim'); draw(); };
      if (document.activeElement === document.body || !document.activeElement) input.focus();
    };
    draw();
  };
  C.gitPlaygroundTest = { reset: () => { G = fresh(); }, run: (c) => run(c), state: () => G, teammate: () => teammate(), conflict: () => setupConflict() };
})(window.CCA);
