// Search (v3.17.26): a Search entry after the last category in General, English and Maths. Finds a sentence in any category,
// adds or removes it exactly as the bank does, and never changes a comment by being looked at.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');

after(closeBrowser);

async function ready() { const page = await openApp(); await seedClass(page); return page; }
async function search(page, q) {
  await page.click('.search-btn');
  await page.fill('#searchInput', q);
  await page.waitForTimeout(400);
}
const names = page => page.$$eval('#sidebar .cat-btn .cat-name', els => els.map(e => e.textContent));
const comment = (page, subj) => page.evaluate(s => commentText(cur(), s), subj);

test('the Search button is the last entry in General, English and Maths, after Closing Statement / Future Directions', async () => {
  const page = await ready();
  let n = await names(page);
  assert.deepStrictEqual(n.slice(-2), ['Closing Statement', 'Search']);
  await page.evaluate(() => setSubject('english')); n = await names(page);
  assert.deepStrictEqual(n.slice(-2), ['Future Directions', 'Search']);
  await page.evaluate(() => setSubject('maths')); n = await names(page);
  assert.deepStrictEqual(n.slice(-2), ['Future Directions', 'Search']);
  await page.context().close();
});

test('a two-word search finds a General sentence under its own category', async () => {
  const page = await ready();
  await search(page, 'classroom each morning');
  const heads = await page.$$eval('#searchResults .search-head', els => els.map(e => e.textContent.trim()));
  assert.ok(heads.includes('Personality'), 'heads: ' + heads);
  const row = await page.$$eval('#searchResults .search-row', els => els.map(e => e.textContent));
  assert.ok(row.some(t => /Sam .*classroom each morning/.test(t) || /classroom each morning/.test(t)));
  assert.strictEqual(await page.textContent('#cTitle'), 'Search');
  await page.context().close();
});

test('clicking a General result adds it, clicking again removes it, and it matches a click in the bank', async () => {
  const page = await ready();
  await page.evaluate(() => { switchStu(3); setSubject('general'); });
  const before = await comment(page, 'general');
  await search(page, 'enters the classroom each day with a smile');
  await page.click('#searchResults .search-row');
  await settle(page);
  const added = await comment(page, 'general');
  assert.notStrictEqual(added, before);
  // the same sentence ticked in the bank on a twin student gives the same words
  const viaBank = await page.evaluate(() => {
    const s = 'Personality', t = RAW[s].find(x => /enters the classroom each day with a smile/.test(x));
    return genSelForm(s, t) !== null;
  });
  assert.ok(viaBank, 'the sentence is ticked in the bank');
  await page.click('#searchResults .search-row');
  await settle(page);
  assert.strictEqual(await comment(page, 'general'), before);
  await page.context().close();
});

test('a result added by Search reads exactly like the same sentence added from the bank', async () => {
  const page = await ready();
  const out = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const t = RAW['Social Skills'].find(x => inSemester(x));
    switchStu(1); setSubject('general'); toggleOpt('Social Skills', t); await wait(50);
    const viaBank = commentText(cur(), 'general');
    toggleOpt('Social Skills', t); await wait(50);
    return { viaBank, t };
  });
  await page.evaluate(() => { switchStu(1); setSubject('general'); });
  const words = out.t.replace(/\{\{[^}]+\}\}/g, ' ').trim().split(/\s+/).slice(2, 6).join(' ');
  await search(page, words);
  await page.click('#searchResults .search-row[class*="sel"], #searchResults .search-row');
  await settle(page);
  const viaSearch = await comment(page, 'general');
  assert.strictEqual(viaSearch, out.viaBank);
  await page.context().close();
});

test('a sentence kept for the other semester is not offered', async () => {
  const page = await ready();
  const s2only = await page.evaluate(() => RAW['Closing Statement'][15].replace(/\{\{[^}]+\}\}/g, '').trim().split(/\s+/).slice(0, 6).join(' '));
  await page.evaluate(() => setSubject('general'));
  assert.strictEqual(await page.evaluate(() => currentSemester), 1);
  await search(page, 'final year of primary school');
  assert.ok(await page.$('#searchNone'), 'Semester 1 hides the end-of-year closers: ' + s2only);
  await page.context().close();
});

test('typed text with markup shows as text, never as markup', async () => {
  const page = await ready();
  await page.evaluate(() => { const s = cur(); s.custom = s.custom || {}; s.customTiers = s.customTiers || {}; s.custom['Personality'] = ['<b>Bold</b> <img src=x onerror="window.__x=1"> {{N}} zebra moment.']; s.customTiers['Personality'] = ['strong']; });
  await search(page, 'zebra');
  assert.strictEqual((await page.$$('#searchResults b, #searchResults img')).length, 0);
  const t = await page.textContent('#searchResults .search-row');
  assert.ok(t.includes('<b>Bold</b>'), t);
  assert.strictEqual(await page.evaluate(() => window.__x), undefined);
  await page.context().close();
});

test('the query and the focus survive a click, and nothing is saved by looking', async () => {
  const page = await ready();
  await page.evaluate(() => { switchStu(2); setSubject('general'); });
  const keys = await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort()));
  await search(page, 'smile');
  await page.focus('#searchInput');
  await page.click('#searchResults .search-row');
  await settle(page);
  assert.strictEqual(await page.inputValue('#searchInput'), 'smile');
  const focused = await page.evaluate(() => document.activeElement && (document.activeElement.classList.contains('search-row') || document.activeElement.id === 'searchInput'));
  assert.ok(focused);
  const after = await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort()));
  assert.strictEqual(after, keys, 'no new fields on the student');
  await page.context().close();
});

test('a click on a category closes Search, and so does switching subject', async () => {
  const page = await ready();
  await search(page, 'smile');
  await page.click('#sidebar .cat-btn:not(.search-btn)');
  assert.strictEqual(await page.evaluate(() => _searchOpen), false);
  assert.notStrictEqual(await page.textContent('#cTitle'), 'Search');
  await page.click('.search-btn'); assert.strictEqual(await page.evaluate(() => _searchOpen), true);
  await page.evaluate(() => setSubject('english'));
  assert.strictEqual(await page.evaluate(() => _searchOpen), false);
  await page.context().close();
});

test('English and Maths: a result adds the sentence as the bank does, and future directions can be found', async () => {
  const page = await ready();
  for (const subj of ['english', 'maths']) {
    const out = await page.evaluate(async subj => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      switchStu(4); setSubject(subj); setView('build'); setCurFD([]);   // the class fixture already holds two future directions, which is the limit
      const bank = getBank(), cats = getCatList().filter(c => c !== 'Future Directions' && c !== 'Below Expectations' && c !== 'Introduction');
      let pick = null;
      for (const c of cats) { const r = yearAllGrades(bank[c] || {}); for (const g of GRADE_ORDER) { const s = (r[g] || [])[0]; if (s && !pick) pick = { c, s }; } }
      const fd = (subj === 'english' ? ENGLISH_FD : MATHS_FD); const strand = Object.keys(fd)[0]; const fdText = fd[strand]['Stage 3'][0];
      const text = applyRaw(pick.s, cn(cur()), PR[cur().pronoun], yrA(cur(), subj));
      return { pick, text, fdText, before: commentText(cur(), subj) };
    }, subj);
    const words = out.text.split(/\s+/).slice(2, 6).join(' ');
    await search(page, words);
    const heads = await page.$$eval('#searchResults .search-head', els => els.map(e => e.textContent.trim()));
    assert.ok(heads.includes(out.pick.c), subj + ' heads ' + heads + ' want ' + out.pick.c);
    const tick = await page.evaluate(pick => subjSelectedForm(getSubjSelected()[pick.c], pick.s) !== null, out.pick);
    await page.click('#searchResults .search-row'); await settle(page);
    const on = await page.evaluate(pick => subjSelectedForm(getSubjSelected()[pick.c], pick.s) !== null, out.pick);
    assert.ok(on !== tick, subj + ': one click changed whether the sentence is in the comment');
    // future directions
    await page.fill('#searchInput', out.fdText.split(/\s+/).slice(0, 4).join(' ')); await page.waitForTimeout(400);
    const fdHeads = await page.$$eval('#searchResults .search-head', els => els.map(e => e.textContent.trim()));
    assert.ok(fdHeads.includes('Future Directions'), subj + ' fd heads ' + fdHeads);
    await page.click('#searchResults .search-row:has-text("' + out.fdText.slice(0, 20).replace(/"/g, '\\"') + '")'); await settle(page);
    assert.ok(await page.evaluate(t => getCurFD().includes(t), out.fdText), subj + ': future direction chosen');
  }
  await page.context().close();
});

test('English with no year shows the year hint', async () => {
  const page = await ready();
  await page.evaluate(() => { switchStu(0); setSubject('english'); cur().year = ''; });
  await page.click('.search-btn');
  assert.ok(await page.$('#noYearHint'));
  await page.context().close();
});

test('with two future directions chosen, another one found by Search is locked, as in the picker', async () => {
  const page = await ready();
  const t = await page.evaluate(() => { switchStu(4); setSubject('english'); const fd = getCurFD(); const other = Object.values(ENGLISH_FD).flatMap(st => st['Stage 3']).find(x => !fd.includes(x)); return { n: fd.length, other }; });
  assert.strictEqual(t.n, 2);
  await search(page, t.other.split(/\s+/).slice(0, 4).join(' '));
  const cls = await page.$eval('#searchResults .search-row', e => e.className);
  assert.ok(/opts-locked/.test(cls), cls);
  await page.context().close();
});
