/* Simulator missions for GitHub: the GitHub flow with Claude, @claude via
   the Claude Code GitHub Action, and fixing a failing CI run. Includes the
   pretend GitHub pages shown in the simulator's Browser window.           */
(function (C) {
  const L = (...lines) => lines.join('\n');

  // ------------------------------------------------- @claude workflow file
  C.SIM_CREATED['~/shop-app/.github/workflows/claude.yml'] = {
    content: L('name: Claude Code', 'on:', '  issue_comment:', '    types: [created]', '  pull_request_review_comment:', '    types: [created]', 'jobs:', '  claude:',
      "    if: contains(github.event.comment.body, '@claude')", '    runs-on: ubuntu-latest', '    permissions:', '      contents: write', '      pull-requests: write', '      issues: write', '      id-token: write', '      actions: read',
      '    steps:', '      - uses: actions/checkout@v6', '        with:', '          fetch-depth: 1', '      - uses: anthropics/claude-code-action@v1', '        with:', '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}'),
    notes: {
      1: 'This is the official @claude workflow from the Claude Code docs. /install-github-app adds it for you via a PR.',
      3: 'TRIGGERS: a new comment on an issue/PR, or a review comment on a PR line.',
      9: 'Only run when the comment mentions @claude (change the word with the trigger_phrase input).',
      11: 'PERMISSIONS for the job token: write code, PRs and issues (so Claude can push a branch, open a PR and reply).',
      15: 'id-token: write is required for the Claude GitHub App authentication.',
      16: 'actions: read lets Claude read CI results.',
      18: 'Check out the repo so Claude can read and edit the code. fetch-depth: 1 = only the latest commit (fast).',
      21: 'The Claude Code Action v1. With no `prompt` it runs in INTERACTIVE mode: it answers @claude mentions.',
      23: 'The key comes from repo secrets. Or use claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }} with a token from `claude setup-token` (subscription).',
    },
  };

  // ------------------------------------------------- pretend GitHub pages
  const pill = (state) => state === 'merged' ? '<span class="gh-pill merged">⇄ Merged</span>' : state === 'closed' ? '<span class="gh-pill merged">✓ Closed</span>' : '<span class="gh-pill open">◉ Open</span>';
  const checks = (st) => st === 'passed'
    ? '<div class="gh-checks ok">✓ All checks have passed<div class="gh-sub">✓ Tests / test (pull_request) · ✓ Claude PR review</div></div>'
    : st === 'failed' ? '<div class="gh-checks bad">✗ Some checks were not successful<div class="gh-sub">✗ Tests / test (pull_request)</div></div>'
      : '<div class="gh-checks wait">● Checks are running…<div class="gh-sub">● Tests / test · ● Claude PR review</div></div>';
  const avatar = (who) => `<span class="gh-av ${who === 'claude[bot]' ? 'bot' : ''}">${who === 'claude[bot]' ? '✻' : who[0].toUpperCase()}</span>`;
  const comment = (who, body, extra) => `<div class="gh-comment">${avatar(who)}<div class="gh-cbody"><div class="gh-chead"><b>${who}</b> ${who === 'claude[bot]' ? '<span class="gh-bot">bot</span>' : ''} <span>commented</span></div><div class="gh-ctext">${body}</div>${extra || ''}</div></div>`;
  const repoHead = (tab) => `<div class="gh-top"><b>you / shop-app</b> <span class="gh-private">Private</span></div><div class="gh-tabs">${['Code', 'Issues', 'Pull requests', 'Actions', 'Settings'].map((t) => `<span class="${t === tab ? 'on' : ''}">${t}</span>`).join('')}</div>`;

  C.SIM_PAGES = {
    'https://github.com/you/shop-app/pull/43': {
      title: 'fix: cap discounts at 0-100% · PR #43',
      render: (g) => `${repoHead('Pull requests')}<div class="gh-page">
        <h3>fix: cap discounts at 0-100% <span class="gh-num">#43</span></h3>
        <div class="row" style="gap:8px;margin-bottom:10px">${pill(g.pr)} <span class="gh-meta"><b>you</b> wants to merge 2 commits into <code>main</code> from <code>fix/discount-cap</code></span></div>
        ${comment('you', 'Discounts above 100% produced negative totals.<br><br><b>Fixes #42</b><br>• Clamp the discount to 0–100<br>• Regression test for a 150% discount<br><br><i>Written with Claude Code</i>')}
        ${g.review ? comment('claude[bot]', '<b>Review:</b> looks good. One suggestion: <code>cart.js:4</code> negative discounts (e.g. <code>-10</code>) currently <i>increase</i> the price. Consider clamping the lower bound too.', g.resolved ? '<div class="gh-resolved">✓ Resolved in 2f9c0aa</div>' : '') : ''}
        ${g.pr === 'merged' ? '<div class="gh-merged">⇄ <b>you</b> merged commit <code>b71d0e3</code> into <code>main</code> · branch fix/discount-cap deleted · issue #42 closed</div>'
          : `${checks(g.checks)}<div class="gh-merge"><button class="gh-btn ${g.checks === 'passed' ? '' : 'off'}">Squash and merge</button> <span class="gh-meta">${g.checks === 'passed' ? 'This branch has no conflicts with the base branch' : 'Required checks must pass before merging'}</span></div>`}
      </div>`,
    },
    'https://github.com/you/shop-app/issues/38': {
      title: 'Cart crashes when items is missing · Issue #38',
      render: (g) => `${repoHead('Issues')}<div class="gh-page">
        <h3>Cart crashes when items is missing <span class="gh-num">#38</span></h3>
        <div class="row" style="gap:8px;margin-bottom:10px">${pill(g.issue === 'done' ? 'open' : 'open')} <span class="gh-meta"><b>sam</b> opened this issue · label <span class="gh-label">bug</span></span></div>
        ${comment('sam', 'POST /cart/total with an empty body returns 500:<br><code>TypeError: Cannot read properties of undefined (reading \'reduce\')</code>')}
        ${g.issue ? comment('you', '<b>@claude</b> the cart crashes when items is missing. Please fix it and add a test.') : ''}
        ${g.issue === 'working' ? comment('claude[bot]', '<b>Claude is working…</b> <span class="gh-spin">✻</span><br>☑ Read the issue and the code<br>☐ Reproduce the crash<br>☐ Fix and add a test<br>☐ Open a pull request') : ''}
        ${g.issue === 'done' ? comment('claude[bot]', '<b>Claude finished</b> · took 1m 52s<br>☑ Read the issue and the code<br>☑ Reproduced: <code>cartTotal(undefined)</code> throws<br>☑ Fixed: <code>items = []</code> default + 400 for invalid bodies, with 2 tests<br>☑ Opened pull request <b>#46</b> "Fix cart crash when items is missing" (Fixes #38)<br><br>Please review before merging.') : ''}
      </div>`,
    },
    'https://github.com/you/shop-app/actions/runs/9182': {
      title: 'CI · Run #9182',
      render: (g) => `${repoHead('Actions')}<div class="gh-page">
        <h3>Add product search <span class="gh-num">Tests #9182</span></h3>
        ${g.ci === 'passed' ? '<div class="gh-checks ok">✓ Success · re-run after fix 8d1a44e</div>' : `<div class="gh-checks bad">✗ Failure · branch feature/search · 31s</div>
        <pre class="gh-log">▶ Run npm test
  ✔ sums items
  ✔ applies discount
  ✖ search returns products matching the query
    AssertionError: expected [] to deep equal [ { name: 'Red Mug' } ]
      at tests/search.test.js:9:10
  ℹ tests 5 · pass 4 · fail 1
Error: Process completed with exit code 1.</pre>`}
      </div>`,
    },
  };

  // ------------------------------------------------------------ missions
  C.MISSIONS.push(
    {
      id: 'github-flow', title: 'GitHub flow with Claude', level: 'Intermediate', mins: 9,
      sub: 'Branch → fix → commit → push → pull request → review → merge → pull, with Claude driving git and gh.',
      intro: 'The professional way to change code: never straight on `main`. Claude does the typing; **you review each step**. Watch the 🌐 Browser window for the pull request page.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Ask Claude to fix issue #42 the GitHub-flow way', type: 'create a branch, fix the discount over 100% bug from issue 42, add a test, then commit, push and open a pull request', keys: ['branch|pull request|\\bpr\\b', 'discount|fix|bug'],
          run: [
            ['bash', 'gh issue view 42', ['[B]Negative totals with big discount codes #42[/]', 'Open · sam opened 3 days ago · bug', 'A 150% discount makes the total negative.'], false],
            ['bash', 'git switch -c fix/discount-cap', ["Switched to a new branch 'fix/discount-cap'"], false],
            ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
            ['edit', '~/shop-app/src/cart.js', ['  function cartTotal(items, discountPct = 0) {', '+   if (discountPct > 100) discountPct = 100;', '    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);']],
            ['edit', '~/shop-app/tests/cart.test.js', ['+ ', "+ test('caps discounts at 100%', () => {", '+   assert.equal(cartTotal([{ price: 50, qty: 1 }], 150), 0);', '+ });']],
            ['bash', 'npm test', ['[g]ℹ tests 5 · pass 5 · fail 0[/]'], false],
            ['bash', 'git commit -am "fix: cap discounts at 0-100%"', ['[fix/discount-cap 8c2e1fa] fix: cap discounts at 0-100%', ' 2 files changed, 5 insertions(+)']],
            ['bash', 'git push -u origin fix/discount-cap', ['To github.com:you/shop-app.git', ' * [new branch]      fix/discount-cap -> fix/discount-cap']],
            ['bash', 'gh pr create --title "fix: cap discounts at 0-100%" --body "Fixes #42 …"', ['https://github.com/you/shop-app/pull/43']],
            ['ghpage', 'https://github.com/you/shop-app/pull/43', { pr: 'open', checks: 'pending' }],
            ['say', 'Opened **PR #43**. Its description says "Fixes #42", so the issue closes automatically when it merges. CI and the Claude review are running now.'],
          ],
          explain: 'That was the whole [[pull-request|GitHub flow]]: read the issue → **branch** → fix + test → **commit** → **push** → **PR**. Claude used `git` and the [[gh-cli]] through Bash. Safe commands (view, switch, test) ran without prompts here; pushing and opening the PR asked first, which is a good permission setup for teams.', terms: ['branch', 'commit', 'pull-request', 'gh-cli'] },
        { do: 'Check the PR\'s CI status yourself (bash mode)', type: '!gh pr checks 43', match: /^!\s*gh pr checks/,
          run: [['pause', 700], ['ghupdate', { checks: 'passed', review: true }], ['out', ['[g]✓[/] Tests / test (pull_request)   18s', '[g]✓[/] Claude PR review              41s', '[d]All checks were successful · 1 review comment[/]']]],
          explain: 'Both **status checks** passed: your test workflow and the automatic Claude review. With [[branch-protection]], these checks are required before merging. Look at the PR page: the reviewer left a suggestion.', terms: ['github-actions-ci', 'branch-protection'] },
        { do: 'Ask Claude to address the review comment', type: 'read the review comments on PR 43 and address them', keys: ['review|comment'],
          run: [
            ['bash', 'gh pr view 43 --comments', ['claude[bot]: cart.js:4 negative discounts (e.g. -10) currently increase the price. Consider clamping the lower bound too.'], false],
            ['edit', '~/shop-app/src/cart.js', ['-   if (discountPct > 100) discountPct = 100;', '+   discountPct = Math.min(100, Math.max(0, discountPct));']],
            ['bash', 'npm test', ['[g]ℹ tests 5 · pass 5 · fail 0[/]'], false],
            ['bash', 'git commit -am "fix: also reject negative discounts" && git push', ['[fix/discount-cap 2f9c0aa] fix: also reject negative discounts', 'To github.com:you/shop-app.git   8c2e1fa..2f9c0aa']],
            ['ghupdate', { resolved: true }],
            ['say', 'Pushed [y]2f9c0aa[/]: discounts are now clamped to 0–100 on both ends. The PR updated automatically and CI re-ran green.'],
          ],
          explain: 'Pushing more commits to the same branch **updates the PR**: no new PR needed. Claude read the review with `gh pr view --comments`. In a real team, a human reviewer would now approve.', terms: ['pull-request'] },
        { do: 'Merge it with a squash merge and delete the branch', type: '!gh pr merge 43 --squash --delete-branch', match: /^!\s*gh pr merge/,
          run: [['ghupdate', { pr: 'merged' }], ['out', ['[g]✓[/] Squashed and merged pull request #43 (fix: cap discounts at 0-100%)', '[g]✓[/] Deleted branch fix/discount-cap', '[d]Issue #42 was closed by the merge.[/]']]],
          explain: '**Squash and merge** turns the PR\'s commits into one tidy commit on `main`. The "Fixes #42" keyword closed the issue.', terms: ['pull-request', 'gh-issue'] },
        { do: 'Update your local main', type: '!git switch main && git pull', match: /^!\s*git (switch|checkout) main/,
          run: [['out', ["Switched to branch 'main'", 'Updating 4f2a9c1..b71d0e3', 'Fast-forward', ' src/cart.js        | 1 +', ' tests/cart.test.js | 4 ++++', ' 2 files changed, 5 insertions(+)']]],
          explain: 'The merge happened **on GitHub**, so your computer\'s `main` was behind until you **pulled**. Start the next task from an up-to-date main. 🎉 That\'s the professional loop.', terms: ['git'] },
      ],
    },
    {
      id: 'claude-action', title: '@claude on GitHub (GitHub Action)', level: 'Advanced', mins: 7,
      sub: 'Install the Claude GitHub App & workflow, then ask @claude to fix an issue right on GitHub.',
      intro: 'The **Claude Code GitHub Action** runs Claude inside GitHub. Mention **@claude** in an issue or PR and it investigates, fixes and opens a PR, even when your computer is off.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Run the guided installer', type: '/install-github-app', match: /^\/install-github-app$/,
          run: [
            ['out', ['[g]✔[/] GitHub CLI is signed in as [B]you[/]', 'Opening your browser to install the [B]Claude GitHub App[/] on you/shop-app…', '[g]✔[/] App installed (Contents, Issues, Pull requests: read & write)', '', 'Which workflows should be added?', '  [g][x][/] @claude: respond to mentions in issues and PRs   [d](.github/workflows/claude.yml)[/]', '  [g][x][/] Claude Code Review: review every new PR          [d](.github/workflows/claude-code-review.yml)[/]']],
            ['choice', 'Which credential should the workflows use?', ['API key (stored as ANTHROPIC_API_KEY secret)', 'Claude subscription token (from claude setup-token, stored as CLAUDE_CODE_OAUTH_TOKEN)']],
            ['write-silent', '~/shop-app/.github/workflows/claude.yml'],
            ['out', ['[g]✔[/] Saved the repository secret', '[g]✔[/] Pushed branch add-claude-github-actions', '[g]✔[/] Opened PR [B]#45 "Add Claude Code GitHub Workflow"[/]', '[d]Merge PR #45 to activate @claude. (Simulated: treated as merged.)[/]']],
          ],
          explain: '`/install-github-app` does the whole setup: installs the **Claude GitHub App**, saves a **secret** (an API key, or a subscription token from `claude setup-token`), and opens a PR adding the workflow files. You need **admin** rights on the repo and `gh auth login` done.', terms: ['github-actions', 'gh-cli'] },
        { do: 'Open Files → .github → workflows → claude.yml and read the explained lines', action: 'open:~/shop-app/.github/workflows/claude.yml', type: '(click 📁 Files → .github → workflows → claude.yml)',
          explain: 'With **no `prompt`**, the action runs in **interactive mode**: it waits for `@claude`. Notice the `permissions:` block: the job gets exactly what it needs, nothing more.', terms: ['github-actions', 'least-privilege'] },
        { do: 'Ask @claude for help on issue #38 (comments from the terminal work too!)', type: '!gh issue comment 38 --body "@claude the cart crashes when items is missing. Please fix it and add a test."', match: /^!\s*gh issue comment 38/,
          run: [
            ['out', ['https://github.com/you/shop-app/issues/38#issuecomment-2210']],
            ['ghpage', 'https://github.com/you/shop-app/issues/38', { issue: 'posted' }],
            ['pause', 900],
            ['out', ['[d]GitHub Actions: "Claude Code" workflow started (issue_comment by you)[/]']],
            ['ghupdate', { issue: 'working' }],
            ['pause', 2200],
            ['ghupdate', { issue: 'done' }],
            ['out', ['[g]✔[/] Workflow finished in 1m 52s · claude[bot] replied and opened PR #46']],
          ],
          explain: 'GitHub ran the workflow on its own servers: Claude read the issue and the code, made the fix on a new branch, and opened **PR #46**, replying in the thread with a checklist. Your laptop wasn\'t involved at all.', terms: ['github-actions', 'gh-issue'] },
        { do: 'Look at the PR Claude opened before merging anything', type: '!gh pr view 46', match: /^!\s*gh pr view 46/,
          run: [['out', ['[B]Fix cart crash when items is missing #46[/]', 'Open · claude[bot] wants to merge 1 commit into main from claude/issue-38-fix', '[g]✓[/] Checks passing · [y]Review required[/]', '', 'Fixes #38', '- Default `items` to [] in cartTotal', '- Return 400 for invalid request bodies', '- Tests: empty body, missing items']]],
          explain: 'Treat AI pull requests like any contributor\'s: read the diff, run it, check new dependencies and permissions. Branch protection makes sure it can\'t merge without checks and a review. Only people with **write access** can trigger @claude by default, which helps against [[prompt-injection]] from strangers\' comments.', terms: ['pull-request', 'prompt-injection', 'branch-protection'] },
      ],
    },
    {
      id: 'ci-fix', title: 'Fix a failing CI run', level: 'Intermediate', mins: 6,
      sub: 'Find the failing run with gh, let Claude diagnose the log, fix it and push.',
      intro: 'A red ❌ on GitHub. Let\'s find out why, fast, without clicking through the website.',
      start: { inClaude: false, cwd: '~/shop-app' },
      steps: [
        { do: 'List recent CI runs', type: 'gh run list', match: /^gh run list/,
          run: [['out', ['STATUS  TITLE               WORKFLOW  BRANCH          EVENT         ID', '[r]X[/]       Add product search  Tests     feature/search  pull_request  [y]9182[/]', '[g]✓[/]       Cap discounts       Tests     main            push          9179']], ['ghpage', 'https://github.com/you/shop-app/actions/runs/9182', { ci: 'failed' }]],
          explain: '`gh run list` shows the latest workflow runs: the ❌ is run **9182** on the `feature/search` branch. The browser shows the same run on GitHub.', terms: ['gh-cli', 'github-actions-ci'] },
        { do: 'Pipe only the failing logs to Claude for a diagnosis', type: 'gh run view 9182 --log-failed | claude -p "why did CI fail? suggest the smallest fix"', match: /^gh run view .*\|\s*claude\s+(-p|--print)/,
          run: [['pause', 800], ['out', ['The failing test is [y]tests/search.test.js:9[/]: [y]search("mug")[/] returns [] but expects "Red Mug".', 'Cause: [y]src/search.js[/] compares names case-sensitively ("mug" vs "Red Mug").', 'Smallest fix: compare [y]name.toLowerCase().includes(query.toLowerCase())[/].']]],
          explain: '`--log-failed` keeps only the failing steps\' output, so it\'s focused and cheap to send to [[headless|claude -p]]. Read the **first** error, not the last line.', terms: ['headless', 'gh-cli'] },
        { do: 'Start Claude Code', type: 'claude', match: /^claude$/,
          explain: 'Now let Claude make the fix interactively, so you can review the diff.', terms: ['claude-code'] },
        { do: 'Ask Claude to fix it and push', type: 'fix the failing search test from CI run 9182 and push the fix', keys: ['fix', 'search|ci|9182|test'],
          run: [
            ['bash', 'git switch feature/search', ["Switched to branch 'feature/search'"], false],
            ['tool', 'Read', 'src/search.js', 'Read 6 lines'],
            ['edit', '~/shop-app/src/search.js', ['  const search = (products, query) =>', '-   products.filter((p) => p.name.includes(query));', '+   products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));']],
            ['bash', 'npm test', ['[g]ℹ tests 5 · pass 5 · fail 0[/]'], false],
            ['bash', 'git commit -am "fix: case-insensitive product search" && git push', ['[feature/search 8d1a44e] fix: case-insensitive product search', 'To github.com:you/shop-app.git   41c9e2b..8d1a44e']],
            ['ghupdate', { ci: 'passed' }],
            ['say', 'Pushed [y]8d1a44e[/]. CI re-ran automatically on the PR and is green now.'],
          ],
          explain: 'Reproduce locally (`npm test`), fix, push: CI re-runs by itself. On cloud sessions, **Auto-fix** can do this loop for you when checks fail on a PR.', terms: ['github-actions-ci', 'tdd'] },
      ],
    },
  );
})(window.CCA);
