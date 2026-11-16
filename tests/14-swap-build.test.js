// Swap in the Build draft box (v3.17.36): same result as Review, only the swapped sentence changes, no markup in the box.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, openReview, closeBrowser } = require('./helpers');

after(closeBrowser);

async function ready() { const page = await openApp(); await seedClass(page); await page.setViewportSize({ width: 1300, height: 900 }); return page; }
// clear student 0's picks in a subject, then pick the first sentence of two different groups
async function setup(page, subj) {
  await page.evaluate(subj => {
    switchStu(0); setSubject(subj); const s = cur();
    if (subj === 'general') CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k)));
    else { const sel = getSubjSelected(); Object.keys(sel).forEach(c => (sel[c] || []).slice().forEach(k => toggleSubjOpt(c, k))); s[subj === 'english' ? 'engFD' : 'mathFD'] = []; s[subj === 'english' ? 'engDraft' : 'mathDraft'] = null; s[subj === 'english' ? 'engDraftEdited' : 'mathDraftEdited'] = false; }
    s.draftOverride = null;
    if (subj === 'general') {
      [['Personality', 'kind-and-caring'], ['Effort & Work Habits', null]].forEach(([cat, id]) => { const t = GEN_TRAITS[cat].find(x => (id ? x.id === id : quickCandidates(cur(), cat, x, true).length >= 3)); genAddKey(cat, quickCandidates(cur(), cat, t, false)[0]); });
    } else {
      const g = subj === 'english' ? (s.engGrades = s.engGrades || {}) : (s.mathGrades = s.mathGrades || {}); Object.keys(g).forEach(k => delete g[k]);
      let n = 0;
      for (const cat of Object.keys(SUBJ_TRAITS[subj])) { if (cat === 'Introduction' || n >= 2) continue; g[cat] = ['B']; const t = SUBJ_TRAITS[subj][cat].find(x => quickSubjCandidates(cur(), cat, x, true).length >= 2); if (t) { toggleSubjOpt(cat, quickSubjCandidates(cur(), cat, t, false)[0]); n++; } }
    }
    render();
  }, subj);
  return page.evaluate(() => students[0].name);
}
const paneText = page => page.evaluate(() => _paneText(document.getElementById('outEditable')));
const store = (page, subj) => page.evaluate(subj => commentText(cur(), subj), subj);

for (const subj of ['general', 'english', 'maths']) {
  test('Build swap gives the same comment as the Review swap (' + subj + ')', async () => {
    const a = await ready(); const name = await setup(a, subj);
    await a.evaluate(() => setView('build')); await settle(a, 200);
    await a.evaluate(() => swapBuildSentence(0)); await settle(a, 200);
    const buildText = await store(a, subj), buildPane = await paneText(a);
    await a.context().close();
    const b = await ready(); await setup(b, subj);
    await openReview(b, name, subj);
    await b.evaluate(() => swapSentence(document.querySelector('#pubContent p.pub-para:not(.fd-para) span[data-pi][data-si]'))); await settle(b, 200);
    const reviewText = await store(b, subj);
    await b.context().close();
    assert.strictEqual(buildText, reviewText);
    assert.ok(buildPane.includes(buildText.split('\n')[0].slice(0, 30)));
  });
}

test('Build swap on a typed-over draft changes only that sentence', async () => {
  const page = await ready(); await setup(page, 'general');
  await page.evaluate(() => setView('build')); await settle(page, 200);
  const before = await page.evaluate(() => { const el = document.getElementById('outEditable'); const t = _paneText(el) + ' Zed also ran a very long race on Tuesday afternoon.'; el.innerText = t; onDraftInput(); return t; });
  await settle(page, 200);
  await page.evaluate(() => swapBuildSentence(0)); await settle(page, 300);
  const after = await paneText(page);
  const bs = before.split(/(?<=[.!?])\s+/), as = after.split(/(?<=[.!?])\s+/);
  assert.strictEqual(as.length, bs.length);
  assert.notStrictEqual(as[0], bs[0]);
  assert.deepStrictEqual(as.slice(1), bs.slice(1), 'every other sentence is byte for byte as it was');
  assert.strictEqual(await page.evaluate(() => cur().draftOverride), after);
  await page.context().close();
});

test('Build swap refuses a sentence the teacher reworded, and leaves the text alone', async () => {
  const page = await ready(); await setup(page, 'general');
  await page.evaluate(() => setView('build')); await settle(page, 200);
  await page.evaluate(() => { const el = document.getElementById('outEditable'); el.innerText = _paneText(el).replace(/^(\S+ \S+ \S+)/, '$1 truly and very much'); onDraftInput(); });
  await settle(page, 200);
  const before = await paneText(page);
  await page.evaluate(() => swapBuildSentence(0)); await settle(page, 200);
  assert.strictEqual(await paneText(page), before);
  assert.ok((await page.textContent('#toast')).includes('edited'));
  await page.context().close();
});

test('the Build box holds no markup after a swap, and the student has no new keys', async () => {
  const page = await ready(); await setup(page, 'general');
  await page.evaluate(() => setView('build')); await settle(page, 200);
  const keys0 = await page.evaluate(() => Object.keys(cur()).sort());
  await page.evaluate(() => swapBuildSentence(0)); await settle(page, 300);
  const kids = await page.evaluate(() => Array.from(document.getElementById('outEditable').children).map(c => c.tagName));
  assert.ok(kids.every(t => t === 'BR'), 'only line breaks: ' + kids);
  const keys1 = await page.evaluate(() => Object.keys(cur()).sort());
  assert.deepStrictEqual(keys1.filter(k => !keys0.includes(k)), []);
  await page.context().close();
});

test('pointing at a sentence in Build shows Swap, the pointer can reach it, and it swaps that sentence only', async () => {
  const page = await ready(); await setup(page, 'general');
  await page.evaluate(() => setView('build')); await settle(page, 300);
  const before = await paneText(page);
  const p = await page.evaluate(() => { const el = document.getElementById('outEditable'); const sents = _buildCore(el).spans; const r = _paneRange(el, sents[0][0], sents[0][0] + 10); const q = r.getClientRects()[0]; return { x: q.left + 4, y: q.top + q.height / 2 }; });
  await page.mouse.move(p.x, p.y); await page.waitForTimeout(300);
  const b = await page.evaluate(() => { const x = document.getElementById('swapBtn'); if (!x || x.style.display !== 'block') return null; const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  assert.ok(b, 'the button shows');
  for (let i = 1; i <= 25; i++) { await page.mouse.move(p.x + (b.x - p.x) * i / 25, p.y + (b.y - p.y) * i / 25); await page.waitForTimeout(25); }
  await page.waitForTimeout(800);
  const b2 = await page.evaluate(() => { const x = document.getElementById('swapBtn'); if (x.style.display !== 'block') return null; const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  assert.deepStrictEqual(b2, b, 'did not move or hide');
  await page.mouse.down(); await page.mouse.up(); await settle(page, 300);
  const after = await paneText(page), bs = before.split(/(?<=[.!?])\s+/), as = after.split(/(?<=[.!?])\s+/);
  assert.notStrictEqual(as[0], bs[0]); assert.deepStrictEqual(as.slice(1), bs.slice(1));
  await page.context().close();
});

test('with the setting off there is no Swap button in Build, and no button on a future direction line', async () => {
  const page = await ready(); await setup(page, 'english');
  await page.evaluate(() => { cur().engFD = ['Zed will practise adding fractions with different denominators.']; render(); setView('build'); }); await settle(page, 300);
  const idx = await page.evaluate(() => { const el = document.getElementById('outEditable'), full = _paneText(el), i = full.indexOf('* '); return { i: i, n: _buildCore(el).sents.length, full }; });
  const hit = await page.evaluate(() => { const el = document.getElementById('outEditable'); const core = _buildCore(el); return core.spans.every(sp => !sp || !_paneText(el).slice(sp[0], sp[1]).startsWith('*')); });
  assert.ok(hit, 'future direction lines are not swappable sentences');
  await page.evaluate(() => { lsSet('rcb_swapbtn', false); });
  await page.evaluate(() => _buildShow(0)); assert.strictEqual(await page.evaluate(() => { const b = document.getElementById('swapBtn'); return b ? b.style.display : 'none'; }), 'none');
  await page.context().close();
});
