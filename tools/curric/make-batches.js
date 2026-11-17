// Usage: node make-batches.js <cur> <subject> <subStrand> <fromYear> <toYear> [--write <nn>]
// Picks NSW sentences from the tabs mapped to the sub-strand whose stage tag matches the years (one stage either side), and the content descriptions for those years.
const fs = require('fs'), path = require('path');
const [cur, subject, subStrand, a, b] = process.argv.slice(2); const from = +a, to = +b;
const nsw = require('./nsw.json'), map = require('./tab-map.json')[cur][subject];
const src = require('./source/' + cur + '/' + subject + '.json');
// Year -> NSW stage tags (F = 0). Stage letters A/B mean later/earlier in the stage, so all variants are included.
const stageOf = y => y <= 0 ? 'ES1' : y <= 2 ? 'S1' : y <= 4 ? 'S2' : y <= 6 ? 'S3' : 'S4';
const stages = new Set(); for (let y = from - 1; y <= to + 1; y++) stages.add(stageOf(y));
const matches = tag => tag && (tag === 'AP' ? from <= 0 : [...stages].some(s => tag.startsWith(s) || (tag.includes('+') && tag.includes(s))));
const entry = map[subStrand]; if (!entry) throw new Error('no tab map for ' + subStrand); const tabs = Array.isArray(entry) ? entry : entry.tabs, cdSub = Array.isArray(entry) ? subStrand : entry.cds, keys = entry.keys, extra = entry.extra ? new RegExp(entry.extra) : null;
// Sentences already kept or reworded in an earlier batch of this curriculum and subject are left out.
const claimed = new Set(); const bd = path.join(__dirname, 'batches', cur);
if (fs.existsSync(bd)) fs.readdirSync(bd).forEach(f => { const B = JSON.parse(fs.readFileSync(path.join(bd, f), 'utf8')); if (B.subject === subject && B.status !== 'skip') B.rows.forEach(r => { if (r.text && (r.action === 'keep' || r.action === 'reword')) claimed.add(r.text); }); });
const sentences = nsw.sentences.filter(s => !claimed.has(s.text)).filter(s => s.subject === subject && tabs.includes(s.tab) && matches(s.tag)).map(s => ({ text: s.text, tab: s.tab, stageTag: s.tag, skill: s.skill }));
const cds = src.filter(r => ((keys ? keys.includes(r.subKey) : r.subStrand === cdSub) || (extra && extra.test(r.id))) && r.year >= from && r.year <= to).map(r => ({ id: r.id, year: r.year === 0 ? 'F' : String(r.year), text: r.text }));
const batch = { cur, subject, subStrand: cdSub, years: Array.from({ length: to - from + 1 }, (_, i) => from + i === 0 ? 'F' : String(from + i)), status: 'todo', cds, sentences, rows: [] };
console.log(`${cur} ${subject} ${subStrand} Y${from}-${to}: ${cds.length} content descriptions, ${sentences.length} NSW sentences`);
const w = process.argv.indexOf('--write');
if (w > 0) { const d = path.join(__dirname, 'batches', cur); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, process.argv[w + 1] + '.json'), JSON.stringify(batch, null, 1)); }
