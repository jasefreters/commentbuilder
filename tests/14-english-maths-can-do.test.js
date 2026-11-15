// v3.17.33: 24 English and Maths skill comments say what the student can do (no "beginning to", "is developing", "is learning to").
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { openApp, closeBrowser } = require('./helpers');
after(closeBrowser);
const PAIRS = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', 'english-maths-can-do.json'), 'utf8'));

test('each reworded English and Maths comment is in the bank, the old wording is not offered, and the two are linked', async () => {
  const page = await openApp();
  const r = await page.evaluate(pairs => {
    const all = [];
    [ENGLISH_BANK, MATHS_BANK].forEach(b => Object.values(b).forEach(sec => Object.values(sec).forEach(a => a.forEach(t => all.push(t)))));
    return pairs.map(p => ({ n: all.filter(t => t === p.new).length, o: all.filter(t => t === p.old).length, linked: SUBJ_ALIASES[p.new] === p.old, said: /beginning to|is developing|is learning to/i.test(p.new) }));
  }, PAIRS);
  assert.equal(r.length, 24);
  r.forEach((x, i) => { assert.ok(x.n >= 1, 'new wording in the bank: ' + PAIRS[i].new); assert.equal(x.o, 0, 'old wording gone: ' + PAIRS[i].old); assert.ok(x.linked, 'linked: ' + PAIRS[i].new); assert.ok(!x.said, 'wording: ' + PAIRS[i].new); });
  await page.context().close();
});
