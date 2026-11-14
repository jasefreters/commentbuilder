const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, seedClass, snapshot, closeBrowser } = require('./helpers');
after(closeBrowser);

test('the made-up class builds, and every comment belongs to its own student', async () => {
  const page = await openApp(); await seedClass(page);
  const snap = await snapshot(page);
  const names = ['Sam', 'Ava', 'Jordan', 'Mia', 'Ruby-Lee', 'Tom'];
  assert.equal(Object.keys(snap).length, 18);
  for (const [key, text] of Object.entries(snap)) {
    const owner = key.split('|')[0];
    assert.ok(text && text.length > 80, key + ' has a comment');
    assert.ok(text.includes(owner), key + ' names its own student');
    for (const other of names) if (other !== owner) assert.ok(!new RegExp('\\b' + other + '\\b').test(text), key + ' does not name ' + other);
    assert.ok(!/\{\{|\}\}|\[X\]/.test(text), key + ' has no unfilled placeholders');
    assert.ok(!/[a-z0-9][.!?][A-Z]/.test(text), key + ' has no sentences glued together');
  }
  assert.equal(new Set(Object.values(snap)).size, 18, 'all 18 comments are different');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
