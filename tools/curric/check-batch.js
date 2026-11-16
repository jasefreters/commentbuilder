// Usage: node check-batch.js <batchfile...>   Validates rows and runs the style lint. Exit 1 on any failure.
const fs = require('fs'), path = require('path');
const nsw = require('./nsw.json');
const bankText = new Set(nsw.sentences.map(s => s.text));
const PH = new Set(['{{S}}', '{{s}}', '{{N}}', '{{O}}', '{{o}}', '{{Pos}}', '{{pos}}', '{{r}}']);
const US = /\b(organiz|recogniz|realiz|summariz|analyz|color|behavior|favor|center|practice(?=s? (?:their|his|her)\b)|program(?!me)|apologiz|categoriz|emphasiz|generaliz|prioritiz|visualiz|criticiz|memoriz|specializ|utiliz|minimiz|maximiz|normaliz)/i;
function lint(t, others) {
  const e = [];
  if (!/^\{\{[SN]\}\}/.test(t)) e.push('must start with {{S}} or {{N}}');
  (t.match(/\{\{[^}]*\}\}/g) || []).forEach(p => { if (!PH.has(p)) e.push('unknown placeholder ' + p); });
  const plain = t.replace(/\{\{[^}]*\}\}/g, 'X');
  const words = plain.split(/\s+/).filter(Boolean).length;
  if (words < 8 || words > 30) e.push('word count ' + words + ' (8-30)');
  if (!/\.$/.test(t)) e.push('must end with a full stop');
  if ((t.match(/[.!?](\s|$)/g) || []).length > 1) e.push('more than one sentence');
  if (/beginning to/i.test(t)) e.push('"beginning to"');
  if (/,\s+(and|or)\s+[^,]+\.$/.test(t) && (t.match(/,/g) || []).length >= 2 && /,[^,]+,\s+(and|or)\s/.test(t)) e.push('Oxford comma');
  if (US.test(t)) e.push('US spelling');
  if (/\b(is|was|were|will|has been|had)\b\s+(\w+ed)\b/.test(t) && /\b(was|were|will)\b/.test(t)) e.push('not present tense');
  if (others && (bankText.has(t) || others.has(t))) e.push('duplicate of an existing sentence');
  return e;
}
function shared8(a, b) { const A = a.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean), B = b.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean); const set = new Set(); for (let i = 0; i + 8 <= B.length; i++) set.add(B.slice(i, i + 8).join(' ')); for (let i = 0; i + 8 <= A.length; i++) if (set.has(A.slice(i, i + 8).join(' '))) return true; return false; }
let fail = 0;
const files = process.argv.slice(2);
const newTexts = new Set();
for (const f of files) {
  const B = JSON.parse(fs.readFileSync(f, 'utf8')); const cdById = {}; B.cds.forEach(c => cdById[c.id] = c);
  const inBatch = new Set(B.sentences.map(s => s.text)); const seen = new Set();
  const err = (i, m) => { console.log(`${path.basename(f)} row ${i}: ${m}`); fail++; };
  B.rows.forEach((r, i) => {
    if (!['keep', 'reword', 'drop', 'new'].includes(r.action)) return err(i, 'bad action');
    if (r.action !== 'new') { if (!inBatch.has(r.text)) err(i, 'text not in batch sentences'); if (seen.has(r.text)) err(i, 'sentence handled twice'); seen.add(r.text); }
    if (r.action === 'drop') { if (!r.note) err(i, 'drop needs a reason in note'); return; }
    const years = r.year || []; if (!years.length || years.length > 2) err(i, 'year must hold 1 or 2 entries');
    if (!(r.refs || []).length || r.refs.length > 2) err(i, 'refs must hold 1 or 2 ids');
    (r.refs || []).forEach(id => { const c = cdById[id]; if (!c) err(i, 'ref not in batch: ' + id); else if (!years.includes(c.year)) err(i, `ref ${id} is year ${c.year}, row is tagged ${years}`); });
    if (r.below !== 'ok' || r.above !== 'ok') err(i, 'below/above not ok');
    const text = r.action === 'keep' ? r.text : r.newText; if (!text) return err(i, 'missing newText');
    if (r.action !== 'keep') { lint(text, newTexts).forEach(m => err(i, m + ': ' + text)); newTexts.add(text); }
  });
  B.sentences.forEach(s => { if (!seen.has(s.text)) { /* unhandled */ B._un = (B._un || 0) + 1; } });
  const un = B.sentences.filter(s => !seen.has(s.text)).length;
  console.log(path.basename(f) + ': rows ' + B.rows.length + ', sentences not yet handled ' + un);
}
// hover notes
const hd = path.join(__dirname, 'hover');
fs.existsSync(hd) && fs.readdirSync(hd).filter(x => x.endsWith('.json')).forEach(h => {
  const notes = JSON.parse(fs.readFileSync(path.join(hd, h), 'utf8')); const cur = h.replace('.json', '');
  ['maths', 'english'].forEach(sj => { const sp = path.join(__dirname, 'source', cur, sj + '.json'); if (!fs.existsSync(sp)) return; const src = {}; require(sp).forEach(r => src[r.id] = r.text);
    Object.entries(notes).forEach(([id, n]) => { if (!src[id]) return; const w = n.split(/\s+/).length; if (w >= 15) { console.log(`hover ${id}: ${w} words (max 14)`); fail++; } if (shared8(n, src[id])) { console.log(`hover ${id}: shares 8 words with source`); fail++; } }); });
});
console.log(fail ? fail + ' problem(s)' : 'OK'); process.exit(fail ? 1 : 0);
