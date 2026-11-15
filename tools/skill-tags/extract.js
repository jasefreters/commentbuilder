const fs = require('fs');
const src = fs.readFileSync('report-comment-builder.html', 'utf8');
function grab(name) {
  const i = src.indexOf('const ' + name + ' = {');
  if (i < 0) throw new Error('missing ' + name);
  const j = i + src.slice(i).indexOf('{');
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return eval('(' + src.slice(j, k + 1) + ')'); }
  }
}
const MAP = {
  english: { 'Oral Language & Communication': 'Oral Language and Communication', 'Reading Comprehension': 'Reading Comprehension', 'Creating Written Texts': 'Creating Written Texts', 'Spelling & Grammar': 'Spelling', 'Handwriting & Digital Transcription': 'Handwriting' },
  maths: { 'Represents Numbers': 'Representing Whole Numbers', 'Additive Relations': 'Additive Relations', 'Multiplicative Relations': 'Multiplicative Relations', 'Representing Quantity Fractions': 'Representing Quantity Fractions', 'Geometric Measure': 'Geometric Measure', 'Two-Dimensional Spatial Structure': 'Two-Dimensional Spatial Structure', 'Three-Dimensional Spatial Structure': 'Three-Dimensional Spatial Structure', 'Non-Spatial Measure': 'Non-Spatial Measure', 'Data': 'Data' }
};
const tag = grab('SENT_TAG');
const out = [];
for (const [subj, bankName, fdName] of [['english', 'ENGLISH_BANK', 'ENGLISH_FD'], ['maths', 'MATHS_BANK', 'MATHS_FD']]) {
  const bank = grab(bankName), fd = grab(fdName);
  for (const [section, strand] of Object.entries(MAP[subj])) {
    if (!bank[section] || !fd[strand]) throw new Error('missing ' + section + ' / ' + strand);
    const items = [];
    (bank[section].U || []).forEach(t => items.push({ kind: 'sentence', stage: tag[t] || '', text: t }));
    Object.entries(fd[strand]).forEach(([stage, list]) => list.forEach(t => items.push({ kind: 'fd', stage, text: t })));
    out.push({ subject: subj, section, strand, items });
  }
}
fs.mkdirSync('tools/skill-tags/groups', { recursive: true });
out.forEach((g, n) => fs.writeFileSync('tools/skill-tags/groups/' + String(n + 1).padStart(2, '0') + '-' + g.subject + '-' + g.strand.replace(/[^A-Za-z]+/g, '-') + '.json', JSON.stringify(g, null, 2)));
console.log(out.map(g => g.subject + ' | ' + g.strand + ' | sentences ' + g.items.filter(i => i.kind === 'sentence').length + ' | fds ' + g.items.filter(i => i.kind === 'fd').length).join('\n'));
