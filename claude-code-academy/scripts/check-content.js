// Sanity checks for the app's content: run with `npm run check`.
// Every [[term]] must exist in the glossary, every link between lessons,
// missions and exam domains must resolve, and every question must be valid.
const fs = require('fs');
const path = require('path');
global.window = global;
for (const f of ['glossary', 'lessons', 'exam', 'questions', 'missions', 'missions-connect', 'python', 'resources', 'connect', 'kb']) {
  eval(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'data', f + '.js'), 'utf8'));
}
const C = global.CCA;
const problems = [];
const termRefs = (text, where) => {
  for (const m of String(text).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    if (!C.GLOSSARY[m[1].trim()]) problems.push(`${where}: unknown term [[${m[1]}]]`);
  }
};
const lessons = C.LESSONS.flatMap((m) => m.lessons);
const missionIds = new Set(C.MISSIONS.map((m) => m.id));
lessons.forEach((l) => {
  termRefs(l.body, `lesson ${l.id}`);
  if (l.mission && !missionIds.has(l.mission)) problems.push(`lesson ${l.id}: unknown mission ${l.mission}`);
  l.check.forEach((q, i) => { if (!(q.a >= 0 && q.a < q.options.length)) problems.push(`lesson ${l.id} check ${i}: bad answer index`); });
});
C.PY_LESSONS.forEach((l) => termRefs(l.body, `python ${l.id}`));
C.CONNECT.forEach((c) => {
  termRefs(c.body, `connect ${c.id}`);
  c.check.forEach((q, i) => { if (!(q.a >= 0 && q.a < q.options.length)) problems.push(`connect ${c.id} check ${i}: bad answer index`); });
  if (/\[\[[^\]]*\\\|/.test(c.body)) problems.push(`connect ${c.id}: escaped pipe inside a term link`);
});
if (new Set(C.MISSIONS.map((m) => m.id)).size !== C.MISSIONS.length) problems.push('duplicate mission ids');
C.MISSIONS.forEach((m) => {
  termRefs(m.intro, `mission ${m.id}`);
  (m.start.files || []).forEach((f) => { if (!C.SIM_CREATED[f]) problems.push(`mission ${m.id}: start file ${f} not defined`); });
  m.steps.forEach((s, i) => {
    termRefs(s.explain, `mission ${m.id} step ${i + 1}`);
    (s.terms || []).forEach((t) => { if (!C.GLOSSARY[t]) problems.push(`mission ${m.id} step ${i + 1}: unknown term ${t}`); });
    if (!s.match && !s.keys && !s.key && !s.action) problems.push(`mission ${m.id} step ${i + 1}: no way to complete`);
    if (s.match && s.type && !s.type.startsWith('(') && !s.match.test(s.type)) problems.push(`mission ${m.id} step ${i + 1}: "Show me" text does not match`);
    if (s.keys && !s.keys.every((k) => new RegExp(k, 'i').test(s.type))) problems.push(`mission ${m.id} step ${i + 1}: "Show me" text misses a keyword`);
    if (s.action && s.action.startsWith('open:')) {
      const f = s.action.slice(5);
      const created = m.steps.slice(0, i).some((p) => (p.run || []).some((e) => e[1] === f));
      if (!C.SIM_FILES[f] && !(m.start.files || []).includes(f) && !created) problems.push(`mission ${m.id} step ${i + 1}: file ${f} won't exist yet`);
    }
    (s.run || []).forEach((e) => { if (['write', 'write-silent'].includes(e[0]) && e[2] == null && !C.SIM_CREATED[e[1]]) problems.push(`mission ${m.id}: no content for ${e[1]}`); });
  });
});
C.QUESTIONS.forEach((q) => {
  if (q.o.length !== 4) problems.push(`question ${q.id}: needs 4 options`);
  if (!(q.a >= 0 && q.a < 4)) problems.push(`question ${q.id}: bad answer index`);
  if (!C.DOMAIN_NAMES[q.d]) problems.push(`question ${q.id}: unknown domain ${q.d}`);
});
if (new Set(C.QUESTIONS.map((q) => q.id)).size !== C.QUESTIONS.length) problems.push('duplicate question ids');
C.EXAM.domains.forEach((d) => {
  d.terms.forEach((t) => { if (!C.GLOSSARY[t]) problems.push(`domain ${d.id}: unknown term ${t}`); });
  d.lessons.forEach((id) => { if (!lessons.find((l) => l.id === id)) problems.push(`domain ${d.id}: unknown lesson ${id}`); });
});
if (C.EXAM.domains.reduce((n, d) => n + d.weight, 0) !== 100) problems.push('domain weights do not add up to 100');
const sys = C.buildSystemPrompt();

console.log(`${C.CONNECT.length} connect chapters · ${lessons.length} lessons · ${C.MISSIONS.length} missions · ${C.QUESTIONS.length} questions · ${Object.keys(C.GLOSSARY).length} terms · ${C.PY_LESSONS.length} Python lessons · tutor prompt ${Math.round(sys.length / 1000)}k chars`);
if (problems.length) { console.error('Problems:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('All content checks passed.');
