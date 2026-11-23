// Pronoun fix plan, Step 5 (v3.17.45): a pronoun placeholder takes its capital from where it sits in the sentence.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');
after(closeBrowser);

const bankAll = () => {
  const all = []; const walk = o => { if (typeof o === 'string') { if (/\{\{/.test(o)) all.push(o); } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
  [RAW, ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD].forEach(walk);
  return all;
};

test('the three mid-sentence pronouns are lower case on a pronoun turn, for he, she and they', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => ['he', 'she', 'they'].map(p => [
    applyRaw('Although {{S}} is working significantly below stage expectations in English, {{s}} consistently tries {{pos}} best.', 'Ava', PR[p], '5'),
    applyRaw('During structured handwriting lessons, {{S}} carefully forms letters with the correct shape.', 'Ava', PR[p], '5'),
    applyRaw('{{s}} reads well. {{pos}} writing is neat, e.g. {{S}} uses capitals.', 'Ava', PR[p], '5'),
  ]));
  assert.deepStrictEqual(r[0], ['Although he is working significantly below stage expectations in English, he consistently tries his best.', 'During structured handwriting lessons, he carefully forms letters with the correct shape.', 'He reads well. His writing is neat, e.g. he uses capitals.']);
  assert.strictEqual(r[1][0], 'Although she is working significantly below stage expectations in English, she consistently tries her best.');
  assert.strictEqual(r[2][1], 'During structured handwriting lessons, they carefully form letters with the correct shape.');
  await page.context().close();
});

test('no other bank sentence changes, for he, she and they', async () => {
  const page = await openApp();
  const r = await page.evaluate((src) => {
    const all = (new Function('return ' + src))()();
    const keep = window._pronCaseByPlace, changed = new Set();
    for (const [n, p] of [['Jordan', 'they'], ['Sam', 'he'], ['Ava', 'she']]) for (const t of all) for (const v of [t, t.replace(/^\{\{N\}\}/, '{{S}}')]) {
      const now = applyRaw(v, n, PR[p], '5');
      window._pronCaseByPlace = x => x; const old = applyRaw(v, n, PR[p], '5'); window._pronCaseByPlace = keep;
      if (now !== old) changed.add(t);
    }
    return [...changed];
  }, bankAll.toString());
  assert.strictEqual(r.length, 3, r.join('\n'));
  assert.ok(r.every(t => /^(Although|During structured handwriting)/.test(t)), r.join('\n'));
  await page.context().close();
});

test('a lone placeholder keeps the case it was given (typed placeholders are filled one at a time)', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => [applyRaw('{{s}}', 'Ava', PR.she, '5'), applyRaw('{{S}}', 'Ava', PR.she, '5')]);
  assert.deepStrictEqual(r, ['she', 'She']);
  await page.context().close();
});
