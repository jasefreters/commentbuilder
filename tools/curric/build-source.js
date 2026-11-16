// Builds source/<cur>/<subject>.json from raw/*.txt and prints a rows-per-year-per-strand table.
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, 'raw', f), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const out = (cur, subj, rows) => { const d = path.join(__dirname, 'source', cur); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, subj + '.json'), JSON.stringify(rows, null, 1)); return rows; };
const yr = s => s === 'F' ? 0 : s === 'P' ? 0 : +s;
const MS = { N: 'Number', A: 'Algebra', M: 'Measurement', SP: 'Space', ST: 'Statistics', P: 'Probability' };
const ES = { LA: 'Language', LE: 'Literature', LY: 'Literacy' };
const ACSUB = { 'LA-I': 'Language for interacting with others', 'LA-T': 'Text structure and organisation', 'LA-E': 'Language for expressing and developing ideas', 'LA-IM': 'Language for expressing and developing ideas', 'LA-V': 'Language for expressing and developing ideas', 'LA-P': 'Language for expressing and developing ideas' };
const tables = [];
function mk(cur, subj, rows) { out(cur, subj, rows); tables.push([cur, subj, rows]); }
// AC maths
mk('ac9', 'maths', R('ac9-maths.txt').map(l => { const [code, text] = l.split('|'); const m = code.match(/^AC9M(F|\d)(N|A|M|SP|ST|P)(\d+)$/); if (!m) throw new Error('bad code ' + code); return { id: code, code, year: yr(m[1]), strand: MS[m[2]], subStrand: MS[m[2]], text }; }));
// Vic maths
mk('vic2', 'maths', R('vic2-maths.txt').map(l => { const [code, text] = l.split('|'); const m = code.match(/^VC2M(F|\d)(N|A|M|SP|ST|P)(\d+)$/); if (!m) throw new Error('bad code ' + code); return { id: code, code, year: yr(m[1]), strand: MS[m[2]], subStrand: MS[m[2]], text }; }));
// AC english
mk('ac9', 'english', R('ac9-english.txt').map(l => { const [code, key, text] = l.split('|'); const m = code.match(/^AC9E(F|\d)(LA|LE|LY)(\d+)$/); if (!m) throw new Error('bad code ' + code); return { id: code, code, year: yr(m[1]), strand: ES[m[2]], subStrand: ACSUB[key] || key, subKey: key, text }; }));
// Vic english
mk('vic2', 'english', R('vic2-english.txt').map(l => { const [code, sub, text] = l.split('|'); const m = code.match(/^VC2E(F|\d)(LA|LE|LY)(\d+)$/); if (!m) throw new Error('bad code ' + code); return { id: code, code, year: yr(m[1]), strand: ES[m[2]], subStrand: sub, text }; }));
// WA maths (no codes; made-up ids)
mk('wa', 'maths', R('wa-maths.txt').map((l, i) => { const [y, strand, sub, text] = l.split('|'); const year = y === 'PP' ? 0 : +y; return { id: 'WAM-' + y + '-' + sub.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '-' + i, code: null, year, strand, subStrand: sub, text }; }));
// checks
let bad = 0;
for (const [cur, subj, rows] of tables) {
  const ids = new Set(rows.map(r => r.id)); if (ids.size !== rows.length) { console.log('DUPLICATE IDS in', cur, subj); bad++; }
  const strands = [...new Set(rows.map(r => r.strand))];
  console.log('\n' + cur + '/' + subj + '  total ' + rows.length);
  console.log(['year', ...strands].join('\t'));
  for (let y = 0; y <= 7; y++) { const c = strands.map(s => rows.filter(r => r.year === y && r.strand === s).length); const t = c.reduce((a, b) => a + b, 0); console.log([y === 0 ? 'F/PP' : y, ...c].join('\t') + (t === 0 ? '   <-- NO ROWS' : '')); }
}
if (bad) process.exit(1);
