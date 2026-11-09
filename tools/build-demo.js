#!/usr/bin/env node
// Builds demo.html from report-comment-builder.html: the real app, with
//  - the comment banks cut back to the sample comments in tools/demo-bank.json (nothing else ships),
//  - cloud sign-in, sync, AI, suggestions, backup and admin switched off,
//  - the demo's saved data kept apart from the real app's (same website address).
// Usage: node tools/build-demo.js        (run again after every app change; tools/check-demo.js tests the result)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'report-comment-builder.html'), 'utf8');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-bank.json'), 'utf8'));
const lines = src.split('\n');

// find a top-level `const NAME = ...` declaration (start line, end line, text)
function span(name) {
  const re = new RegExp('^(?:const|let) ' + name + '\\s*=');
  const a = lines.findIndex(l => re.test(l));
  if (a < 0) throw new Error('not found: ' + name);
  let b = a;
  if (!/[}\]\)];\s*$/.test(lines[a])) { b = a + 1; while (b < lines.length && !/^[}\]\)]+;?\s*$/.test(lines[b])) b++; }
  return { a, b, text: lines.slice(a, b + 1).join('\n') };
}
function valueOf(name) {   // evaluate a declaration on its own (they are plain literals)
  const s = span(name);
  return vm.runInNewContext('(function(){' + s.text.replace(/^(?:const|let) /, 'var ') + '; return ' + name + '; })()');
}
const replace = {};   // name -> new declaration text
const dec = (name, val, kind) => { replace[name] = (kind || 'const') + ' ' + name + ' = ' + (typeof val === 'string' ? val : JSON.stringify(val)) + ';'; };

// ── comment banks ──
const rawKeys = Object.keys(valueOf('RAW'));
const RAW = {}; rawKeys.forEach(k => { if (bank.general[k]) RAW[k] = [bank.general[k]]; });
dec('RAW', RAW);
function subjBank(subj, name) {
  const orig = valueOf(name), out = {};
  Object.keys(orig).forEach(k => {
    const s = bank[subj][k];
    if (!s) return;
    out[k] = k === 'Introduction' ? { C: [s] } : { U: [s] };
  });
  return out;
}
dec('ENGLISH_BANK', subjBank('english', 'ENGLISH_BANK'));
dec('MATHS_BANK', subjBank('maths', 'MATHS_BANK'));
const tag = {}; ['english', 'maths'].forEach(s => { tag[bank[s]['Below Expectations']] = 'BEY'; });
dec('SENT_TAG', tag);
// Future Directions: a few per stage so the feature can be tried
function trimFD(name) {
  const o = valueOf(name), out = {};
  Object.keys(o).forEach(k => { out[k] = {}; Object.keys(o[k]).forEach(st => { out[k][st] = o[k][st].slice(0, bank.fdPerStage); }); });
  return out;
}
dec('ENGLISH_FD', trimFD('ENGLISH_FD'));
dec('MATHS_FD', trimFD('MATHS_FD'));
// wording history and old-to-new maps hold real bank sentences
dec('WORDING_CHANGES', []); dec('S1_SENTENCE_ALIASES', {}); dec('SUBJ_ALIASES', {});
dec('MERGE_RULES', { english: [], maths: [] });
dec('RECENT_CHANGES', []);
dec('RETIRED', 'new Set([])');

// build the output with the replaced spans
const spans = Object.keys(replace).map(n => ({ n, ...span(n) })).sort((x, y) => x.a - y.a);
const out = []; let i = 0;
spans.forEach(sp => { while (i < sp.a) out.push(lines[i++]); out.push(replace[sp.n]); i = sp.b + 1; });
while (i < lines.length) out.push(lines[i++]);
let html = out.join('\n');

// ── demo mode ──
const head = fs.readFileSync(path.join(__dirname, 'demo-head.js'), 'utf8');
const tail = fs.readFileSync(path.join(__dirname, 'demo-tail.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'demo.css'), 'utf8');
html = html.replace(/<title>[^<]*<\/title>/, '<title>Report Ready demo</title>');
html = html.replace('</style>\n</head>', '</style>\n<style id="demoCss">\n' + css + '\n</style>\n</head>');
if (!html.includes('id="demoCss"')) throw new Error('css marker');
html = html.replace(/<script>\nconst PR = \{/, '<script>\n' + head + '\nconst PR = {');
if (!html.includes('DEMO_MODE')) throw new Error('head marker');
html = html.replace("const DB_NAME = 'rcb_store'", "const DB_NAME = 'rcb_demo_store'");
html = html.replace(/\nloadPersistedState\(\);/, '\nloadPersistedState();\n' + tail);
if (!html.includes('demoStart()')) throw new Error('tail marker');
fs.writeFileSync(path.join(root, 'demo.html'), html);
console.log('demo.html', html.length, 'bytes (app', src.length + ')');
