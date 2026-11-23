/* The tutor's knowledge base.
   * buildSystemPrompt(): the system prompt sent to Claude (stable text, so the
     API can cache it across questions).
   * offlineAnswer(): when no API key is set, answers from this app's own
     content by keyword search.                                             */
window.CCA = window.CCA || {};
(function (C) {
  const strip = (s) => String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, k, l) => l || (C.GLOSSARY[k] ? C.GLOSSARY[k].term : k));

  // Every in-depth chapter across the tracks, for the index and retrieval
  C.allChapters = () => [
    ...(C.CONNECT || []).map((c) => ({ ...c, track: 'Connect & Automate' })),
    ...[...(C.AGENTS_INTRO || []), ...(C.AGENTS_SELF || []), ...(C.AGENTS_MANAGED || []), ...(C.AGENTS_DECIDE || [])].map((c) => ({ ...c, track: 'Agents: hosted vs self-hosted' })),
    ...(C.APPS || []).map((c) => ({ ...c, track: 'Claude chat & Cowork' })),
    ...(C.CONTEXT || []).map((c) => ({ ...c, track: 'Context & Memory Engineering' })),
    ...(C.GITHUB || []).map((c) => ({ ...c, track: 'GitHub & Claude' })),
    ...(C.LESSONS || []).flatMap((m) => m.lessons.map((l) => ({ ...l, track: 'Lessons' }))),
    ...(C.PY_LESSONS || []).map((l) => ({ ...l, track: 'Python Basics' })),
  ];

  // Retrieval for the tutor: pick the chapters that best match a question
  C.retrieveChapters = (question, k = 3) => {
    const q = words(question).filter((w) => w.length > 2);
    if (!q.length) return [];
    const scored = C.allChapters().map((c) => {
      const title = (c.title + ' ' + (c.group || '')).toLowerCase();
      const body = String(c.body).toLowerCase();
      let score = 0;
      for (const w of q) {
        if (title.includes(w)) score += 6;
        const hits = body.split(w).length - 1;
        score += Math.min(hits, 8);
      }
      return [score, c];
    }).filter(([sc]) => sc >= 4).sort((a, b) => b[0] - a[0]).slice(0, k);
    return scored.map(([, c]) => c);
  };
  C.referenceBlock = (question) => {
    const found = C.retrieveChapters(question);
    if (!found.length) return '';
    return found.map((c) => `<reference track="${c.track}" title="${c.title}">\n${strip(c.body).slice(0, 7000)}\n</reference>`).join('\n');
  };

  C.buildSystemPrompt = () => {
    const gloss = Object.values(C.GLOSSARY).map((g) => `- ${g.term}${g.domain ? ` [${g.domain}]` : ''}: ${strip(g.long || g.short)}`).join('\n');
    const domains = C.EXAM.domains.map((d) => `${d.id} ${d.name} (${d.weight}%)\n${d.tasks.map((t) => '  - ' + t).join('\n')}`).join('\n');
    const principles = C.EXAM.principles.map(([a, b]) => `- ${a}: ${b}`).join('\n');
    const cheat = C.CHEATSHEET.map((s) => `${s.title}:\n${s.rows.map(([k, d]) => `  ${k}: ${d}`).join('\n')}`).join('\n');
    const lessonList = C.LESSONS.map((m) => `${m.title}: ${m.lessons.map((l) => l.title).join('; ')}`).join('\n');
    const missions = C.MISSIONS.map((m) => `${m.title}: ${m.sub}`).join('\n');
    return `You are the tutor inside "Claude Code Academy", a desktop study app. The learner is a beginner who is:
1) learning Claude Code (Anthropic's agentic coding tool) from scratch,
2) preparing for the "Claude Certified Architect – Foundations" exam (CCA-F),
3) learning basic Python and considering beginner Python certifications (PCEP, then PCAP).

How to teach:
- Use plain, friendly English. Define any jargon the first time you use it. Prefer short paragraphs, bullet points and small concrete examples (a command, a file snippet, or a few lines of Python).
- Lead with the direct answer, then explain why. Keep most answers under ~250 words unless the learner asks for depth.
- When a concept is on the exam, say which domain it belongs to (D1–D5) and point out the common trap.
- For practice or exam-style questions: explain the reasoning and why each wrong option is wrong. Never just state a letter.
- Suggest where to practice in this app when useful: the Simulator tab (missions: ${C.MISSIONS.map((m) => m.title).join(', ')}), Lessons, Practice Tests, Flashcards, Glossary, Python Basics.
- Claude Code and the Claude API change quickly. If you are unsure whether a detail is current (flags, prices, exam logistics), say so and point to the official docs (code.claude.com/docs, platform.claude.com/docs) or Anthropic's certification page. Never invent commands or flags.
- Use Markdown. Put commands and code in fenced code blocks with a language tag.
- Stay on topic (Claude, Claude Code, AI agents, prompting, Python, studying). Politely steer back if asked about unrelated things.

=== KNOWLEDGE BASE (from this app) ===

## Glossary
${gloss}

## Architect exam (as reported by published study guides)
Format: ${C.EXAM.facts.map(([a, b]) => `${a}: ${b}`).join('; ')}
Domains and task statements:
${domains}
Scenarios: ${C.EXAM.scenarios.map((s) => `${s.name} (${s.focus})`).join('; ')}
Core principles that decide many questions:
${principles}

## Claude Code cheat sheet
${cheat}

## App contents
Lessons:
${lessonList}
Simulator missions:
${missions}
Python lessons: ${C.PY_LESSONS.map((l) => l.title).join(', ')}

## In-depth chapters (index)
The app also has detailed chapters. For each question, the most relevant chapters are attached to the user's message inside <reference> tags; treat them as this app's verified notes (checked against current SDKs and docs, Nov 2026) and prefer them over older patterns you may remember (e.g. MCP SDK 2.x uses MCPServer, not FastMCP; Opus 5.5 computer use uses computer_toolset_20260801; Cowork and chat are merging into one Claude).
${C.allChapters().map((c) => `- ${c.track}: ${c.title}`).join('\n')}
Python certifications: ${C.PY_CERTS.map((c) => `${c.name} (${c.org})`).join('; ')}
`;
  };

  // ------------------------------------------------------------ offline mode
  const STOP = new Set('a an the is are was were be to of in on for and or what how why when which who do does i you it this that with can my me about should use using vs versus difference between explain tell'.split(' '));
  const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9.@/_+-]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));

  C.offlineAnswer = (question) => {
    const q = words(question);
    if (!q.length) return null;
    const scored = [];
    for (const id in C.GLOSSARY) {
      const g = C.GLOSSARY[id];
      const names = [g.term, ...(g.aliases || [])].map((n) => n.toLowerCase());
      const own = g.term.toLowerCase().replace(/\s*\(.*\)/, '');
      const flat = (x) => x.replace(/[^a-z0-9]/g, '');
      let s = 0;
      for (const w of q) {
        if (flat(own) === flat(w) || flat(own) === flat(w).replace(/s$/, '')) s += 9;
        else if (names.some((n) => n === w || flat(n) === flat(w))) s += 6;
        else if (names.some((n) => n.includes(w) && w.length > 2)) s += 3;
        if ((g.short + ' ' + g.long).toLowerCase().includes(w) && w.length > 3) s += 1;
      }
      if (s) scored.push([s, id, g]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    if (!scored.length || scored[0][0] < 3) return null;
    const [, , top] = scored[0];
    const related = scored.slice(1, 4).filter((x) => x[0] >= 3).map((x) => x[2].term);
    const lesson = C.LESSONS.flatMap((m) => m.lessons).find((l) => l.body.includes(`[[${scored[0][1]}`));
    const qs = C.QUESTIONS.filter((x) => q.some((w) => w.length > 3 && x.q.toLowerCase().includes(w))).slice(0, 1);
    let md = `**${top.term}**${top.domain ? `  ·  exam domain ${top.domain} (${C.DOMAIN_NAMES[top.domain]})` : ''}\n\n${strip(top.long || top.short)}`;
    if (top.example) md += `\n\n\`\`\`${top.lang || 'bash'}\n${top.example}\n\`\`\``;
    if (top.analogy) md += `\n\n🌱 **Think of it like:** ${strip(top.analogy)}`;
    if (related.length) md += `\n\n**Related:** ${related.join(', ')}`;
    if (lesson) md += `\n\n📘 Read more in the lesson **"${lesson.title}"**.`;
    if (qs.length) md += `\n\n📝 **Practice:** ${qs[0].q}\n\n*Answer:* ${qs[0].o[qs[0].a]}. ${qs[0].why}`;
    return md;
  };
})(window.CCA);
