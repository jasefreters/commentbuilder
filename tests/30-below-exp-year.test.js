// Below Expectations (v3.18.2): a sentence that names the year the work is at says "the beginning of Year [Y]", and [Y] is the
// year the teacher picks. It is never filled with the student's own year. Comments built with the older wording still count as picked.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, closeBrowser } = require('./helpers');

after(closeBrowser);

test('no Below Expectations sentence uses the student\'s own year for the working year', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const out = [];
    [ENGLISH_BANK, MATHS_BANK].forEach(b => (b['Below Expectations'].U || []).forEach(s => {
      const rest = s.replace(/below Year \[X\]/g, '');
      if (/Year \[X\]/.test(rest)) out.push(s);
      if (/Year \[Y\]/.test(s) && !/the beginning of Year \[Y\]/.test(s)) out.push(s);
    }));
    return out;
  });
  assert.deepStrictEqual(r, []);
  await page.context().close();
});

test('the working year stays Year [Y] until picked, then reads "the beginning of Year 3"', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const s = MATHS_BANK['Below Expectations'].U.find(x => /aligns with the beginning of Year \[Y\] outcomes/.test(x));
    return [applyRaw(s, 'Ava', PR.she, '5'), applyRaw(s, 'Ava', PR.she, '5|3'), applyRaw(s, 'Ava', PR.she, '5|K')];
  });
  assert.match(r[0], /aligns with the beginning of Year \[Y\] outcomes\.$/);
  assert.doesNotMatch(r[0], /Year 5/);
  assert.match(r[1], /aligns with the beginning of Year 3 outcomes\.$/);
  assert.match(r[2], /aligns with the beginning of Kindergarten outcomes\.$/);
  await page.context().close();
});

test('a comment built with the older wording still shows as picked', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(() => {
    const old = '{{S}} is working significantly below stage expectations and is developing {{pos}} Mathematics skills at a Year [X] level.';
    const nw = MATHS_BANK['Below Expectations'].U.find(x => /developing \{\{pos\}\} Mathematics skills in line with the beginning/.test(x));
    return { found: !!nw, picked: subjHas([old], nw) };
  });
  assert.ok(r.found);
  assert.ok(r.picked);
  await page.context().close();
});
