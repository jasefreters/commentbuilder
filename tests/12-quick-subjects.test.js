// English and Maths: characteristics data, Quick mode and Swap in Review (v3.17.30).
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, openReview, changeInReview, closeBrowser } = require('./helpers');

after(closeBrowser);

async function ready() { const page = await openApp(); await seedClass(page); return page; }
// open student 0 in a subject on a strand with a mark set and nothing picked in that subject
async function prep(page, subj, cat, grade) {
  await page.evaluate(([subj, cat, grade]) => {
    switchStu(0); setSubject(subj);
    const s = cur(), sel = getSubjSelected(); Object.keys(sel).forEach(c => (sel[c] || []).slice().forEach(k => toggleSubjOpt(c, k)));
    s[subj === 'english' ? 'engFD' : 'mathFD'] = [];
    const g = subj === 'english' ? (s.engGrades = s.engGrades || {}) : (s.mathGrades = s.mathGrades || {});
    Object.keys(g).forEach(k => delete g[k]); if (grade) g[cat] = [grade];
    currentTab = cat; _quickEnd = false; _quickFull = false; render();
  }, [subj, cat, grade]);
}
const chips = page => page.$$eval('#quickPanel .quick-chip', els => els.map(e => ({ t: e.textContent.replace('✓ ', ''), on: e.classList.contains('on'), id: e.dataset.trait })));
const picks = (page, cat) => page.evaluate(c => (getSubjSelected()[c] || []).slice(), cat);
async function quickOn(page) { await page.evaluate(() => setQuick(true)); await settle(page, 100); }

test('every English and Maths skill comment has exactly one group, with the bank words, and the banks are untouched', async () => {
  const page = await ready();
  const d = await page.evaluate(async () => {
    const enc = s => new TextEncoder().encode(s);
    const hex = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s)))).map(x => x.toString(16).padStart(2, '0')).join('');
    const problems = [], seenAll = [];
    [['english', ENGLISH_BANK], ['maths', MATHS_BANK]].forEach(([sj, bank]) => {
      Object.keys(SUBJ_TRAITS[sj]).forEach(cat => {
        const U = (bank[cat] || {}).U || [], count = {};
        SUBJ_TRAITS[sj][cat].forEach(t => { if (!t.sentences.length) problems.push('empty ' + cat + ' ' + t.id); t.sentences.forEach(s => { count[s] = (count[s] || 0) + 1; if (!U.includes(s)) problems.push('not in bank: ' + s.slice(0, 50)); seenAll.push(s); }); });
        Object.entries(count).forEach(([s, n]) => { if (n !== 1) problems.push('twice: ' + s.slice(0, 50)); });
      });
    });
    return { problems, total: seenAll.length, hash: await hex(JSON.stringify([ENGLISH_BANK, MATHS_BANK])), cats: [Object.keys(SUBJ_TRAITS.english).length, Object.keys(SUBJ_TRAITS.maths).length] };
  });
  assert.deepStrictEqual(d.problems, []);
  assert.strictEqual(d.total, 520);
  assert.deepStrictEqual(d.cats, [7, 10]);
  // SHA-256 of JSON.stringify([ENGLISH_BANK, MATHS_BANK]) on main when the groups were approved (15 Nov 2026), updated 16 Nov 2026 for the eight final-check rewordings (v3.17.39).
  assert.strictEqual(d.hash, '759894f7cdab59bc0673c1f58d6ed1c68710c1c670600da03af2d52cc510973a', 'the English and Maths banks were changed; update this value and give the new sentence a group');
  await page.context().close();
});

test('the Vocabulary, Literature and Chance sentences are all grouped (the approved groups)', async () => {
  const page = await ready();
  const miss = await page.evaluate(() => {
    const out = [];
    [['english', ENGLISH_BANK, 'Vocabulary'], ['english', ENGLISH_BANK, 'Understanding and Responding to Literature'], ['maths', MATHS_BANK, 'Chance']].forEach(([sj, b, c]) => b[c].U.forEach(s => { if (!SUBJ_SENT_TRAIT[sj][s]) out.push(s); }));
    return out;
  });
  assert.deepStrictEqual(miss, []);
  await page.context().close();
});

test('Quick mode switch shows in English and Maths and shows a skill button for each skill in the strand', async () => {
  const page = await ready();
  await prep(page, 'english', 'Reading Comprehension', 'C'); await quickOn(page);
  assert.ok(await page.isVisible('#quickBtn'));
  const c = await chips(page);
  assert.ok(c.length >= 3, 'skill buttons are shown');
  await prep(page, 'maths', 'Additive Relations', 'C');
  assert.ok((await chips(page)).length >= 3);
  await page.context().close();
});

test('tapping a skill picks one comment of that skill the way a click would, and tapping again takes it out', async () => {
  const page = await ready();
  await prep(page, 'english', 'Reading Comprehension', 'C'); await quickOn(page);
  const c = (await chips(page))[0];
  await page.click('#quickPanel .quick-chip[data-trait="' + c.id + '"]'); await settle(page, 100);
  const p = await picks(page, 'Reading Comprehension');
  assert.strictEqual(p.length, 1);
  assert.ok(await page.evaluate(([k, id]) => SUBJ_SENT_TRAIT.english[k].id === id, [p[0], c.id]), 'the sentence belongs to that skill');
  assert.ok(await page.evaluate(k => getSubjOrdered().includes(k), p[0]), 'it is in the comment order');
  assert.ok((await chips(page)).find(x => x.id === c.id).on);
  await page.click('#quickPanel .quick-chip[data-trait="' + c.id + '"]'); await settle(page, 100);
  assert.deepStrictEqual(await picks(page, 'Reading Comprehension'), []);
  assert.ok(!(await page.evaluate(k => getSubjOrdered().includes(k), p[0])));
  await page.context().close();
});

test('the pick follows the year and the mark: it is always one the usual list offers', async () => {
  const page = await ready();
  for (const [subj, cat] of [['english', 'Creating Written Texts'], ['maths', 'Data'], ['maths', 'Chance'], ['english', 'Vocabulary']]) {
    await prep(page, subj, cat, 'B'); await quickOn(page);
    const c = await chips(page);
    for (const x of c.slice(0, 3)) {
      await page.click('#quickPanel .quick-chip[data-trait="' + x.id + '"]'); await settle(page, 60);
    }
    const ok = await page.evaluate(([cat]) => { const elig = new Set(_quickSubjElig(cat)); return (getSubjSelected()[cat] || []).every(k => elig.has(k)); }, [cat]);
    assert.ok(ok, subj + ' ' + cat);
  }
  await page.context().close();
});

test('with no mark set it asks for one, and the answer is the strand mark', async () => {
  const page = await ready();
  await prep(page, 'maths', 'Data', null); await quickOn(page);
  assert.strictEqual(await page.$$eval('#quickPanel .quick-chip[data-grade]', e => e.length), 5);
  await page.click('#quickPanel .quick-chip[data-grade="C"]'); await settle(page, 100);
  assert.deepStrictEqual(await page.evaluate(() => getCurGrade('Data')), ['C']);
  assert.ok((await chips(page)).length >= 1);
  await page.context().close();
});

test('with no year it says so instead of offering skills', async () => {
  const page = await ready();
  await prep(page, 'english', 'Reading Comprehension', 'C'); await quickOn(page);
  await page.evaluate(() => { cur().year = ''; render(); });
  assert.strictEqual((await chips(page)).length, 0);
  assert.ok((await page.textContent('#quickPanel')).includes('year'));
  await page.context().close();
});

test('Introduction, Below Expectations and Future Directions keep their usual lists; the last strand ends at a screen with Future directions', async () => {
  const page = await ready();
  await prep(page, 'english', 'Introduction', 'C'); await quickOn(page);
  assert.strictEqual(await page.$('#quickPanel'), null);
  assert.ok(await page.$('.quick-strip'));
  await page.evaluate(() => { currentTab = 'Handwriting & Digital Transcription'; render(); });
  await page.evaluate(() => quickGo(1)); await settle(page, 100);
  assert.ok((await page.textContent('#quickPanel')).includes('Future directions'));
  await page.evaluate(() => { _quickEnd = false; currentTab = 'Future Directions'; render(); });
  assert.strictEqual(await page.$('#quickPanel'), null);
  await page.context().close();
});

test('with Quick mode off English and Maths Build is as before', async () => {
  const page = await ready();
  await prep(page, 'english', 'Reading Comprehension', 'C');
  assert.strictEqual(await page.$('#quickPanel'), null);
  assert.ok((await page.$$('#optsGrid .opt')).length > 3);
  await page.context().close();
});

for (const [subj, cat] of [['english', 'Reading Comprehension'], ['maths', 'Additive Relations']]) {
  test('Swap in Review works in ' + subj + ' and keeps the rest of the comment', async () => {
    const page = await ready();
    await prep(page, subj, cat, 'C'); await quickOn(page);
    const c = await chips(page);
    await page.click('#quickPanel .quick-chip[data-trait="' + c[0].id + '"]'); await settle(page, 80);
    await page.click('#quickPanel .quick-chip[data-trait="' + c[1].id + '"]'); await settle(page, 80);
    const name = await page.evaluate(() => cur().name);
    await openReview(page, name, subj);
    const before = await page.$$eval('#pubContent p.pub-para:not(.fd-para) span[data-pi][data-si]', e => e.map(x => x.textContent.trim()));
    const ordBefore = await page.evaluate(() => getSubjOrdered().slice());
    await page.evaluate(() => swapSentence(document.querySelector('#pubContent p.pub-para:not(.fd-para) span[data-pi][data-si]')));
    await settle(page);
    const after = await page.$$eval('#pubContent p.pub-para:not(.fd-para) span[data-pi][data-si]', e => e.map(x => x.textContent.trim()));
    const ordAfter = await page.evaluate(() => getSubjOrdered().slice());
    assert.strictEqual(after.length, before.length);
    assert.notStrictEqual(after[0], before[0]);
    assert.deepStrictEqual(after.slice(1), before.slice(1));
    assert.strictEqual(ordAfter.length, ordBefore.length);
    assert.strictEqual(new Set(ordAfter).size, ordAfter.length);
    assert.ok(await page.evaluate(([a, b, sj]) => { const x = SUBJ_SENT_TRAIT[sj][a], y = SUBJ_SENT_TRAIT[sj][b]; return x.cat === y.cat && x.id === y.id; }, [ordBefore[0], ordAfter[0], subj]), 'same skill');
    await page.context().close();
  });
}

test('a reworded English sentence is not swapped, and future directions have no Swap', async () => {
  const page = await ready();
  await prep(page, 'english', 'Reading Comprehension', 'C'); await quickOn(page);
  const c = await chips(page);
  await page.click('#quickPanel .quick-chip[data-trait="' + c[0].id + '"]'); await settle(page, 80);
  const name = await page.evaluate(() => cur().name);
  await openReview(page, name, 'english');
  await changeInReview(page, 0, ' and always'); await settle(page);
  const before = await page.$$eval('#pubContent span[data-pi][data-si]', e => e.map(x => x.textContent.trim()));
  await page.evaluate(() => swapSentence(document.querySelector('#pubContent p.pub-para:not(.fd-para) span[data-pi][data-si]')));
  await settle(page);
  assert.deepStrictEqual(await page.$$eval('#pubContent span[data-pi][data-si]', e => e.map(x => x.textContent.trim())), before);
  await page.context().close();
});

// v3.17.34: change the mark on the groups screen itself
const marks = page => page.$$eval('#quickPanel .quick-mk', els => els.map(e => ({ g: e.dataset.grade, on: e.classList.contains('on') })));
for (const subj of ['english', 'maths']) {
  test('Quick mode ' + subj + ': the mark row shows the mark, a tap changes it in place and leaves exactly one mark', async () => {
    const page = await ready();
    const cat = await page.evaluate(s => Object.keys(SUBJ_TRAITS[s]).find(c => c !== 'Introduction'), subj);
    await prep(page, subj, cat, 'B'); await quickOn(page);
    let m = await marks(page); assert.deepStrictEqual(m.map(x => x.g), ['A', 'B', 'C', 'D', 'E']); assert.deepStrictEqual(m.filter(x => x.on).map(x => x.g), ['B']);
    await page.click('#quickPanel .quick-mk[data-grade="D"]'); await settle(page, 100);
    assert.deepStrictEqual(await page.evaluate(c => getCurGrade(c), cat), ['D']);
    m = await marks(page); assert.deepStrictEqual(m.filter(x => x.on).map(x => x.g), ['D']);
    await page.click('#quickPanel .quick-mk[data-grade="D"]'); await settle(page, 100);
    assert.deepStrictEqual(await page.evaluate(c => getCurGrade(c), cat), ['D'], 'tapping the chosen mark again does not clear it');
    await page.context().close();
  });
}

test('Quick mode: with no mark set a note asks for one, and choosing it clears the note', async () => {
  const page = await ready();
  const cat = await page.evaluate(() => Object.keys(SUBJ_TRAITS.english).find(c => c !== 'Introduction'));
  await prep(page, 'english', cat, null); await quickOn(page);
  await page.evaluate(c => { _quickMarkAsked[(cur().uid || currentIdx) + '|english|' + c] = true; render(); }, cat);
  assert.ok(await page.$('#quickPanel .quick-warn'));
  await page.click('#quickPanel .quick-mk[data-grade="C"]'); await settle(page, 100);
  assert.strictEqual(await page.$('#quickPanel .quick-warn'), null);
  await page.context().close();
});
