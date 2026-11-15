const fs = require('fs');
const skills = JSON.parse(fs.readFileSync('tools/skill-tags/skills.json', 'utf8'));
const tags = JSON.parse(fs.readFileSync('tools/skill-tags/tags.json', 'utf8')).tags;
let bad = 0;
fs.readdirSync('tools/skill-tags/groups').sort().forEach(f => {
  const g = JSON.parse(fs.readFileSync('tools/skill-tags/groups/' + f, 'utf8'));
  const key = g.subject + '|' + g.strand, ids = new Set((skills[key] || []).map(s => s.id));
  const mine = tags.filter(t => t.group === key);
  if (!mine.length) { console.log('NOT STARTED ' + key); return; }
  const errs = [];
  g.items.forEach(it => {
    const m = mine.filter(t => t.kind === it.kind && t.text === it.text && t.stage === it.stage);
    if (m.length !== 1) errs.push((m.length ? 'tagged ' + m.length + ' times: ' : 'not tagged: ') + it.text.slice(0, 70));
    else if (m[0].skill === 'none') { if (it.kind === 'fd') errs.push('future direction tagged none: ' + it.text.slice(0, 70)); }
    else if (!ids.has(m[0].skill)) errs.push('unknown skill "' + m[0].skill + '": ' + it.text.slice(0, 70));
    if (m.length === 1 && m[0].skill2 !== undefined && (it.kind === 'fd' || m[0].skill === 'none' || m[0].skill2 === m[0].skill || !ids.has(m[0].skill2))) errs.push('bad second skill "' + m[0].skill2 + '": ' + it.text.slice(0, 70));
  });
  mine.forEach(t => { if (!g.items.some(it => it.kind === t.kind && it.text === t.text && it.stage === t.stage)) errs.push('tag for text not in the app: ' + t.text.slice(0, 70)); });
  const count = {}; mine.forEach(t => { count[t.skill] = (count[t.skill] || 0) + 1; });
  const used = new Set(mine.flatMap(t => [t.skill, t.skill2]));
  ids.forEach(id => { if (!used.has(id)) errs.push('skill never used: ' + id); });
  const big = Object.entries(count).filter(([id, n]) => id !== 'none' && n > g.items.length * 0.4);
  big.forEach(([id, n]) => errs.push('skill too broad (' + n + ' of ' + g.items.length + '): ' + id));
  if ((count.none || 0) > g.items.length * 0.15) errs.push('too many "none": ' + count.none);
  console.log((errs.length ? 'FIX ' : 'OK ') + key + ' ' + JSON.stringify(count));
  errs.forEach(e => console.log('   - ' + e)); bad += errs.length;
});
console.log(bad ? bad + ' problems' : 'ALL OK');
