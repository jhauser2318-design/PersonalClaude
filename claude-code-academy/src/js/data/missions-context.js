/* Simulator mission: context engineering in Claude Code. */
(function (C) {
  const L = (...lines) => lines.join('\n');
  const bloated = L('# Shop App', '', '## Commands', '- `npm test`: run all tests', '- `npm run lint`: ESLint', '',
    '## Testing rules (only matter for *.test.js files)', '- Use node:test and node:assert', '- One behaviour per test, named "does X when Y"', '- Never hit the real payment API; use the fake in tests/fakes/', '- Each bug fix gets a regression test', '- Keep fixtures in tests/fixtures/', '- Snapshot files live next to the test', '- Run a single file with: node --test tests/cart.test.js',
    '', '## History of the project (2019–2026)', '- 2019: started as a PHP prototype…', '- 2021: rewritten in Express…', '- (40 more lines of history Claude rarely needs)…', '', '## Gotchas', '- Never read or print .env');
  const slim = L('# Shop App', '', '## Commands', '- `npm test`: run all tests', '- `npm run lint`: ESLint', '',
    '## Architecture', 'See @docs/architecture.md', '', '## Gotchas', '- Never read or print .env', '- Test conventions: .claude/rules/testing.md (loads for *.test.js)');
  const rules = L('---', 'paths:', '  - "**/*.test.js"', '---', '# Testing rules', '- Use node:test and node:assert', '- One behaviour per test, named "does X when Y"', '- Never hit the real payment API; use the fake in tests/fakes/', '- Each bug fix gets a regression test', '- Keep fixtures in tests/fixtures/', '- Run a single file with: node --test tests/cart.test.js');
  const notes = L('# NOTES: how discounts flow (written by the Explore subagent)', '', '1. POST /cart/total (src/app.js:15) receives items + discount', '2. cartTotal(items, discountPct) in src/cart.js:2', '3. subtotal = sum(price * qty); total = subtotal × (1 − pct/100)', '4. Rounded to cents (src/cart.js:5)', '', '## Risks', '- No clamp on discountPct (>100% → negative totals; issue #42)', '- items undefined → TypeError (issue #38)', '', '## Decisions', '- Clamp 0–100 in cartTotal, validate body in the route');

  C.SIM_CREATED['~/shop-app/.claude/rules/testing.md'] = { content: rules, notes: { 2: 'paths: makes this rule load ONLY when Claude works on matching files, so it costs no tokens otherwise.', 3: 'A glob: every *.test.js file in any folder.', 5: 'The rules moved out of CLAUDE.md, word for word.' } };
  C.SIM_CREATED['~/shop-app/NOTES.md'] = { content: notes, notes: { 1: 'A scratchpad file: external memory that survives /compact, /clear and new sessions.', 3: 'Specific file:line references, so future sessions can jump straight there.', 9: 'Risks and decisions: exactly the kind of detail summaries tend to lose.' } };

  C.MISSIONS.push({
    id: 'context-eng', title: 'Context engineering in Claude Code', level: 'Advanced', mins: 8,
    sub: 'Diagnose a bloated context, slim CLAUDE.md with path rules, explore via a subagent with notes, then compact.',
    intro: 'This session is cluttered: a huge CLAUDE.md and 46 old messages. Let\'s apply the four moves (**write, select, compress, isolate**) and watch `/context` improve.',
    start: { inClaude: true, cwd: '~/shop-app', busy: true, fsOverrides: { '~/shop-app/CLAUDE.md': { content: bloated, notes: { 7: 'These rules only matter for test files, yet they load in EVERY session. Candidate for .claude/rules/.', 16: 'Project history Claude rarely needs: tokens spent every session for nothing.' } } } },
    steps: [
      { do: 'Diagnose: what is filling the context?', type: '/context', match: /^\/context$/,
        explain: '**Messages** dominate (old exploration), and memory files are large. The four moves: **write** facts to files, **select** only what\'s needed, **compress** history, **isolate** exploration.', terms: ['context-engineering', 'context-cmd'] },
      { do: 'Slim CLAUDE.md: move the testing rules into a path-scoped rule file', type: 'slim down CLAUDE.md: move the testing rules into .claude/rules/testing.md for test files only and drop the project history', keys: ['claude.md|claude md', 'rules|slim|move'],
        run: [
          ['tool', 'Read', 'CLAUDE.md', 'Read 22 lines'],
          ['write', '~/shop-app/.claude/rules/testing.md'],
          ['edit', '~/shop-app/CLAUDE.md', ['  ## Commands', '- ## Testing rules (only matter for *.test.js files)', '- - Use node:test and node:assert', '- - (6 more rule lines)', '- ## History of the project (2019–2026)', '- - (40 lines of history)', '+ ## Architecture', '+ See @docs/architecture.md', '  ## Gotchas', '+ - Test conventions: .claude/rules/testing.md (loads for *.test.js)'], slim],
          ['say', 'CLAUDE.md went from ~60 lines to 11. Testing rules now load **only** when I touch *.test.js files, and the history is gone (it\'s in git anyway).'],
        ],
        explain: '**Select**: every CLAUDE.md line costs tokens in every session. Path-scoped [[rules]] load only when relevant, and an @import keeps details out until needed.', terms: ['rules', 'claude-md', 'import'] },
      { do: 'Open Files → .claude → rules → testing.md to see the path filter', action: 'open:~/shop-app/.claude/rules/testing.md', type: '(click 📁 Files → .claude → rules → testing.md)',
        explain: 'The `paths:` frontmatter is what makes the rule conditional. Same content, zero cost when you\'re not editing tests.', terms: ['rules'] },
      { do: 'Isolate: have a subagent explore and write findings to NOTES.md', type: 'use a subagent to investigate how discounts flow through the code and save the findings to NOTES.md', keys: ['subagent|agent', 'notes|discount'],
        run: [
          ['agent', 'Explore', 'Trace how a discount flows from POST /cart/total to the final total. List file:line references, risks and open decisions. Keep it under 15 lines.', [['tool', 'Grep', 'discount in src/', '4 matches'], ['tool', 'Read', 'src/app.js', '19 lines'], ['tool', 'Read', 'src/cart.js', '8 lines'], ['tool', 'Read', 'error.log', '4 lines']], 'Flow: route → cartTotal → subtotal × (1 − pct/100) → rounded. Risks: no 0–100 clamp; undefined items crash.'],
          ['write', '~/shop-app/NOTES.md'],
          ['say', 'The Explore subagent read 4 files in **its own** context; only a 15-line summary came back, saved to [B]NOTES.md[/] so it survives compaction.'],
        ],
        explain: '**Isolate + write**: the messy reading happened in a [[subagent]]\'s window, and the result lives in a scratchpad file, not only in the chat.', terms: ['subagent', 'context-isolation', 'case-facts'] },
      { do: 'Compress: compact with focus instructions', type: '/compact keep the discount findings in NOTES.md and the CLAUDE.md changes', match: /^\/compact(\s+.+)?$/,
        explain: '**Compress**: the 46 old messages became a short summary focused on what you said matters. Facts that must stay exact live in NOTES.md.', terms: ['compact'] },
      { do: 'Check the result', type: '/context', match: /^\/context$/,
        explain: 'Much leaner context: faster, cheaper, and more accurate answers. 🎉 You applied all four moves of context engineering.', terms: ['context-window', 'context-rot'] },
    ],
  });
})(window.CCA);
