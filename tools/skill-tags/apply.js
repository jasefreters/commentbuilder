// Usage: node tools/skill-tags/apply.js <groupNumber 0-13> <mapfile>
// mapfile lines: "<item index> <skill>[+<skill2>] [# unsure: why]". Text is copied from the group file, never retyped.
const fs = require('fs');
const [gi, mf] = [+process.argv[2], process.argv[3]];
const f = fs.readdirSync('tools/skill-tags/groups').sort()[gi];
const g = JSON.parse(fs.readFileSync('tools/skill-tags/groups/' + f, 'utf8'));
const key = g.subject + '|' + g.strand;
const file = 'tools/skill-tags/tags.json';
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { tags: [], unsure: [] };
db.tags = db.tags.filter(t => t.group !== key);
db.unsure = db.unsure.filter(u => u.group !== key);
const seen = new Set();
fs.readFileSync(mf, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).forEach(l => {
  const [main, why] = l.split('#');
  const [idx, sk] = main.trim().split(/\s+/);
  const it = g.items[+idx];
  if (!it || seen.has(+idx)) throw new Error('bad or repeated index ' + idx);
  seen.add(+idx);
  const [a, b] = sk.split('+');
  const t = { group: key, kind: it.kind, stage: it.stage, text: it.text, skill: a };
  if (b) t.skill2 = b;
  db.tags.push(t);
  if (why) db.unsure.push({ group: key, text: it.text, why: why.replace(/^\s*unsure:\s*/, '').trim() });
});
fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n');
console.log(key + ': ' + seen.size + ' of ' + g.items.length + ' items tagged');
