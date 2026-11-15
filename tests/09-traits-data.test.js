// General characteristics (v3.17.27): every General sentence sits in exactly one characteristic, the lists use the bank's exact
// words, and the bank itself was not touched by adding them.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');

after(closeBrowser);

// SHA-256 of JSON.stringify(RAW) when the groups were approved (15 Nov 2026, v3.17.27).
// If the General bank is changed on purpose, update this value and place the new sentence in a characteristic in the same change.
const RAW_HASH = 'bf3f1abc54c0ae9a52e0fb3967d59cbd7f008c4b135bca9526a7a183734a5539';

async function data() {
  const page = await openApp();
  const d = await page.evaluate(async () => {
    const enc = new TextEncoder().encode(JSON.stringify(RAW));
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc))).map(x => x.toString(16).padStart(2, '0')).join('');
    return { hash: h, RAW, TR: GEN_TRAITS, ST: SENT_TRAIT, cats: CATS };
  });
  await page.context().close();
  return d;
}

test('every string in GEN_TRAITS is a sentence of that category in RAW', async () => {
  const d = await data();
  const bad = [];
  Object.entries(d.TR).forEach(([cat, ts]) => ts.forEach(t => t.sentences.forEach(s => { if (!(d.RAW[cat] || []).includes(s)) bad.push(cat + ': ' + s.slice(0, 60)); })));
  assert.deepStrictEqual(bad, []);
});

test('every RAW sentence is in exactly one characteristic', async () => {
  const d = await data();
  const problems = [];
  d.cats.forEach(cat => {
    const seen = {};
    (d.TR[cat] || []).forEach(t => t.sentences.forEach(s => { seen[s] = (seen[s] || 0) + 1; }));
    d.RAW[cat].forEach(s => { if (seen[s] !== 1) problems.push(cat + ' (' + (seen[s] || 0) + '): ' + s.slice(0, 60)); });
  });
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual(Object.keys(d.TR), d.cats, 'every category, in the bank order');
});

test('ids are unique in a category, labels are set, and no characteristic is empty', async () => {
  const d = await data();
  Object.entries(d.TR).forEach(([cat, ts]) => {
    const ids = ts.map(t => t.id);
    assert.strictEqual(new Set(ids).size, ids.length, cat + ' ids');
    ts.forEach(t => { assert.ok(t.label && t.label.trim(), cat + ' label'); assert.ok(/^[a-z0-9-]+$/.test(t.id), cat + ' id ' + t.id); assert.ok(t.sentences.length > 0, cat + ' / ' + t.label + ' is empty'); });
  });
});

test('SENT_TRAIT finds the characteristic of every General sentence', async () => {
  const d = await data();
  let n = 0;
  d.cats.forEach(cat => d.RAW[cat].forEach(s => {
    n++;
    const t = d.ST[s]; assert.ok(t, 'no characteristic: ' + s.slice(0, 60));
    assert.strictEqual(t.cat, cat);
    assert.ok(d.TR[cat].some(x => x.id === t.id && x.sentences.includes(s)));
  }));
  assert.strictEqual(n, 184);
});

test('the General bank (RAW) is exactly as it was when the groups were approved', async () => {
  const d = await data();
  assert.strictEqual(d.hash, RAW_HASH);
});
