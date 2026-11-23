/* Simulator content: the fake project on the mock desktop, and the guided
   missions. Terminal markup: [o]orange[/] [d]dim[/] [g]green[/] [r]red[/]
   [b]blue[/] [y]yellow[/] [p]purple[/] [B]bold[/]  [[term|label]] = explainable. */
window.CCA = window.CCA || {};
(function (C) {
  const L = (...lines) => lines.join('\n');

  // ------------------------------------------------------------ base project
  C.SIM_FILES = {
    '~/shop-app/package.json': {
      content: L('{', '  "name": "shop-app",', '  "version": "1.4.0",', '  "scripts": {', '    "start": "node src/app.js",', '    "test": "node --test tests/",', '    "lint": "eslint src"', '  },', '  "dependencies": { "express": "^4.19.2" }', '}'),
      notes: { 4: 'The "scripts" section: `npm test` runs the line below it. Claude Code reads this to learn how to test your project.', 6: 'This is the exact command Claude will run when you ask it to "run the tests".' },
    },
    '~/shop-app/README.md': { content: L('# Shop App', '', 'A tiny online store API used for practice.', '', '- `npm start` runs the server on port 3000', '- `npm test` runs the test suite') },
    '~/shop-app/.gitignore': { content: L('node_modules/', '.env', '.claude/settings.local.json'), notes: { 2: '.env holds secrets and is never committed.', 3: 'Your personal Claude Code settings stay out of git. Team settings (.claude/settings.json) ARE committed.' } },
    '~/shop-app/.env': { content: L('STRIPE_SECRET_KEY=sk_test_DO_NOT_SHARE', 'DATABASE_URL=postgres://localhost/shop'), notes: { 1: 'Secrets! This is exactly the kind of file to protect with a deny rule or a PreToolUse hook.' } },
    '~/shop-app/src/app.js': {
      content: L("const express = require('express');", "const { cartTotal } = require('./cart');", "const { isValidEmail } = require('./auth/validate');", '', 'const app = express();', 'app.use(express.json());', '', "app.post('/signup', (req, res) => {", '  if (!isValidEmail(req.body.email)) {', "    return res.status(400).json({ error: 'invalid email' });", '  }', '  res.json({ ok: true });', '});', '', "app.post('/cart/total', (req, res) => {", '  res.json({ total: cartTotal(req.body.items, req.body.discount) });', '});', '', 'app.listen(3000);'),
      notes: { 8: 'The signup route. It rejects emails that isValidEmail() says are bad. This is where users see "invalid email".', 15: 'The cart total route calls cartTotal() from src/cart.js.' },
    },
    '~/shop-app/src/cart.js': {
      content: L('// Sum item prices and apply a percentage discount', 'function cartTotal(items, discountPct = 0) {', '  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);', '  const total = subtotal - subtotal * (discountPct / 100);', '  return Math.round(total * 100) / 100;', '}', '', 'module.exports = { cartTotal };'),
      notes: { 4: 'Potential bug: nothing stops a discount above 100%, which would make the total negative.', 5: 'Rounds to 2 decimal places (cents).' },
    },
    '~/shop-app/src/auth/validate.js': {
      content: L('// Returns true when the email looks valid', 'function isValidEmail(email) {', '  return /^[a-z0-9._-]+@[a-z0-9.-]+\\.[a-z]{2,}$/i.test(email);', '}', '', 'module.exports = { isValidEmail };'),
      notes: { 3: 'THE BUG: the allowed characters before the @ are a-z, 0-9, dot, underscore and dash. A plus sign (+) is missing, so "ana+shop@mail.com" is rejected.' },
    },
    '~/shop-app/tests/cart.test.js': { content: L("const test = require('node:test');", "const assert = require('node:assert');", "const { cartTotal } = require('../src/cart');", '', "test('sums items', () => {", '  assert.equal(cartTotal([{ price: 10, qty: 2 }]), 20);', '});', '', "test('applies discount', () => {", '  assert.equal(cartTotal([{ price: 50, qty: 1 }], 10), 45);', '});') },
    '~/shop-app/tests/validate.test.js': { content: L("const test = require('node:test');", "const assert = require('node:assert');", "const { isValidEmail } = require('../src/auth/validate');", '', "test('accepts a normal email', () => {", "  assert.ok(isValidEmail('ana@mail.com'));", '});', '', "test('rejects missing @', () => {", "  assert.ok(!isValidEmail('ana.mail.com'));", '});') },
    '~/shop-app/error.log': { content: L('2026-11-21T09:14:02Z ERROR TypeError: Cannot read properties of undefined (reading \'reduce\')', '    at cartTotal (src/cart.js:3:29)', '    at /src/app.js:16:22', '2026-11-21T09:14:02Z POST /cart/total 500') },
    '~/.claude/CLAUDE.md': {
      content: L('# My personal preferences (all projects)', '- Explain changes in plain English, I am learning', '- Prefer small commits', '- Use British spelling in docs'),
      notes: { 1: 'USER memory: ~/.claude/CLAUDE.md applies to every project on this computer, but only for YOU. Teammates never see it.' },
    },
    '~/.claude/settings.json': { content: L('{', '  "model": "opus",', '  "permissions": {', '    "allow": ["Bash(git status)"]', '  }', '}'), notes: { 1: 'USER settings: lowest precedence. Project and local settings override these.' } },
  };

  // Files that missions create (so the editor can explain them)
  C.SIM_CREATED = {
    '~/shop-app/CLAUDE.md': {
      content: L('# Shop App', '', '## Commands', '- `npm start`: run the API on :3000', '- `npm test`: run all tests (node:test)', '- `npm run lint`: ESLint on src/', '', '## Architecture', '- src/app.js: Express routes', '- src/cart.js: pricing & discounts', '- src/auth/: input validation', '', '## Conventions', '- CommonJS modules (require), 2-space indent', '- Every bug fix gets a regression test in tests/', '', '## Gotchas', '- Never read or print .env (contains secrets)'),
      notes: { 1: 'PROJECT memory: lives in the repo and is committed, so every teammate\'s Claude reads it at the start of each session.', 3: 'Commands section: the most valuable part. Claude now knows exactly how to build, test and lint.', 8: 'A short architecture map saves Claude from re-exploring the codebase every session.', 13: 'Conventions that differ from defaults. Keep them short and specific.', 17: 'Gotchas: hard-won lessons. Note: this is GUIDANCE. To truly block .env, use a deny rule or hook.' },
    },
    '~/shop-app/.claude/settings.json': {
      content: L('{', '  "permissions": {', '    "allow": [', '      "Bash(npm test)",', '      "Bash(npm run lint)",', '      "Bash(git diff:*)"', '    ],', '    "deny": [', '      "Read(./.env)"', '    ]', '  }', '}'),
      notes: { 1: 'PROJECT settings (.claude/settings.json) are committed and shared with the team.', 4: 'Allow rule: Claude can run `npm test` without asking each time.', 6: '`:*` is a prefix wildcard: any `git diff …` command is allowed.', 9: 'Deny rule: enforced by Claude Code itself. Deny always beats allow.' },
    },
    '~/shop-app/.claude/commands/review.md': {
      content: L('---', 'description: Review a file for bugs, security and missing tests', 'argument-hint: <file or folder>', 'allowed-tools: Read, Grep, Glob', '---', 'Review $ARGUMENTS.', '', 'Report ONLY:', '- bugs and incorrect logic', '- security problems', '- missing tests for important behaviour', '', 'For each finding: file:line, severity (high/med/low), suggested fix.', 'Skip style and naming comments.'),
      notes: { 1: 'YAML frontmatter between the --- lines configures the command.', 2: 'description: shown in the /help list and autocomplete.', 4: 'allowed-tools: while this command runs Claude may only read and search, not edit.', 6: '$ARGUMENTS is replaced by what you type after /review.', 8: 'Explicit criteria ("report ONLY…") reduce noisy, low-value findings, a core exam idea.' },
    },
    '~/shop-app/.claude/skills/release-notes/SKILL.md': {
      content: L('---', 'name: release-notes', 'description: Write user-facing release notes from recent commits. Use when the user asks for release notes, a changelog, or "what shipped".', '---', '# Release notes', '', '1. Run `git log --oneline -20`', '2. Group into: New, Improved, Fixed', '3. Write for customers: no file names, no jargon', '4. Save to RELEASE_NOTES.md'),
      notes: { 2: 'name: also lets you run it directly as /release-notes.', 3: 'description: the ONLY part always in context. Claude reads it to decide when the skill is relevant, so say WHEN to use it.', 5: 'The body loads only when the skill is used (progressive disclosure).' },
    },
    '~/shop-app/.claude/agents/test-runner.md': {
      content: L('---', 'name: test-runner', 'description: Runs tests and diagnoses failures. Use proactively after code changes.', 'tools: Read, Grep, Glob, Bash', 'model: haiku', '---', 'You are a test specialist.', '1. Run `npm test`', '2. For each failure, find the root cause', '3. Report: failing test, cause, suggested minimal fix', 'Do NOT edit files; report back only.'),
      notes: { 2: 'name: how the main agent refers to this subagent.', 3: 'description: tells the main agent WHEN to delegate. "Use proactively" encourages automatic use.', 4: 'tools: least privilege. No Edit/Write, so this agent cannot change code.', 5: 'model: a cheaper, faster model is fine for running tests.', 7: 'The body is the subagent\'s system prompt. It starts with a FRESH context; it does not see your conversation.' },
    },
    '~/shop-app/.mcp.json': {
      content: L('{', '  "mcpServers": {', '    "github": {', '      "type": "http",', '      "url": "https://api.githubcopilot.com/mcp/",', '      "headers": {', '        "Authorization": "Bearer ${GITHUB_TOKEN}"', '      }', '    }', '  }', '}'),
      notes: { 1: '.mcp.json = PROJECT-scoped MCP config, committed so the whole team gets the same servers.', 4: 'type "http": a remote server. Local servers use "stdio" with a command to launch.', 7: '${GITHUB_TOKEN} is expanded from each developer\'s environment, so no secret ever lands in git.' },
    },
    '~/shop-app/.claude/hooks/protect-env.py': {
      content: L('import json, sys', '', 'call = json.load(sys.stdin)            # the tool call Claude wants to make', 'path = call.get("tool_input", {}).get("file_path", "")', '', 'if path.endswith(".env"):', '    print("Blocked: .env contains secrets. Use .env.example.", file=sys.stderr)', '    sys.exit(2)                         # 2 = block the tool call', '', 'sys.exit(0)                             # 0 = allow'),
      notes: { 3: 'Hooks receive the pending tool call as JSON on standard input.', 6: 'Your own logic: any rule you can code, you can enforce.', 8: 'Exit code 2 BLOCKS the call, and the stderr message goes back to Claude so it can adjust.', 10: 'Exit code 0 lets the call proceed.' },
    },
    '~/shop-app/.github/workflows/claude.yml': {
      content: L('name: Claude PR review', 'on: [pull_request]', 'jobs:', '  review:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: anthropics/claude-code-action@v1', '        with:', '          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}', '          prompt: |', '            Review this PR. Report only bugs, security issues', '            and missing tests. Skip style.'),
      notes: { 2: 'Runs on every pull request.', 8: 'The official Claude Code GitHub Action.', 10: 'The API key comes from repository secrets, never hard-coded.', 12: 'Explicit criteria keep CI reviews focused and less noisy.' },
    },
  };

  // ---------------------------------------------------------------- missions
  const fixedValidate = L('// Returns true when the email looks valid', 'function isValidEmail(email) {', '  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$/i.test(email);', '}', '', 'module.exports = { isValidEmail };');
  const settingsWithHooks = L('{', '  "permissions": {', '    "allow": ["Bash(npm test)", "Bash(npm run lint)", "Bash(git diff:*)"],', '    "deny": ["Read(./.env)"]', '  },', '  "hooks": {', '    "PostToolUse": [', '      { "matcher": "Edit|Write",', '        "hooks": [{ "type": "command", "command": "npx prettier --write ." }] }', '    ],', '    "PreToolUse": [', '      { "matcher": "Read|Edit|Write",', '        "hooks": [{ "type": "command", "command": "python3 .claude/hooks/protect-env.py" }] }', '    ]', '  }', '}');

  C.MISSIONS = [
    {
      id: 'first-run', title: 'Your first session', level: 'Beginner', mins: 5,
      sub: 'Open a terminal, start Claude Code, ask about the project.',
      intro: 'Welcome to the simulator! This is a pretend computer. The **Terminal** window is where you\'ll type. Nothing here can break, so experiment freely.',
      start: { inClaude: false, cwd: '~' },
      steps: [
        { do: 'Move into the project folder', type: 'cd shop-app', match: /^cd\s+(\.\/)?shop-app\/?$/,
          explain: '[[cd]] changed the terminal\'s current folder to **shop-app**. Claude Code always works on the folder you start it in, so this step matters.', terms: ['cd', 'terminal'] },
        { do: 'List the files to see what\'s inside', type: 'ls', match: /^(ls|dir)(\s+-\w+)?$/,
          explain: 'You can see the project: `src/` (code), `tests/`, `package.json` (project settings), and more. Notice there\'s **no CLAUDE.md** yet; you\'ll create one in the next mission.', terms: ['repo'] },
        { do: 'Start Claude Code', type: 'claude', match: /^claude$/,
          explain: 'Claude Code started! First it asked whether you **trust this folder** ([[trust-dialog]]). Then you got the welcome box and an input prompt (`>`). The line under the box shows tips and the current mode.', terms: ['claude-code', 'trust-dialog'] },
        { do: 'Ask Claude for an overview of the project', type: 'give me an overview of this project', keys: ['overview|explain|what does|summar|describe'],
          run: [
            ['think', 900],
            ['tool', 'Glob', '**/*', 'Found 9 files'],
            ['tool', 'Read', 'package.json', 'Read 10 lines'],
            ['tool', 'Read', 'src/app.js', 'Read 19 lines'],
            ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
            ['say', 'This is a small **Express** API for an online shop:\n\n• [B]src/app.js[/]: two routes: [b]POST /signup[/] (validates email) and [b]POST /cart/total[/]\n• [B]src/cart.js[/]: adds up item prices and applies a % discount\n• [B]src/auth/validate.js[/]: email validation with a regex\n• [B]tests/[/]: node:test tests, run with [y]npm test[/]\n\nOne thing I noticed: [y]cartTotal[/] doesn\'t guard against discounts over 100%.'],
          ],
          explain: 'Watch what Claude did **before** answering: it used [[tool|tools]]. **Glob** found files by pattern, **Read** opened them. It decided which files to read on its own: that\'s the [[agentic-loop]]. You never pasted any code.', terms: ['tool', 'agentic-loop', 'context-window'] },
        { do: 'See all available commands', type: '/help', match: /^\/help$/,
          explain: 'Commands starting with `/` are [[slash-command|slash commands]]: they control Claude Code itself rather than talking to Claude. Type `/` at any time to see an autocomplete list.', terms: ['slash-command'] },
        { do: 'Check how many tokens this session used', type: '/cost', match: /^\/(cost|usage)$/,
          explain: '`/cost` shows tokens and spend for the session. Every file Claude reads adds to the [[context-window]], which is why focused requests are cheaper.', terms: ['token', 'context-window'] },
      ],
    },
    {
      id: 'memory', title: 'Memory with CLAUDE.md', level: 'Beginner', mins: 6,
      sub: 'Generate CLAUDE.md with /init, inspect it, understand the memory hierarchy.',
      intro: 'Claude forgets everything between sessions, except what\'s in **memory files** called CLAUDE.md. Let\'s create one.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Ask Claude to generate a CLAUDE.md for this project', type: '/init', match: /^\/init$/,
          run: [
            ['think', 700],
            ['tool', 'Glob', '**/*', 'Found 9 files'],
            ['tool', 'Read', 'package.json', 'Read 10 lines'],
            ['tool', 'Read', 'README.md', 'Read 6 lines'],
            ['tool', 'Read', 'src/app.js', 'Read 19 lines'],
            ['tool', 'Grep', '"require\\(" in src/', '3 matches'],
            ['write', '~/shop-app/CLAUDE.md'],
            ['say', 'Created [B]CLAUDE.md[/] with your build/test commands, an architecture map, conventions, and a gotcha about [y].env[/]. It will load automatically at the start of every session.'],
          ],
          explain: '`/init` explored the project and drafted a [[claude-md]]. You approved creating the file. From now on **every** session in this folder starts by reading it.', terms: ['claude-md', 'memory-hierarchy'] },
        { do: 'Open the Files app on the desktop and click CLAUDE.md to read it with explanations', action: 'open:~/shop-app/CLAUDE.md', type: '(click 📁 Files → CLAUDE.md)',
          explain: 'Lines with an orange dot have explanations. Hover them. Notice the four sections: **Commands, Architecture, Conventions, Gotchas**. That\'s the recipe for a great CLAUDE.md: short, specific, things Claude can\'t guess.', terms: ['claude-md'] },
        { do: 'See which memory files are loaded', type: '/memory', match: /^\/memory$/,
          explain: 'Two memory files are loaded: **user memory** (`~/.claude/CLAUDE.md`, just you, every project) and **project memory** (`./CLAUDE.md`, shared with the team via git). This is the [[memory-hierarchy]]. **Exam trap:** team rules accidentally living in someone\'s *user* file.', terms: ['memory-hierarchy', 'rules', 'import'] },
        { do: 'Teach Claude a new rule by asking it to update CLAUDE.md', type: 'add to CLAUDE.md that discounts must be between 0 and 100', keys: ['claude.md|claude md|memory', 'discount|rule'],
          run: [
            ['tool', 'Read', 'CLAUDE.md', 'Read 17 lines'],
            ['edit', '~/shop-app/CLAUDE.md', ['  ## Conventions', '  - CommonJS modules (require), 2-space indent', '  - Every bug fix gets a regression test in tests/', '+ - Discounts are percentages and must be between 0 and 100']],
            ['say', 'Added the discount rule to the Conventions section of CLAUDE.md.'],
          ],
          explain: 'When Claude repeats a mistake, add **one crisp line** to CLAUDE.md. For conventions that only apply to certain files (e.g., all `*.test.js`), use [[rules]] with a `paths:` glob instead of growing CLAUDE.md forever.', terms: ['rules', 'claude-md'] },
      ],
    },
    {
      id: 'fix-bug', title: 'Fix a bug, test, commit', level: 'Beginner', mins: 7,
      sub: 'Use an @-mention, review a diff, approve permissions, run tests, commit.',
      intro: 'Customers report that emails like **ana+shop@mail.com** are rejected at signup. Let\'s have Claude fix it the right way.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Describe the bug, point Claude at the file with @, and ask for a test', type: '@src/auth/validate.js emails with a + like ana+shop@mail.com are rejected. fix it and add a test', keys: ['@src/auth/validate.js|validate', 'fix'],
          run: [
            ['tool', 'Read', 'src/auth/validate.js', 'Read 6 lines'],
            ['tool', 'Read', 'tests/validate.test.js', 'Read 11 lines'],
            ['say', 'Found it: the character class before the [y]@[/] allows [y]a-z 0-9 . _ -[/] but not [y]+[/] or [y]%[/], which are valid in email addresses.'],
            ['edit', '~/shop-app/src/auth/validate.js', ['  // Returns true when the email looks valid', '  function isValidEmail(email) {', '-   return /^[a-z0-9._-]+@[a-z0-9.-]+\\.[a-z]{2,}$/i.test(email);', '+   return /^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$/i.test(email);', '  }'], fixedValidate],
            ['edit', '~/shop-app/tests/validate.test.js', ["  test('rejects missing @', () => {", "    assert.ok(!isValidEmail('ana.mail.com'));", '  });', '+ ', "+ test('accepts plus addressing', () => {", "+   assert.ok(isValidEmail('ana+shop@mail.com'));", '+ });']],
            ['bash', 'npm test', ['▶ tests/cart.test.js', '  ✔ sums items (0.4ms)', '  ✔ applies discount (0.1ms)', '▶ tests/validate.test.js', '  ✔ accepts a normal email (0.3ms)', '  ✔ rejects missing @ (0.1ms)', '  ✔ accepts plus addressing (0.1ms)', '[g]ℹ tests 5 · pass 5 · fail 0[/]']],
            ['say', 'Fixed: [y]+[/] and [y]%[/] are now allowed before the @, and a regression test covers [y]ana+shop@mail.com[/]. All 5 tests pass.'],
          ],
          explain: 'This is the ideal loop: a **specific** request + an [[mention|@-mention]] + "add a test". You saw red/green **diffs** and approved each change with a [[permission-mode|permission prompt]]. Claude **verified** its own work by running the tests.', terms: ['mention', 'permission-mode', 'tdd'] },
        { do: 'Run a shell command yourself with ! to see the diff', type: '!git diff --stat', match: /^!\s*git diff/,
          explain: '[[bash-mode]]: starting with `!` runs a command directly, without a Claude turn, and the output joins the conversation so Claude can see it too.', terms: ['bash-mode', 'git'] },
        { do: 'Ask Claude to commit the change', type: 'commit this with a good message', keys: ['commit'],
          run: [
            ['bash', 'git add src/auth/validate.js tests/validate.test.js', []],
            ['bash', 'git commit -m "Allow + and % in email local part\n\nPlus addressing (ana+shop@mail.com) was rejected at signup.\nAdds a regression test."', ['[main 4f2a9c1] Allow + and % in email local part', ' 2 files changed, 5 insertions(+), 1 deletion(-)']],
            ['say', 'Committed as [y]4f2a9c1[/].'],
          ],
          explain: 'Claude writes descriptive commit messages from the actual diff. Committing after each working change gives you a real [[git]] safety net, beyond [[checkpoint|checkpoints]].', terms: ['git', 'checkpoint'] },
        { do: 'Open the rewind menu to see your checkpoints', type: '/rewind', match: /^\/rewind$/,
          explain: '[[checkpoint|Checkpoints]] let you restore code and/or conversation to any earlier prompt. Shortcut: press <kbd>Esc</kbd> twice. Remember: side effects of shell commands (like a database migration) aren\'t rewound.', terms: ['checkpoint', 'escape'] },
      ],
    },
    {
      id: 'plan-mode', title: 'Plan before you build', level: 'Intermediate', mins: 6,
      sub: 'Cycle modes with Shift+Tab, get a plan, approve it.',
      intro: 'For bigger changes, the pros use **plan mode**: Claude researches read-only and proposes a plan before touching anything.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Press Shift+Tab (in the terminal) to switch modes. Watch the status line', key: 'shift+tab', expectMode: 'accept', type: 'Shift+Tab',
          explain: 'You\'re now in **accept edits** mode: file edits will be applied without asking (commands still ask). The colored status line under the input box always shows the mode.', terms: ['shift-tab', 'permission-mode'] },
        { do: 'Press Shift+Tab again to reach plan mode', key: 'shift+tab', expectMode: 'plan', type: 'Shift+Tab',
          explain: '**Plan mode**: Claude can read and search but cannot edit files or run commands that change things. Perfect for designing before building.', terms: ['plan-mode'] },
        { do: 'Ask for a bigger feature', type: 'add discount codes to the cart: codes are stored server side and validated', keys: ['discount|coupon|code'],
          run: [
            ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
            ['tool', 'Read', 'src/app.js', 'Read 19 lines'],
            ['tool', 'Grep', '"discount" in **/*.js', '4 matches in 3 files'],
            ['plan', ['[B]Plan: discount codes[/]', '1. Add [y]src/discounts.js[/] with a codes table { code → percent, expiresAt }', '2. Validate: unknown/expired code → 400; clamp percent to 0–100', '3. Change [y]POST /cart/total[/] to accept [y]code[/] instead of a raw [y]discount[/]', '4. Update cartTotal to reject discounts outside 0–100', '5. Tests: valid code, expired code, unknown code, >100% guard', '6. Run [y]npm test[/] and [y]npm run lint[/]']],
          ],
          explain: 'Claude researched **without changing anything** and produced a plan you can review. You could push back ("store codes in the DB instead") before any code exists. This is [[explore-plan-code]].', terms: ['plan-mode', 'explore-plan-code'] },
        { do: 'Approve the plan but keep reviewing each edit: type 2', type: '2', match: /^2$/,
          run: [
            ['setmode', 'default'],
            ['todo', ['Create src/discounts.js', 'Validate codes in /cart/total', 'Clamp discount to 0–100', 'Add tests', 'Run tests & lint']],
            ['write', '~/shop-app/src/discounts.js', L("const CODES = { WELCOME10: { pct: 10, expires: '2027-01-01' } };", '', 'function lookupCode(code, now = new Date()) {', '  const c = CODES[String(code).toUpperCase()];', '  if (!c || new Date(c.expires) < now) return null;', '  return c.pct;', '}', '', 'module.exports = { lookupCode };')],
            ['say', 'Created the discount module. (In a real session Claude would continue through the todo list, asking before each edit.)'],
          ],
          explain: 'Option 1 would switch to auto-accept edits; option 2 returns to default mode so you approve each change. Claude also made a **todo list**: on big tasks it tracks progress so nothing is forgotten.', terms: ['permission-mode', 'checkpoint'] },
        { do: 'Interrupt! Press Esc in the terminal (useful whenever Claude heads the wrong way)', key: 'escape', type: 'Esc',
          explain: '<kbd>Esc</kbd> stops Claude immediately but keeps the context, so you can redirect: "stop: keep codes in a JSON file instead". Interrupting early saves time and tokens.', terms: ['escape'] },
      ],
    },
    {
      id: 'permissions', title: 'Permissions & settings', level: 'Intermediate', mins: 6,
      sub: 'Allow/deny rules, settings files and their precedence.',
      intro: 'Approving `npm test` 30 times a day gets old. Let\'s configure **permission rules**, and protect secrets at the same time.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Open the permissions manager', type: '/permissions', match: /^\/(permissions|allowed-tools)$/,
          explain: '`/permissions` lists **allow**, **ask** and **deny** rules from all settings files. Rules look like `Tool` or `Tool(specifier)`, e.g. `Bash(npm test)` or `Read(./.env)`.', terms: ['permission-rules'] },
        { do: 'Ask Claude to set up team permission rules', type: 'create project settings that allow npm test, lint and git diff, and deny reading .env', keys: ['allow|permission|settings', 'env|deny|test'],
          run: [
            ['tool', 'Read', '.gitignore', 'Read 3 lines'],
            ['write', '~/shop-app/.claude/settings.json'],
            ['say', 'Created [B].claude/settings.json[/] (commit it so the whole team shares it). [y]npm test[/], lint and [y]git diff[/] no longer need approval, and reading [y].env[/] is denied.'],
          ],
          explain: 'This is **project** settings ([[settings]]): committed and shared. Your personal overrides go in `.claude/settings.local.json` (git-ignored). Deny rules are **enforced by Claude Code**, unlike a "please don\'t" in CLAUDE.md.', terms: ['settings', 'permission-rules', 'dot-claude'] },
        { do: 'Open Files → .claude → settings.json to read the explained file', action: 'open:~/shop-app/.claude/settings.json', type: '(click 📁 Files → .claude → settings.json)',
          explain: '**Precedence, highest first:** managed policy → command-line flags → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`. Deny always beats allow.', terms: ['settings'] },
        { do: 'Test it: ask Claude to show you the .env file', type: 'show me the .env file', keys: ['env'],
          run: [
            ['blocked', 'Read(.env)', 'Permission to read .env has been denied by your settings (deny rule: Read(./.env)).'],
            ['say', 'I can\'t read [y].env[/]: it\'s blocked by a deny rule in [y].claude/settings.json[/]. If you need the variable names, I can create a [y].env.example[/] template instead.'],
          ],
          explain: 'The rule held. This is the difference between **guidance** (CLAUDE.md) and **enforcement** (settings rules & hooks). A theme you\'ll see again and again on the exam.', terms: ['permission-rules', 'least-privilege', 'prompt-injection'] },
      ],
    },
    {
      id: 'commands', title: 'Custom commands & skills', level: 'Intermediate', mins: 8,
      sub: 'Create a /review command, then a skill Claude uses automatically.',
      intro: 'Turn prompts you repeat into **custom slash commands**, and package know-how as **skills**.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Ask Claude to create a reusable /review command for the team', type: 'create a project slash command /review that reviews a file for bugs, security and missing tests', keys: ['command|slash', 'review'],
          run: [
            ['write', '~/shop-app/.claude/commands/review.md'],
            ['say', 'Created [B].claude/commands/review.md[/]. Anyone who clones the repo can now run [y]/review <file>[/].'],
          ],
          explain: 'A [[custom-command]] is just a Markdown prompt in `.claude/commands/`. **Project** scope = committed & shared; `~/.claude/commands/` = only you.', terms: ['custom-command', 'arguments'] },
        { do: 'Open Files → .claude → commands → review.md to see how it works', action: 'open:~/shop-app/.claude/commands/review.md', type: '(click 📁 Files → .claude → commands → review.md)',
          explain: 'Frontmatter sets the description, an argument hint and `allowed-tools`. `$ARGUMENTS` becomes whatever you type after the command name.', terms: ['arguments', 'custom-command'] },
        { do: 'Run your new command on the cart module', type: '/review src/cart.js', match: /^\/review\s+\S+/,
          run: [
            ['out', ['[d]  ⎿ Running /review with arguments: src/cart.js[/]']],
            ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
            ['tool', 'Grep', '"cartTotal" in tests/', '2 matches'],
            ['say', '[B]Review of src/cart.js[/]\n1. [r]high[/]  src/cart.js:4 discountPct > 100 makes totals negative. Clamp to 0–100 or reject.\n2. [y]med[/]   src/cart.js:3 items undefined crashes with "reading \'reduce\'" (seen in error.log). Default items = [].\n3. [y]med[/]   tests/cart.test.js no tests for >100% discount or empty cart.'],
          ],
          explain: 'Notice the output follows the format and the **explicit criteria** from the command file (no style nitpicks). That\'s [[explicit-criteria]] in action.', terms: ['explicit-criteria', 'custom-command'] },
        { do: 'Now create a skill that Claude can use on its own', type: 'create a skill for writing release notes from recent commits', keys: ['skill'],
          run: [
            ['write', '~/shop-app/.claude/skills/release-notes/SKILL.md'],
            ['say', 'Created the [B]release-notes[/] skill. I\'ll use it automatically when you ask for release notes, or you can run [y]/release-notes[/].'],
          ],
          explain: 'A [[skill]] is a folder with SKILL.md (+ optional scripts). Only the **description** is always loaded; the rest loads on demand: [[progressive-disclosure]].', terms: ['skill', 'progressive-disclosure'] },
        { do: 'Ask for release notes in plain words, without naming the skill', type: 'what shipped this week? write release notes', keys: ['release|shipped|changelog'],
          run: [
            ['out', ['[p]⏺ Skill(release-notes)[/]', '[d]  ⎿ Loaded skill instructions (SKILL.md)[/]']],
            ['bash', 'git log --oneline -20', ['4f2a9c1 Allow + and % in email local part', 'a81b0de Add cart total endpoint', '19c3f77 Initial commit'], false],
            ['write', '~/shop-app/RELEASE_NOTES.md', L('# Release notes', '', '## New', '- See your cart total instantly at checkout', '', '## Fixed', '- Email addresses with a "+" (like ana+shop@mail.com) can now sign up')],
            ['say', 'Wrote [B]RELEASE_NOTES.md[/] in customer-friendly language.'],
          ],
          explain: 'Claude matched your request to the skill\'s **description** and loaded it automatically. That\'s why skill descriptions should say *when* to use them.', terms: ['skill', 'progressive-disclosure'] },
      ],
    },
    {
      id: 'subagents', title: 'Delegating to subagents', level: 'Advanced', mins: 7,
      sub: 'Create a test-runner subagent and watch context isolation in action.',
      intro: '**Subagents** are helper Claudes with their own clean context and limited tools. They\'re central to Domain 1 of the exam.',
      start: { inClaude: true, cwd: '~/shop-app' },
      steps: [
        { do: 'Open the subagent manager', type: '/agents', match: /^\/agents$/,
          explain: '`/agents` lists built-in subagents (like **Explore**, a fast read-only searcher, and **Plan**) plus your custom ones, and helps create new ones.', terms: ['subagent'] },
        { do: 'Ask Claude to create a test-runner subagent', type: 'create a test-runner subagent that runs tests and reports failures without editing files', keys: ['subagent|agent', 'test'],
          run: [
            ['write', '~/shop-app/.claude/agents/test-runner.md'],
            ['say', 'Created [B].claude/agents/test-runner.md[/]: read-only tools + Bash, Haiku model, reports only.'],
          ],
          explain: 'Frontmatter: `name`, `description` (when to delegate), `tools` (least privilege: no Edit!), `model`. Open it in Files to see each line explained.', terms: ['subagent', 'least-privilege'] },
        { do: 'Delegate: ask Claude to use the subagent', type: 'use the test-runner subagent to check the cart module', keys: ['test-runner|subagent|agent'],
          run: [
            ['agent', 'test-runner', 'Run the test suite. Focus on src/cart.js: known issue: discounts >100% and undefined items (see error.log). Report failures with root causes. Do not edit files.', [
              ['tool', 'Bash', 'npm test', 'pass 5 · fail 0'],
              ['tool', 'Read', 'src/cart.js', 'Read 8 lines'],
              ['tool', 'Read', 'error.log', 'Read 4 lines'],
            ], 'All 5 tests pass, but coverage gaps: no test for discount >100% (returns negative total) or missing items (TypeError in error.log, cart.js:3).'],
            ['say', 'The test-runner found two untested edge cases in [y]cart.js[/]. Want me to add tests and guards for both?'],
          ],
          explain: 'Look at the **task prompt** Claude wrote for the subagent: it passed the known issue and error.log hint explicitly, because the subagent **can\'t see this conversation** ([[context-isolation]]). Only the short summary came back, keeping the main context clean.', terms: ['context-isolation', 'hub-and-spoke', 'subagent'] },
      ],
    },
    {
      id: 'hooks', title: 'Hooks: hard guardrails', level: 'Advanced', mins: 7,
      sub: 'Auto-format with PostToolUse, block secrets with a PreToolUse hook.',
      intro: 'Prompts are suggestions. **Hooks** are code that runs every single time. The exam LOVES this distinction.',
      start: { inClaude: true, cwd: '~/shop-app', files: ['~/shop-app/.claude/settings.json'] },
      steps: [
        { do: 'Open the hooks manager', type: '/hooks', match: /^\/hooks$/,
          explain: '`/hooks` shows the lifecycle events: **PreToolUse**, **PostToolUse**, **UserPromptSubmit**, **Stop**, **SubagentStop**, **SessionStart**, **SessionEnd**, **PreCompact**, **Notification**.', terms: ['hook'] },
        { do: 'Ask Claude to add a formatter hook and a hook that protects .env', type: 'add a hook to run prettier after every edit, and a hook that blocks any access to .env', keys: ['hook'],
          run: [
            ['write', '~/shop-app/.claude/hooks/protect-env.py'],
            ['edit', '~/shop-app/.claude/settings.json', ['  "permissions": { … },', '+ "hooks": {', '+   "PostToolUse": [{ "matcher": "Edit|Write",', '+     "hooks": [{ "type": "command", "command": "npx prettier --write ." }] }],', '+   "PreToolUse": [{ "matcher": "Read|Edit|Write",', '+     "hooks": [{ "type": "command", "command": "python3 .claude/hooks/protect-env.py" }] }]', '+ }'], settingsWithHooks],
            ['say', 'Hooks configured. Prettier now runs after every edit, and any Read/Edit/Write touching [y].env[/] is blocked by [y]protect-env.py[/].'],
          ],
          explain: 'A `matcher` (here `Edit|Write`) selects which tools trigger the hook. Open **.claude/hooks/protect-env.py** in Files to see how **exit code 2** blocks a call ([[exit-code-2]]).', terms: ['hook', 'exit-code-2'] },
        { do: 'Make a small edit and watch the PostToolUse hook fire', type: 'add a comment at the top of cart.js explaining discountPct', keys: ['comment|cart'],
          run: [
            ['edit', '~/shop-app/src/cart.js', ['- // Sum item prices and apply a percentage discount', '+ // Sum item prices and apply a percentage discount.', '+ // discountPct: 0–100 (percent off the subtotal)']],
            ['hook', 'PostToolUse:Edit', 'npx prettier --write .', 'src/cart.js 12ms (formatted)'],
            ['say', 'Added the comment; the formatter hook ran automatically.'],
          ],
          explain: 'Claude didn\'t decide to format: the **hook** did, deterministically, after the Edit tool. Same for linting, logging, normalizing tool outputs, notifications…', terms: ['hook'] },
        { do: 'Try to get Claude to edit the .env file', type: 'change the DATABASE_URL in .env to point at production', keys: ['env'],
          run: [
            ['tool', 'Edit', '.env', ''],
            ['blocked', 'PreToolUse hook', 'Blocked: .env contains secrets. Use .env.example. (protect-env.py exited with code 2)'],
            ['say', 'A project hook blocks edits to [y].env[/]. I can update [y].env.example[/] and you can change the real value yourself.'],
          ],
          explain: 'The PreToolUse hook exited with **2**, so Claude Code stopped the call and showed Claude the reason. No prompt wording could talk its way past this. **Exam rule:** "must always/never" → hooks or code.', terms: ['exit-code-2', 'hook', 'prompt-injection'] },
      ],
    },
    {
      id: 'mcp', title: 'Connect tools with MCP', level: 'Advanced', mins: 7,
      sub: 'Add a GitHub MCP server, check it, and use its tools.',
      intro: '**MCP** plugs external systems into Claude Code. Let\'s connect GitHub so Claude can read issues.',
      start: { inClaude: false, cwd: '~/shop-app' },
      steps: [
        { do: 'Add the GitHub MCP server for the whole team (project scope)', type: 'claude mcp add --transport http --scope project github https://api.githubcopilot.com/mcp/', match: /^claude mcp add .*github/,
          run: [
            ['write-silent', '~/shop-app/.mcp.json'],
            ['out', ['Added HTTP MCP server [B]github[/] with URL: https://api.githubcopilot.com/mcp/ to [y]project[/] config', 'File modified: [b]~/shop-app/.mcp.json[/]']],
          ],
          explain: '`--transport http` = a remote server. `--scope project` wrote **.mcp.json** in the repo, so the team gets it via git ([[mcp-scope]]). Open `.mcp.json` in Files to see the `${GITHUB_TOKEN}` trick that keeps secrets out of git.', terms: ['mcp', 'mcp-scope'] },
        { do: 'List configured servers', type: 'claude mcp list', match: /^claude mcp list$/,
          explain: '`claude mcp list` shows each server and whether it connects. `claude mcp remove <name>` deletes one.', terms: ['mcp'] },
        { do: 'Start Claude Code', type: 'claude', match: /^claude$/,
          explain: 'Because `.mcp.json` is a **project** server, Claude Code asks you to approve it the first time. A safety step, since project files come from the repo.', terms: ['mcp-scope', 'trust-dialog'] },
        { do: 'Check MCP status inside Claude Code', type: '/mcp', match: /^\/mcp$/,
          explain: '`/mcp` shows connection status, lets you authenticate (OAuth) with remote servers, and lists each server\'s tools.', terms: ['mcp'] },
        { do: 'Use it: ask about open bug issues', type: 'what open issues are labeled bug?', keys: ['issue'],
          run: [
            ['mcpcall', 'mcp__github__list_issues', 'owner: "acme", repo: "shop-app", state: "open", labels: ["bug"]', ['#42 Negative totals with big discount codes', '#38 500 error when cart is empty']],
            ['say', 'Two open bugs:\n• [B]#42[/] Negative totals with big discount codes → matches the missing 0–100 clamp in [y]src/cart.js:4[/]\n• [B]#38[/] 500 error when cart is empty → the [y]reduce[/] crash in error.log\nWant me to fix both and link the PR to the issues?'],
          ],
          explain: 'MCP tools appear as `mcp__<server>__<tool>`. Claude chose it from the tool\'s **description**, which is why tool descriptions are an exam topic ([[tool-description]]).', terms: ['mcp', 'tool-description', 'tool'] },
      ],
    },
    {
      id: 'context', title: 'Managing context', level: 'Advanced', mins: 5,
      sub: '/context, /compact with focus, /clear, and resuming sessions.',
      intro: 'Long sessions fill the **context window**. Learn to see it and manage it.',
      start: { inClaude: true, cwd: '~/shop-app', busy: true },
      steps: [
        { do: 'See what\'s using your context', type: '/context', match: /^\/context$/,
          explain: 'The bar shows system prompt, tools, MCP tools, memory files and messages. Here, messages (old exploration) dominate. Time to tidy up.', terms: ['context-window', 'context-cmd'] },
        { do: 'Compact with focus instructions: tell it what to keep', type: '/compact keep the discount code plan and the failing test names', match: /^\/compact(\s+.+)?$/,
          explain: '[[compact]] summarized the conversation. **Focus instructions** tell it what matters. Specific values (IDs, amounts) can blur in summaries: keep must-not-lose facts in a file or a [[case-facts]] block.', terms: ['compact', 'case-facts'] },
        { do: 'Starting something unrelated? Clear the slate', type: '/clear', match: /^\/clear$/,
          explain: '[[clear]] wipes the conversation; CLAUDE.md still loads next turn. Rule of thumb: new unrelated task → `/clear`.', terms: ['clear', 'claude-md'] },
        { do: 'Open the session picker to resume an older conversation', type: '/resume', match: /^\/resume$/,
          explain: 'From the shell: `claude -c` continues the latest session, `claude -r` picks one. **Exam nuance:** if the code changed a lot since that session, a fresh session with a summary can beat resuming stale context ([[resume]]).', terms: ['resume', 'session'] },
      ],
    },
    {
      id: 'headless', title: 'Headless & CI/CD', level: 'Advanced', mins: 6,
      sub: 'claude -p, JSON output, piping, and the GitHub Action.',
      intro: 'Claude Code can run **without** the interactive UI: in scripts and CI pipelines.',
      start: { inClaude: false, cwd: '~/shop-app', files: ['~/shop-app/.github/workflows/claude.yml'] },
      steps: [
        { do: 'Run a one-off prompt in print (headless) mode with JSON output', type: 'claude -p "summarize the last 3 commits" --output-format json', match: /^claude\s+(-p|--print)\s+.+/,
          explain: '`-p` runs once and exits, which is essential in CI (otherwise it waits for input forever). `--output-format json` gives a parseable result with cost and session id ([[headless]], [[output-format]]).', terms: ['headless', 'output-format'] },
        { do: 'Pipe a log file into Claude', type: 'cat error.log | claude -p "explain the root cause in one paragraph"', match: /^cat\s+error\.log\s*\|\s*claude\s+-p/,
          explain: 'Unix pipes (`|`) send one command\'s output into another. Here the log becomes Claude\'s input. Great for scripts and quick diagnostics.', terms: ['headless'] },
        { do: 'Look at a ready-made CI workflow: open Files → .github → workflows → claude.yml', action: 'open:~/shop-app/.github/workflows/claude.yml', type: '(click 📁 Files → .github → workflows → claude.yml)',
          explain: 'The official action `anthropics/claude-code-action@v1` runs Claude Code on PRs. Keep the API key in **secrets**, and use **explicit criteria** so reviews stay useful ([[github-actions]]).', terms: ['github-actions', 'explicit-criteria'] },
      ],
    },
  ];
})(window.CCA);
