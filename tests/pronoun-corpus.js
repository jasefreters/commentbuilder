// Pronoun fix plan, Step 0: every "her" in the banks, with its true role, as the answer key for the "her" reader.
// corpusInPage runs inside the app page (pass its source to page.evaluate). Each entry:
//   { src, tok, role: 'obj' | 'poss', before, after, sentence }  -  before / after are the sentence resolved for a girl (Ava)
//   either side of the word, so "her" can be judged the way the app sees finished text.
function corpusInPage() {
  const all = []; const walk = o => { if (typeof o === 'string') { if (/\{\{(?:o|O|pos|Pos)\}\}/.test(o)) all.push(o); } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
  [RAW, ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD].forEach(walk);
  const seen = new Set(), out = [];
  for (const src of all) {
    if (seen.has(src)) continue; seen.add(src);
    const re = /\{\{(o|O|pos|Pos)\}\}/g; let m;
    while ((m = re.exec(src))) {
      const mark = '⁣HER⁣';
      const t = src.slice(0, m.index) + mark + src.slice(m.index + m[0].length);
      const resolved = applyRaw(t, 'Ava', PR.she, '5');
      const k = resolved.indexOf(mark);
      out.push({ src, tok: m[1], role: /^o$/i.test(m[1]) ? 'obj' : 'poss', before: resolved.slice(0, k), after: resolved.slice(k + mark.length).replace(/⁣HER⁣/g, 'her'), sentence: resolved.replace(/⁣HER⁣/g, 'her') });
    }
  }
  return out;
}
module.exports = { corpusInPage };
