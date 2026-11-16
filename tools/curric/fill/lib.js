// Helpers to write batch rows by sentence index, so the judgement files stay short.
const fs = require('fs'), path = require('path');
module.exports = function (file) {
  const p = path.join(__dirname, '..', 'batches', file); const B = JSON.parse(fs.readFileSync(p, 'utf8')); B.rows = [];
  const t = i => { if (!B.sentences[i]) throw new Error('no sentence ' + i); return B.sentences[i].text; };
  const yrs = y => Array.isArray(y) ? y.map(String) : [String(y)];
  const refs = r => Array.isArray(r) ? r : [r];
  return {
    B,
    keep: (i, y, r, note) => B.rows.push({ text: t(i), action: 'keep', newText: null, year: yrs(y), refs: refs(r), below: 'ok', above: 'ok', note: note || '' }),
    reword: (i, nt, y, r, note) => B.rows.push({ text: t(i), action: 'reword', newText: nt, year: yrs(y), refs: refs(r), below: 'ok', above: 'ok', note: note || '' }),
    drop: (i, why) => B.rows.push({ text: t(i), action: 'drop', newText: null, year: [], refs: [], below: 'ok', above: 'ok', note: why }),
    add: (nt, y, r, note) => B.rows.push({ text: null, action: 'new', newText: nt, year: yrs(y), refs: refs(r), below: 'ok', above: 'ok', note: note || '' }),
    out: (...is) => is.forEach(i => B.rows.push({ text: t(i), action: 'drop', newText: null, year: [], refs: [], below: 'ok', above: 'ok', note: 'out of span (Year 3 or above); handled in the next batch' })),
    ap: (...is) => is.forEach(i => B.rows.push({ text: t(i), action: 'drop', newText: null, year: [], refs: [], below: 'ok', above: 'ok', note: 'access point; handled in the access-point batch' })),
    save: () => { fs.writeFileSync(p, JSON.stringify(B, null, 1)); console.log(file, 'rows', B.rows.length, 'of', B.sentences.length, 'sentences'); },
  };
};
