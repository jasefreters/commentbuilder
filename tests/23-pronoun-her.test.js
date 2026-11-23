// Pronoun fix plan, Steps 0 and 1 (v3.17.47): one "her" reader. Over every "her" in the banks it is never sure and wrong.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');
const { corpusInPage } = require('./pronoun-corpus');
after(closeBrowser);

test('herRole is never sure and wrong over the bank corpus', async () => {
  const page = await openApp();
  const r = await page.evaluate((src) => {
    const C = (new Function('return ' + src))()();
    const res = C.map(e => ({ e, r: herRole(e.before, e.after) }));
    const bad = res.filter(x => x.r.sure && x.r.role !== x.e.role).map(x => x.e.sentence);
    return { n: C.length, bad, unsure: res.filter(x => !x.r.sure).length };
  }, corpusInPage.toString());
  console.log('# "her" uses in the banks:', r.n, '| not sure:', r.unsure);
  assert.ok(r.n >= 250, 'corpus size ' + r.n);
  assert.deepStrictEqual(r.bad, []);
  await page.context().close();
});

test('herRole reads the teacher-style sentences from the plan', async () => {
  const page = await openApp();
  const T = [['Others respect ', ' because she is kind.', 'obj'], ['Staff give ', ' extra time.', 'obj'], ['Staff give ', ' time to finish.', 'obj'],
    ['I would now like to see ', ' take a more active role.', 'obj'], ['She is keen to show ', ' enthusiasm for reading.', 'poss'], ['She can write ', ' first name.', 'poss'],
    ['Strategies help ', ' learn.', 'obj'], ['I wish ', ' all the best.', 'obj'], ['She tries ', ' best.', 'poss'], ['She shares ', ' ideas.', 'poss'],
    ['Others respect ', '.', 'obj'], ['She uses ', ' own words.', 'poss'], ['Others help ', ' when she is stuck.', 'obj']];
  const r = await page.evaluate((T) => T.map(([b, a]) => herRole(b, a)), T);
  T.forEach(([b, a, want], i) => { assert.strictEqual(r[i].role, want, b + 'her' + a); assert.strictEqual(r[i].sure, true, b + 'her' + a); });
  const u = await page.evaluate(() => herRole('She packs ', ' camera.'));
  assert.strictEqual(u.sure, false);
  await page.context().close();
});
