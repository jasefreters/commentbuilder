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
// General: one Positive comment per category; where the app has Average and Developing tiers, one of each as well.
// List order is Positive, Average, Developing; the tier boundaries are reset to match (real bank sentences only).
const realRaw = valueOf('RAW'), realBounds = valueOf('TIER_BOUNDARIES');
const RAW = {}, bounds = {};
rawKeys.forEach(k => {
  const l = bank.general[k]; if (!l) return;
  const rb = realBounds[k] || {}, tiers = rb.average == null ? 1 : (rb.developing == null ? 2 : 3);
  if (l.length > tiers) throw new Error('too many tiers for ' + k);
  l.forEach((s, i) => {
    if (i === 0) return;   // the Positive sample is the old demo's own wording
    const at = realRaw[k].indexOf(s); if (at < 0) throw new Error('not a bank sentence: ' + s);
    { const t = at < rb.average ? 0 : (rb.developing == null || at < rb.developing) ? 1 : 2; if (t !== i) throw new Error('wrong tier for ' + s); }
  });
  RAW[k] = l; bounds[k] = { average: l.length > 1 ? 1 : null, developing: l.length > 2 ? 2 : null };
});
dec('RAW', RAW);
dec('TIER_BOUNDARIES', Object.assign({}, realBounds, bounds));
// Introduction and Below Expectations: one sample each. Every skill strand: one real bank comment per stage
// (Early Stage 1, Stage 1, 2, 3, 4 and Access Points), listed in tools/demo-bank.json under "staged";
// each keeps its stage tag from the app, so the demo shows the year-and-mark grading.
const realTag = valueOf('SENT_TAG'), realBank = { english: valueOf('ENGLISH_BANK'), maths: valueOf('MATHS_BANK') };
const stageTag = {};
function subjBank(subj, name) {
  const orig = valueOf(name), out = {};
  Object.keys(orig).forEach(k => {
    if (k === 'Introduction' || k === 'Below Expectations') {
      const s = bank[subj][k];
      if (k === 'Introduction' && s && typeof s === 'object') {   // one real comment per band A to E (C is the old demo sample)
        out[k] = {};
        Object.keys(s).forEach(g => {
          if (g !== 'C' && !(orig[k][g] || []).includes(s[g])) throw new Error('not a bank sentence: ' + s[g]);
          out[k][g] = [s[g]];
        });
        return;
      }
      if (s) out[k] = k === 'Introduction' ? { C: [s] } : { U: [s] };
      return;
    }
    const list = (bank.staged[subj] || {})[k];
    if (!list) return;
    const rank = t => t === 'ES1' ? 0 : t === 'AP' ? 9 : +(/^S(\d)/.exec(t || '') || [0, 5])[1];   // Early Stage 1, Stage 1 to 4, then Access Points
    list.sort((a, b) => rank(realTag[a]) - rank(realTag[b]));
    list.forEach(s => {
      if (!(realBank[subj][k].U || []).includes(s)) throw new Error('not a bank sentence: ' + s);
      if (!realTag[s]) throw new Error('no stage tag: ' + s);
      stageTag[s] = realTag[s];
    });
    out[k] = { U: list };
  });
  return out;
}
dec('ENGLISH_BANK', subjBank('english', 'ENGLISH_BANK'));
dec('MATHS_BANK', subjBank('maths', 'MATHS_BANK'));
const tag = Object.assign({}, stageTag); ['english', 'maths'].forEach(s => { tag[bank[s]['Below Expectations']] = 'BEY'; });
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
html = html.replace(/\{\{S\}\} calculates areas of rectangles and applies the formula to find the area of triangles\./g, '(a bank sentence)');   // quoted in one code comment
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
