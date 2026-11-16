// Builds the pilot report (markdown) from the done batches. Usage: node pilot-report.js > pilot.md
const fs = require('fs'), path = require('path');
const cur = 'ac9';
const hover = require('./hover/' + cur + '.json'), src = {}; require('./source/ac9/maths.json').forEach(r => src[r.id] = r);
const batches = fs.readdirSync(path.join(__dirname, 'batches', cur)).sort().map(f => require('./batches/' + cur + '/' + f));
const final = new Map(); const newRows = []; const dropWhy = {};
const yl = y => y === 'F' ? 'Foundation' : 'Year ' + y;
batches.forEach(b => b.rows.forEach(r => {
  if (r.action === 'new') { newRows.push(r); return; }
  const cur = final.get(r.text); const weak = x => /^(out of span|Year [0-9] or|Year 1 or 2|Year 3 or 4)/.test(x.note);
  if (r.action === 'keep' || r.action === 'reword') final.set(r.text, r); else if (!cur || (cur.action === 'drop' && weak(cur) && !weak(r))) final.set(r.text, r);
}));
const kept = [], reworded = [], dropped = [];
final.forEach(r => (r.action === 'keep' ? kept : r.action === 'reword' ? reworded : dropped).push(r));
const byYear = {}; const add = (r, kind) => { const y = r.year[0]; (byYear[y] = byYear[y] || []).push({ r, kind }); };
kept.forEach(r => add(r, 'kept')); reworded.forEach(r => add(r, 'reworded')); newRows.forEach(r => add(r, 'new'));
const refCount = {}; Object.values(byYear).flat().forEach(({ r }) => r.refs.forEach(id => refCount[id] = (refCount[id] || 0) + 1));
const cdLabel = id => `${id} (${hover[id] || 'NO HOVER'})`;
const out = [];
out.push('# Curriculum pilot: Australian Curriculum v9, Maths, Number, Foundation to Year 6', '',
  'Produced by `tools/curric/pilot-report.js` from `tools/curric/batches/ac9/01-03.json`. Nothing here is in the app. The curriculum text I worked from is my own working summary of the QCAA per-year sequence PDFs, not the official wording, so every judgement below needs a check against the official text before any of it ships.', '',
  '## Counts', '',
  '| | Rows |', '|---|---|',
  `| NSW sentences considered (Number tabs, F to Year 6 plus a stage either side) | ${final.size} |`,
  `| Kept as they are | ${kept.length} |`, `| Reworded | ${reworded.length} |`, `| New | ${newRows.length} |`,
  `| Not used in Number (dropped here) | ${dropped.length} |`, '');
const why = {}; dropped.forEach(r => { const k = r.note.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim().slice(0, 70); why[k] = (why[k] || 0) + 1; });
out.push('Why the dropped ones were dropped:', '', ...Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${v} × ${k}`), '');
const per = {}; Object.keys(byYear).forEach(y => per[y] = byYear[y].length);
out.push('## Sentences per year', '', '| Year | Total | Kept | Reworded | New |', '|---|---|---|---|---|');
['F', '1', '2', '3', '4', '5', '6'].forEach(y => { const a = byYear[y] || []; out.push(`| ${yl(y)} | ${a.length} | ${a.filter(x => x.kind === 'kept').length} | ${a.filter(x => x.kind === 'reworded').length} | ${a.filter(x => x.kind === 'new').length} |`); });
out.push('');
const thin = Object.keys(src).filter(id => /^AC9M[F1-6]N/.test(id)).filter(id => (refCount[id] || 0) < 2);
out.push('## Content descriptions with fewer than two sentences', '', thin.length ? thin.map(id => '- ' + cdLabel(id)).join('\n') : 'None. Every Number content description from Foundation to Year 6 has at least two sentences.', '');
['F', '1', '2', '3', '4', '5', '6'].forEach(y => {
  out.push(`## ${yl(y)}`, '');
  (byYear[y] || []).sort((a, b) => a.r.refs[0].localeCompare(b.r.refs[0])).forEach(({ r, kind }) => {
    const codes = r.refs.map(cdLabel).join('; ');
    const yrs = r.year.length > 1 ? ` (also ${r.year.slice(1).map(yl).join(', ')})` : '';
    if (kind === 'reworded') out.push(`- **Reworded** [${codes}]${yrs}`, `  - Before: ${r.text}`, `  - After: ${r.newText}`, ...(r.note ? [`  - Why: ${r.note}`] : []));
    else out.push(`- **${kind === 'new' ? 'New' : 'Kept'}** [${codes}]${yrs}: ${kind === 'new' ? r.newText : r.text}` + (r.note ? ` _(${r.note})_` : ''));
  });
  out.push('');
});
out.push('## Dropped from Number, with the reason', '');
dropped.forEach(r => out.push(`- ${r.text} — ${r.note}`)); out.push('');
const un = fs.existsSync(path.join(__dirname, 'unsure.json')) ? require('./unsure.json') : [];
out.push('## Unsure (' + un.length + ')', '', ...un.map(u => `- ${u.text} — ${u.why}`), '');
console.log(out.join('\n'));
