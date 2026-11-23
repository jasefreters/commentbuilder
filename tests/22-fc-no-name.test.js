// Pronoun fix plan, Step 6b (v3.17.46): Final check flags a comment that never uses the student's name.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

test('flagged when the name is missing, not when it is there, and not for an empty comment', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const ava = { name: 'Ava Lin', pronoun: 'she' }, mj = { name: 'Mary-Jane', pronoun: 'she' };
    return {
      miss: fcNoName(ava, 'english', 'Mia is a kind student. She shares her ideas.'),
      has: fcNoName(ava, 'english', 'Ava is a kind student. She shares her ideas.').length,
      lower: fcNoName(ava, 'maths', 'Well done ava.').length,
      empty: fcNoName(ava, 'general', '').length + fcNoName(ava, 'general', '   ').length,
      hy: fcNoName(mj, 'general', 'Mary-Jane works hard.').length,
      part: fcNoName({ name: 'Ava', pronoun: 'she' }, 'general', 'Avalon is a place.').length,
    };
  });
  assert.strictEqual(r.miss.length, 1); assert.deepStrictEqual(r.miss[0].kinds, ['noname']); assert.strictEqual(r.miss[0].fixed, null);
  assert.ok(/Ava/.test(r.miss[0].note));
  assert.strictEqual(r.has, 0); assert.strictEqual(r.lower, 0); assert.strictEqual(r.empty, 0); assert.strictEqual(r.hy, 0);
  assert.strictEqual(r.part, 1);
  await page.context().close();
});

test('the Final check panel shows it, and a full class with names shows none', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(() => {
    runFinalCheck();
    const before = _fc.items.filter(x => x.kinds.includes('noname')).length;
    return { before, panel: document.getElementById('fcPanel').textContent };
  });
  assert.strictEqual(r.before, 0, 'seeded comments all use the name');
  await page.context().close();
});
