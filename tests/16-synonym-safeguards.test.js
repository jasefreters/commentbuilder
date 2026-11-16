// Synonym picker safeguards (v3.17.40): curriculum words are left alone, the request carries the sentence and no name.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, openReview, closeBrowser } = require('./helpers');
after(closeBrowser);

test('curriculum words are protected, ordinary words are not', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => ({
    prot: ['words', 'meaning', 'meanings', 'sentences', 'texts', 'numbers', 'fractions', 'reading', 'writes'].map(isProtectedWord),
    free: ['enthusiastic', 'carefully', 'confident', 'helpful'].map(isProtectedWord),
  }));
  assert.ok(r.prot.every(Boolean), JSON.stringify(r)); assert.ok(r.free.every(x => !x), JSON.stringify(r));
  await page.context().close();
});

test('a protected word repeated in a comment is not marked as a repeat; an ordinary one still is', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const ign = new Set();
    const a = repeatFamilies('Mia reads words with care. Mia spells words and knows word meanings. Mia explains word meanings.', ign).list.map(f => f.key || f.stem);
    const b = repeatFamilies('Mia explores nature happily. Mia explores nature again.', ign).list.length;
    return { a, b };
  });
  assert.ok(!r.a.some(k => /^(word|meaning)/.test(String(k))), JSON.stringify(r.a));
  assert.ok(r.b >= 1);
  await page.context().close();
});

test('learned swaps of curriculum words are dropped on load, others kept, and none are suggested or recorded', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const m = normaliseStyleMemory({ v: 1, pairs: { 'words>terms': { from: 'words', to: 'terms', n: 6, last: 1 }, 'help>assist': { from: 'help', to: 'assist', n: 2, last: 1 } }, blocked: {} });
    styleMemory = m; _sugIndex = null;
    const rec = recordStyleSwap('meaning', 'sense', students[0] || { name: 'Mia' }, 'english');
    return { keys: Object.keys(m.pairs), rec, sug: styleSugFor('words') };
  });
  assert.deepStrictEqual(r.keys, ['help>assist']); assert.strictEqual(r.rec, false); assert.strictEqual(r.sug, null);
  await page.context().close();
});

test('the synonym request holds the whole sentence and not the student name, and a protected word makes no request', async () => {
  const page = await openApp(); await seedClass(page);
  const name = await page.evaluate(() => students[0].name);
  await openReview(page, name, 'general');
  const r = await page.evaluate(async () => {
    let calls = []; anthropicFetch = async body => { calls.push(JSON.stringify(body)); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '["quickly"]' }] }) }; };
    const sp = document.querySelector('#pubContent span[data-si]'); const nm = cn(cur());
    sp.textContent = nm + ' works carefully with words and numbers.';
    const mk = document.createElement('span'); mk.className = 'dup-word'; mk.dataset.word = 'carefully'; mk.textContent = 'carefully'; sp.appendChild(mk);
    document.getElementById('synPanel') || null;
    await showSynonymsPanel('carefully', mk);
    const first = calls.slice();
    await showSynonymsPanel('words', mk);
    return { first, total: calls.length, nm, msg: document.getElementById('synList').textContent };
  });
  assert.strictEqual(r.first.length, 1);
  assert.ok(r.first[0].includes('works carefully with words'), 'has the sentence');
  assert.ok(!r.first[0].includes(r.nm), 'has no student name');
  assert.strictEqual(r.total, 1, 'protected word made no request');
  assert.match(r.msg, /curriculum word/);
  await page.context().close();
});
