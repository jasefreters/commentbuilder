// Builds the 30-pair review sample: node tools/skill-tags/review.js > tools/skill-tags/review.md
const fs = require('fs');
const rank = s => ({ 'Access Points': 0, AP: 0, 'Early Stage 1': 1, ES1: 1, 'Stage 1': 2, S1: 2, S1A: 2, S1B: 2, 'Stage 2': 3, S2: 3, S2A: 3, S2B: 3, 'Stage 3': 4, S3: 4, S3A: 4, S3B: 4, 'S3A+B': 4, S4: 5 })[s];
const label = { AP: 'Access Points', ES1: 'Early Stage 1', S1: 'Stage 1', S1A: 'Stage 1', S1B: 'Stage 1', S2: 'Stage 2', S2A: 'Stage 2', S2B: 'Stage 2', S3: 'Stage 3', S3A: 'Stage 3', S3B: 'Stage 3', 'S3A+B': 'Stage 3', S4: 'Stage 4' };
const say = t => t.replace(/\{\{S\}\}/g, 'Sam').replace(/\{\{N\}\}/g, 'Sam').replace(/\{\{pos\}\}/g, 'his').replace(/\{\{o\}\}/g, 'him').replace(/\{\{s\}\}/g, 'he');
const stop = new Set('with that this from when they their them using used into over have been which while about also each other more than such what where'.split(' '));
const words = t => new Set(say(t).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stop.has(w)));
const tags = JSON.parse(fs.readFileSync('tools/skill-tags/tags.json', 'utf8')).tags;
const groups = [...new Set(tags.map(t => t.group))];
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cand = { repeat: {}, next: {}, diff: {} };
groups.forEach(g => {
  const fds = tags.filter(t => t.group === g && t.kind === 'fd'), ss = tags.filter(t => t.group === g && t.kind === 'sentence' && t.skill !== 'none' && rank(t.stage) !== undefined);
  cand.repeat[g] = []; cand.next[g] = []; cand.diff[g] = [];
  fds.forEach(f => ss.forEach(s => {
    const same = s.skill === f.skill || s.skill2 === f.skill;
    if (same) (rank(s.stage) >= rank(f.stage) ? cand.repeat : cand.next)[g].push([f, s]);
    else { const a = words(f.text), b = words(s.text); const n = [...a].filter(w => b.has(w)).length; if (n >= 2) cand.diff[g].push([f, s, n]); }
  }));
  cand.diff[g].sort((x, y) => y[2] - x[2]);
});
function pick(kind, n) {
  const gs = shuffle(groups.filter(g => cand[kind][g].length)), out = [];
  for (let r = 0; out.length < n && r < 6; r++) for (const g of gs) { if (out.length >= n) break; const c = kind === 'diff' ? cand.diff[g][r] : shuffle(cand[kind][g])[r]; if (c) out.push([g, c]); }
  return out;
}
const sets = [['Repeats a skill the comment already praises', pick('repeat', 12)], ['Next step in the same skill (allowed)', pick('next', 8)], ['Different skills (allowed)', pick('diff', 10)]];
let n = 0; const lines = ['# Review sample', '', 'For each pair, mark **agree** or **disagree** with the label.', ''];
sets.forEach(([lab, list]) => list.forEach(([g, [f, s]]) => {
  n++; const sk = x => x.skill2 ? x.skill + ' + ' + x.skill2 : x.skill;
  lines.push(`**${n}. ${lab}**  _(${g})_`, `- Future direction (${f.stage}): ${say(f.text)}  [${sk(f)}]`, `- Sentence (${label[s.stage] || s.stage}): ${say(s.text)}  [${sk(s)}]`, '');
}));
lines.push('## Items I was unsure about', '', ...JSON.parse(fs.readFileSync('tools/skill-tags/tags.json', 'utf8')).unsure.map(u => { const t = tags.find(x => x.group === u.group && x.text === u.text); return `- (${u.group}) ${say(u.text)}  [${t.skill}${t.skill2 ? ' + ' + t.skill2 : ''}] — ${u.why}`; }));
console.log(lines.join('\n'));
