// Writes the tag data into report-comment-builder.html between the two skill-tags markers.
// Usage: node tools/skill-tags/build-data.js          (rewrites the block)
//        node tools/skill-tags/build-data.js --check  (fails if the app's block is out of date)
const fs = require('fs');
const H = 'report-comment-builder.html';
const tags = JSON.parse(fs.readFileSync('tools/skill-tags/tags.json', 'utf8')).tags;
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const strandOf = g => g.split('|')[1];
const out = {}, seen = {};
tags.forEach(t => {
  const k = fnv(strandOf(t.group) + '|' + t.text);
  if (seen[k] && seen[k] !== t.text + '|' + t.group) throw new Error('hash collision ' + k);
  const v = t.skill + (t.skill2 ? '+' + t.skill2 : '');
  if (out[k] && out[k] !== v) throw new Error('same text tagged two ways: ' + t.text);
  seen[k] = t.text + '|' + t.group; out[k] = v;
});
const lines = Object.keys(out).sort().map(k => JSON.stringify(k) + ':' + JSON.stringify(out[k]));
const block = '// <skill-tags>\n// One skill per sentence and future direction (a sentence may have two, joined by +). Key = hash of "strand|text". Made by tools/skill-tags/build-data.js from tools/skill-tags/tags.json; do not edit by hand.\nconst SKILL_TAGS = {\n' + lines.join(',\n') + '\n};\n// </skill-tags>';
const src = fs.readFileSync(H, 'utf8');
const a = src.indexOf('// <skill-tags>'), b = src.indexOf('// </skill-tags>');
if (process.argv[2] === '--check') { if (a < 0 || src.slice(a, b + '// </skill-tags>'.length) !== block) { console.error('SKILL_TAGS in the app is out of date'); process.exit(1); } console.log('SKILL_TAGS up to date (' + lines.length + ' entries)'); process.exit(0); }
if (a < 0) throw new Error('markers missing in ' + H);
fs.writeFileSync(H, src.slice(0, a) + block + src.slice(b + '// </skill-tags>'.length));
console.log('wrote ' + lines.length + ' entries, ' + block.length + ' bytes');
