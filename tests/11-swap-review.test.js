// Swap in Review (v3.17.29): a sentence in a General comment is swapped for another with the same characteristic.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, openReview, changeInReview, closeBrowser } = require('./helpers');

after(closeBrowser);

async function ready() { const page = await openApp(); await seedClass(page); return page; }
const text = page => page.evaluate(() => commentText(cur(), 'general'));
const spanTexts = page => page.$$eval('#pubContent span[data-pi][data-si]', els => els.map(e => e.textContent.trim()));
// clear the student's picks, then pick the first n sentences of one characteristic in each of two categories
async function setup(page, cats = [['Personality', 'kind-and-caring'], ['Effort & Work Habits', null]]) {
  await page.evaluate(cats => {
    switchStu(0); setSubject('general');
    const s = cur(); CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k)));
    cats.forEach(([cat, id]) => {
      const t = GEN_TRAITS[cat].find(x => (id ? x.id === id : quickCandidates(cur(), cat, x, true).length >= 3));
      genAddKey(cat, quickCandidates(cur(), cat, t, false)[0]);
    });
    render();
  }, cats);
  return page.evaluate(() => students[0].name);
}

test('Swap changes one sentence for another of the same characteristic and keeps the rest', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  const before = await spanTexts(page), ordBefore = await page.evaluate(() => cur().ordered.slice());
  assert.strictEqual(before.length, 2);
  await page.evaluate(() => swapSentence(document.querySelector('#pubContent span[data-pi][data-si]')));
  await settle(page);
  const after = await spanTexts(page), ordAfter = await page.evaluate(() => cur().ordered.slice());
  assert.notStrictEqual(after[0], before[0]);
  assert.strictEqual(after[1], before[1], 'the other sentence is untouched');
  assert.strictEqual(ordAfter.length, ordBefore.length);
  assert.strictEqual(ordAfter[1], ordBefore[1]);
  const same = await page.evaluate(([a, b]) => { const x = SENT_TRAIT[a], y = SENT_TRAIT[b]; return x.cat === y.cat && x.id === y.id; }, [ordBefore[0], ordAfter[0]]);
  assert.ok(same, 'same characteristic');
  assert.ok(await page.evaluate(([n, o]) => cur().selected[SENT_CAT[n]].includes(n) && !cur().selected[SENT_CAT[o]].includes(o), [ordAfter[0], ordBefore[0]]), 'the picks list has the new sentence and not the old one');
  assert.strictEqual(await page.evaluate(() => commentText(cur(), 'general').includes(document.querySelector('#pubContent span').textContent.trim())), true, 'the one store has the new words');
  await page.context().close();
});

test('the swap survives leaving Review and coming back, and Build shows the new sentence ticked', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  await page.evaluate(() => swapSentence(document.querySelector('#pubContent span[data-pi][data-si]')));
  await settle(page);
  const swapped = (await spanTexts(page))[0];
  await page.evaluate(() => setView('build')); await settle(page);
  await page.evaluate(() => setView('publish')); await settle(page);
  assert.strictEqual((await spanTexts(page))[0], swapped);
  const ticked = await page.evaluate(() => { const s = cur(); return s.ordered.every(k => genSelForm(SENT_CAT[k], k, s) !== null); });
  assert.ok(ticked);
  await page.context().close();
});

test('pressing Swap again goes on to the next sentence and never repeats one already in the comment', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => swapSentence(document.querySelector('#pubContent span[data-pi][data-si]')));
    await settle(page, 80);
    const o = await page.evaluate(() => cur().ordered.slice());
    assert.strictEqual(new Set(o).size, o.length, 'no sentence twice');
    seen.add(o[0]);
  }
  assert.ok(seen.size >= 2, 'it moves through different sentences');
  await page.context().close();
});

test('a sentence the teacher reworded is not swapped', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  await changeInReview(page, 0, ' and always');
  await settle(page);
  const before = await spanTexts(page), ord = await page.evaluate(() => cur().ordered.slice());
  await page.evaluate(() => swapSentence(document.querySelector('#pubContent span[data-pi][data-si]')));
  await settle(page);
  assert.deepStrictEqual(await spanTexts(page), before);
  assert.deepStrictEqual(await page.evaluate(() => cur().ordered.slice()), ord);
  await page.context().close();
});

test('the Swap button sits outside the comment text, appears on pointing, swaps on click and hides when switched off', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  await page.hover('#pubContent span[data-pi][data-si]');
  await page.waitForSelector('#swapBtn', { state: 'visible' });
  assert.strictEqual(await page.evaluate(() => !!document.getElementById('swapBtn').closest('#pubContent')), false);
  const before = (await spanTexts(page))[0];
  await page.click('#swapBtn'); await settle(page);
  assert.notStrictEqual((await spanTexts(page))[0], before);
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#pubContent #swapBtn').length), 0);
  await page.evaluate(() => setFlag('swapBtn', false)); await settle(page);
  await page.hover('#pubContent span[data-pi][data-si]');
  await settle(page, 150);
  assert.ok(!(await page.isVisible('#swapBtn').catch(() => false)));
  await page.context().close();
});

test('no Swap button in English or Maths Review', async () => {
  const page = await ready();
  await page.evaluate(() => { switchStu(0); setSubject('english'); });
  const name = await page.evaluate(() => students[0].name);
  await openReview(page, name, 'english').catch(() => {});
  await page.hover('#pubContent span[data-pi][data-si]').catch(() => {});
  await settle(page, 150);
  assert.ok(!(await page.isVisible('#swapBtn').catch(() => false)));
  await page.context().close();
});

test('a swap carries the paragraph the teacher chose with it', async () => {
  const page = await ready(); const name = await setup(page);
  await openReview(page, name, 'general');
  await page.evaluate(() => {
    const s = cur(), sp = document.querySelectorAll('#pubContent span[data-pi][data-si]')[1];
    s.paraLayout = { __v: 2, order: null, starts: { [_paraSig(sp.textContent.trim(), s)]: false } };
  });
  const oldSig = await page.evaluate(() => _paraSig(document.querySelectorAll('#pubContent span[data-pi][data-si]')[1].textContent.trim(), cur()));
  await page.evaluate(() => swapSentence(document.querySelectorAll('#pubContent span[data-pi][data-si]')[1]));
  await settle(page);
  const L = await page.evaluate(() => cur().paraLayout.starts);
  assert.ok(!(oldSig in L), 'the old sentence entry is gone');
  assert.strictEqual(Object.values(L).length, 1);
  assert.strictEqual(Object.values(L)[0], false);
  await page.context().close();
});
