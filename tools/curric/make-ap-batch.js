// Usage: node make-ap-batch.js <cur> <subject> [--write]  Writes batches/<cur>/ap-<subject>.json: all level A-D content descriptions plus every NSW access-point (AP) sentence of the subject.
const fs = require('fs'), path = require('path');
const [cur, subject] = process.argv.slice(2); const nsw = require('./nsw.json');
const src = require('./source/' + cur + '/ap-' + subject + '.json');
const sentences = nsw.sentences.filter(s => s.subject === subject && s.tag === 'AP').map(s => ({ text: s.text, tab: s.tab, stageTag: s.tag, skill: s.skill }));
const B = { curriculum: cur, subject, span: 'AP', cds: src.map(r => ({ id: r.id, year: r.year, text: r.text })), sentences, rows: [] };
fs.mkdirSync(path.join(__dirname, 'batches', cur), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'batches', cur, 'ap-' + subject + '.json'), JSON.stringify(B, null, 1));
console.log(cur, subject, 'AP:', src.length, 'content descriptions,', sentences.length, 'sentences');
