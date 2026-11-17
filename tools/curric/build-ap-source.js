// Usage: node build-ap-source.js  -> source/<cur>/ap-<subject>.json from raw/*-ap-*.txt (access-point levels). Level letters A-D stand in for the year.
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, 'raw', f), 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
const out = (cur, sj, rows) => { fs.mkdirSync(path.join(__dirname, 'source', cur), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'source', cur, 'ap-' + sj + '.json'), JSON.stringify(rows, null, 1)); console.log(cur, sj, rows.length, 'rows'); };
out('vic2', 'english', R('vic2-english-ap.txt').map(l => { const [code, lv, st, text] = l.split('|'); return { id: code, code, year: lv, strand: { LA: 'Language', LE: 'Literature', LY: 'Literacy' }[st], subStrand: st, text }; }));
out('wa', 'english', R('wa-ap-english.txt').map((l, i) => { const [lv, mode, st, text] = l.split('|'); return { id: 'WAAPE-' + lv + '-' + mode.split(' ')[0].toLowerCase() + '-' + st.toLowerCase() + '-' + i, code: null, year: lv, strand: st, subStrand: mode, text }; }));
out('wa', 'maths', R('wa-ap-maths.txt').map((l, i) => { const [lv, st, sub, text] = l.split('|'); return { id: 'WAAPM-' + lv + '-' + sub.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '') + '-' + i, code: null, year: lv, strand: st, subStrand: sub, text }; }));
