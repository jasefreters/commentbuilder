// Quick mode for General (v3.17.28): a switch (off unless turned on). One screen per category with a chip for each characteristic.
// Tapping a chip picks a sentence the way a bank click would; tapping again takes it out. Nothing but the switch is saved.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');

after(closeBrowser);

async function ready() { const page = await openApp(); await seedClass(page); return page; }
const text = (page, i = 0) => page.evaluate(i => commentText(students[i], 'general'), i);
async function quickOn(page) { await page.click('#quickBtn'); await settle(page, 100); }
async function gotoCat(page, cat) { await page.evaluate(c => { currentTab = c; render(); }, cat); }
const chips = page => page.$$eval('#quickPanel .quick-chip', els => els.map(e => ({ t: e.textContent.replace('✓ ', ''), on: e.classList.contains('on'), id: e.dataset.trait })));
// open student i in General at a level, with no General sentences picked (the class fixture picks some for everyone)
async function prep(page, i, lv) {
  await page.evaluate(([i, lv]) => { switchStu(i); setSubject('general'); if (lv) onGenLevel(currentIdx, lv); const s = cur(); CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k))); render(); }, [i, lv]);
}

test('Quick mode is off by default, shows in every subject, and switching it on and off leaves the bank as it was', async () => {
  const page = await ready();
  assert.strictEqual(await page.getAttribute('#quickBtn', 'aria-checked'), 'false');
  assert.ok(await page.isVisible('#quickBtn'));
  assert.strictEqual(await page.$('#quickPanel'), null);
  const bankBefore = await page.$eval('#optsGrid', e => e.innerHTML);
  await quickOn(page);
  assert.ok(await page.$('#quickPanel'));
  await page.click('#quickBtn'); await settle(page, 100);
  assert.strictEqual(await page.$eval('#optsGrid', e => e.innerHTML), bankBefore, 'the usual list is exactly as before');
  await page.evaluate(() => setSubject('english')); assert.ok(await page.isVisible('#quickBtn'));
  await page.evaluate(() => setSubject('maths')); assert.ok(await page.isVisible('#quickBtn'));
  await page.context().close();
});

test('with Quick mode off, Build, Search and the saved student are as before', async () => {
  const page = await ready();
  const keys = await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort()));
  await page.evaluate(() => { currentTab = 'Personality'; render(); });
  assert.ok((await page.$$('#optsGrid .opt')).length > 10);
  assert.strictEqual(await page.$('.quick-strip'), null);
  await page.click('.search-btn'); assert.ok(await page.$('#searchInput'));
  assert.strictEqual(await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort())), keys);
  await page.context().close();
});

test('the Settings switch and the Build switch are the same setting', async () => {
  const page = await ready();
  await page.evaluate(() => renderMoreSettings());
  assert.strictEqual(await page.$eval('[data-flag="quickMode"]', e => e.getAttribute('aria-checked')), 'false');
  await page.evaluate(() => setQuick(true));
  assert.strictEqual(await page.getAttribute('#quickBtn', 'aria-checked'), 'true');
  assert.strictEqual(await page.$eval('[data-flag="quickMode"]', e => e.getAttribute('aria-checked')), 'true');
  await page.context().close();
});

test('with no level set, the first screen asks for one, and the answer is the student’s level', async () => {
  const page = await ready();
  await page.evaluate(() => { delete cur().generalLevel; _quickLevelAsked = null; });
  await quickOn(page);
  assert.ok(/Before you start/.test(await page.textContent('#quickPanel')));
  await page.click('#quickPanel .quick-chip:has-text("Average")'); await settle(page, 100);
  assert.strictEqual(await page.evaluate(() => cur().generalLevel), 'average');
  assert.ok(/1 of 15/.test(await page.textContent('#quickPanel .quick-prog')));
  await page.context().close();
});

test('a tap picks one sentence of that characteristic at the student’s level, and a second tap takes it out', async () => {
  const page = await ready();
  await prep(page, 3, 'strong');
  await quickOn(page); await gotoCat(page, 'Personality');
  const before = await page.evaluate(() => JSON.stringify(cur().selected['Personality'] || []));
  const c = (await chips(page)).find(x => x.t === 'Kind and caring');
  await page.click('#quickPanel .quick-chip[data-trait="kind-and-caring"]'); await settle(page, 100);
  const r = await page.evaluate(() => {
    const t = GEN_TRAITS['Personality'].find(x => x.id === 'kind-and-caring');
    const mine = t.sentences.filter(s => genSelForm('Personality', s, cur()) !== null);
    return { n: mine.length, tier: mine.map(s => _tierOfRaw('Personality', s)) };
  });
  assert.strictEqual(r.n, 1); assert.deepStrictEqual(r.tier, ['strong']);
  assert.ok((await chips(page)).find(x => x.id === 'kind-and-caring').on);
  await page.click('#quickPanel .quick-chip[data-trait="kind-and-caring"]'); await settle(page, 100);
  assert.strictEqual(await page.evaluate(() => JSON.stringify(cur().selected['Personality'] || [])), before);
  assert.ok(c);
  await page.context().close();
});

test('a full run gives only sentences from the ticked characteristics, and the same picks in the bank read identically', async () => {
  const page = await ready();
  const out = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    switchStu(5); setSubject('general'); onGenLevel(currentIdx, 'average'); { const s0 = cur(); CATS.forEach(c => (s0.selected[c] || []).slice().forEach(k => genRemoveKey(c, k))); } setQuick(true);
    const stu = cur(); const ticked = [];
    for (const cat of CATS) {
      currentTab = cat; render();
      const first = document.querySelector('#quickPanel .quick-chip');
      if (first) { ticked.push([cat, first.dataset.trait]); first.click(); await wait(20); }
    }
    const viaQuick = commentText(stu, 'general');
    const picked = []; CATS.forEach(cat => (stu.selected[cat] || []).forEach(k => picked.push([cat, k])));
    const allInTicked = picked.every(([cat, k]) => k.startsWith('__custom__') || ticked.some(([c, id]) => c === cat && GEN_TRAITS[cat].find(t => t.id === id).sentences.includes(k)));
    // take everything out, then add the same sentences by clicking the bank rows (toggleOpt)
    picked.slice().reverse().forEach(([cat, k]) => { if (!k.startsWith('__custom__')) toggleOpt(cat, k); });
    const emptied = commentText(stu, 'general');
    picked.forEach(([cat, k]) => { if (!k.startsWith('__custom__')) toggleOpt(cat, k); });
    return { n: ticked.length, picked: picked.length, allInTicked, viaQuick, viaBank: commentText(stu, 'general'), emptied };
  });
  assert.ok(out.n >= 8, 'ticked ' + out.n);
  assert.ok(out.allInTicked);
  assert.strictEqual(out.viaBank, out.viaQuick);
  assert.notStrictEqual(out.emptied, out.viaQuick);
  await page.context().close();
});

test('Skip adds nothing, and Next after a pick keeps it', async () => {
  const page = await ready();
  await page.evaluate(() => { switchStu(2); setSubject('general'); onGenLevel(currentIdx, 'strong'); });
  await quickOn(page); await gotoCat(page, 'Leadership');
  const before = await page.evaluate(() => JSON.stringify(cur().selected));
  assert.strictEqual((await page.textContent('#quickPanel .quick-go')).trim(), 'Skip');
  await page.click('#quickPanel .quick-go'); await settle(page, 100);
  assert.strictEqual(await page.evaluate(() => currentTab), 'Roles & Responsibilities');
  assert.strictEqual(await page.evaluate(() => JSON.stringify(cur().selected)), before);
  await page.click('#quickPanel .quick-chip >> nth=0'); await settle(page, 100);
  assert.strictEqual((await page.textContent('#quickPanel .quick-go')).trim(), 'Next');
  await page.context().close();
});

test('unticking removes only that characteristic’s sentence, and a custom sentence stays', async () => {
  const page = await ready();
  await page.evaluate(() => {
    switchStu(1); setSubject('general'); onGenLevel(currentIdx, 'strong');
    const s = cur(); CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k))); s.custom = s.custom || {}; s.customTiers = s.customTiers || {}; s.custom['Personality'] = ['{{N}} is a custom test sentence.']; s.customTiers['Personality'] = ['strong'];
    toggleCustomOpt('Personality', 0);
  });
  await quickOn(page); await gotoCat(page, 'Personality');
  await page.click('#quickPanel .quick-chip[data-trait="kind-and-caring"]'); await settle(page, 100);
  await page.click('#quickPanel .quick-chip[data-trait="positive-and-cheerful"]'); await settle(page, 100);
  await page.click('#quickPanel .quick-chip[data-trait="kind-and-caring"]'); await settle(page, 100);
  const r = await page.evaluate(() => ({
    kind: GEN_TRAITS['Personality'].find(x => x.id === 'kind-and-caring').sentences.some(s => genSelForm('Personality', s, cur()) !== null),
    cheer: GEN_TRAITS['Personality'].find(x => x.id === 'positive-and-cheerful').sentences.some(s => genSelForm('Personality', s, cur()) !== null),
    custom: (cur().selected['Personality'] || []).includes('__custom__Personality__0')
  }));
  assert.deepStrictEqual(r, { kind: false, cheer: true, custom: true });
  await page.context().close();
});

test('two students given the same characteristic get different sentences where the group allows', async () => {
  const page = await ready();
  const r = await page.evaluate(() => {
    const pick = i => { switchStu(i); setSubject('general'); onGenLevel(currentIdx, 'strong'); setQuick(true); currentTab = 'Personality'; render(); document.querySelector('#quickPanel .quick-chip[data-trait="kind-and-caring"]').click(); return GEN_TRAITS['Personality'].find(x => x.id === 'kind-and-caring').sentences.filter(s => genSelForm('Personality', s, students[i]) !== null); };
    // the fixture already holds one Personality sentence per student; clear them so only this tap counts
    students.forEach((st, i) => { switchStu(i); (st.selected['Personality'] || []).slice().forEach(k => genRemoveKey('Personality', k)); });
    return [pick(0), pick(1), pick(3)];
  });
  assert.ok(r.every(x => x.length === 1));
  assert.strictEqual(new Set(r.map(x => x[0])).size, 3, JSON.stringify(r));
  await page.context().close();
});

test('Semester 2 never picks a sentence the student used in Semester 1', async () => {
  const page = await ready();
  const r = await page.evaluate(() => {
    switchStu(4); setSubject('general'); onGenLevel(currentIdx, 'strong');
    const t = GEN_TRAITS['Personality'].find(x => x.id === 'kind-and-caring');
    currentSemester = 2; cur().s1Ordered = [t.sentences[0], t.sentences[1]];
    const stu = cur(); (stu.selected['Personality'] || []).slice().forEach(k => genRemoveKey('Personality', k));
    const pick = quickPickFor(stu, 'Personality', t);
    currentSemester = 1;
    return { pick, banned: [t.sentences[0], t.sentences[1]] };
  });
  assert.ok(r.pick && !r.banned.includes(r.pick));
  await page.context().close();
});

test('the Semester 1 closing sentences are not offered in Semester 2, and the end-of-year ones not in Semester 1', async () => {
  const page = await ready();
  const r = await page.evaluate(() => {
    switchStu(0); setSubject('general');
    const names = sem => { currentSemester = sem; const st = cur(); const out = GEN_TRAITS['Closing Statement'].flatMap(t => quickCandidates(st, 'Closing Statement', t, true)); currentSemester = 1; return out; };
    const s1 = names(1), s2 = names(2);
    return { s1HasS2: s1.some(x => SEM_ONLY[2].has(x)), s2HasS1: s2.some(x => SEM_ONLY[1].has(x)), n1: s1.length, n2: s2.length };
  });
  assert.deepStrictEqual([r.s1HasS2, r.s2HasS1], [false, false]); assert.ok(r.n1 > 5 && r.n2 > 5);
  await page.context().close();
});

test('leaving Quick mode part way leaves a valid comment, and nothing new is saved on the student', async () => {
  const page = await ready();
  await prep(page, 2, 'strong');
  const keys = await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort()));
  await quickOn(page); await gotoCat(page, 'Social Skills');
  await page.click('#quickPanel .quick-chip >> nth=0'); await settle(page, 100);
  await page.click('#quickBtn'); await settle(page, 100);
  assert.strictEqual(await page.$('#quickPanel'), null);
  assert.ok((await text(page, 2)).includes('Jordan'));
  assert.strictEqual(await page.evaluate(() => JSON.stringify(Object.keys(cur()).sort())), keys);
  assert.deepStrictEqual(page.errors, []);
  await page.context().close();
});

test('the last screen offers Search and Go to Review, and Full list shows the usual sentences with a way back', async () => {
  const page = await ready();
  await prep(page, 0, 'strong');
  await quickOn(page); await gotoCat(page, 'Closing Statement');
  await page.click('#quickPanel .quick-go'); await settle(page, 100);
  assert.ok(/That is every category/.test(await page.textContent('#quickPanel')));
  await page.click('#quickPanel .quick-link:has-text("Search every category")'); await settle(page, 100);
  assert.ok(await page.$('#searchInput'));
  await page.click('#sidebar .cat-btn:not(.search-btn) >> nth=0'); await settle(page, 100);
  assert.ok(await page.$('#quickPanel'));
  await page.click('#quickPanel .quick-link:has-text("Full list")'); await settle(page, 100);
  assert.ok((await page.$$('#optsGrid .opt')).length > 5);
  await page.click('.quick-strip .quick-link'); await settle(page, 100);
  assert.ok(await page.$('#quickPanel'));
  await gotoCat(page, 'Closing Statement'); await page.click('#quickPanel .quick-go'); await settle(page, 100);
  await page.click('#quickPanel .quick-go:has-text("Go to Review")'); await settle(page, 400);
  assert.strictEqual(await page.evaluate(() => currentView), 'publish');
  await page.context().close();
});

test('Emotional Wellbeing and Reflection & Goal Setting have their own Quick mode screens', async () => {
  const page = await ready();
  await prep(page, 0, 'strong');
  await quickOn(page);
  for (const cat of ['Emotional Wellbeing', 'Reflection & Goal Setting']) {
    await gotoCat(page, cat);
    assert.ok(await page.$('#quickPanel'), cat + ' shows Quick mode');
    assert.ok((await chips(page)).length >= 2, cat + ' has characteristic buttons');
  }
  await page.context().close();
});

// v3.17.33: the comment offered suits the student's year
const pscPicks = (page, year, sem, lv) => page.evaluate(([year, sem, lv]) => {
  switchStu(0); setSubject('general'); const s = cur();
  CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k)));
  s.year = year; currentSemester = sem; onGenLevel(currentIdx, lv);
  const out = [];
  CATS.forEach(c => (GEN_TRAITS[c] || []).forEach(t => { if (!t.sentences.some(x => PSC_LEVEL[x])) return; const p = quickPickFor(s, c, t); out.push({ c, lv: PSC_LEVEL[p], tier: _tierOfRaw(c, p) }); }));
  return out;
}, [year, sem, lv]);

test('Quick mode picks the level the student\'s year leads up to (Year 5 and 6 get Level 4, never Kindergarten)', async () => {
  const page = await ready();
  for (const yr of ['5', '6']) for (const lv of ['strong', 'average']) {
    const r = await pscPicks(page, yr, 1, lv);
    assert.strictEqual(r.length, 16);
    r.forEach(x => { assert.strictEqual(x.lv, '4', yr + ' ' + lv + ' ' + x.c); assert.notStrictEqual(x.tier, 'developing', x.c); });
  }
  const d = await pscPicks(page, '5', 1, 'developing');
  d.forEach(x => { assert.ok(['3', '4'].includes(x.lv), x.c); assert.strictEqual(x.tier, 'developing', x.c); });
  assert.ok(d.filter(x => x.lv === '4').length >= 12);
  await page.context().close();
});

test('Quick mode: Year 3 gets Level 3, Year 2 gets Level 2, Kindergarten gets 1a in Semester 1 and 1b in Semester 2', async () => {
  const page = await ready();
  (await pscPicks(page, '3', 1, 'strong')).forEach(x => assert.strictEqual(x.lv, '3'));
  (await pscPicks(page, '2', 1, 'strong')).forEach(x => assert.strictEqual(x.lv, '2'));
  (await pscPicks(page, '2', 1, 'developing')).forEach(x => assert.ok(!x.lv || ['1b', '2'].includes(x.lv)));
  const k1 = await pscPicks(page, 'K', 1, 'strong'); k1.forEach(x => assert.ok(['1a', '1b'].includes(x.lv)));
  assert.ok(k1.filter(x => x.lv === '1a').length >= 8);
  (await pscPicks(page, 'K', 2, 'strong')).forEach(x => assert.strictEqual(x.lv, '1b'));
  await page.context().close();
});

test('with no year set, Quick mode picks as it did before the year rule', async () => {
  const page = await ready();
  const r = await page.evaluate(() => {
    switchStu(0); setSubject('general'); const s = cur(); s.year = ''; onGenLevel(currentIdx, 'strong');
    const t = GEN_TRAITS['Emotional Wellbeing'][0];
    return { home: pscHomeLevel(s), cands: quickCandidates(s, 'Emotional Wellbeing', t, true).length, all: t.sentences.filter(x => inSemester(x)).length };
  });
  assert.strictEqual(r.home, null); assert.strictEqual(r.cands, r.all);
  await page.context().close();
});

test('a Kindergarten comment already holding a Year 5 sentence keeps its tick, and Swap in Review moves it to a fitting one', async () => {
  const page = await ready();
  const r = await page.evaluate(() => {
    switchStu(0); setSubject('general'); const s = cur(); CATS.forEach(c => (s.selected[c] || []).slice().forEach(k => genRemoveKey(c, k)));
    s.year = '5'; onGenLevel(currentIdx, 'strong');
    const c = 'Emotional Wellbeing', t = GEN_TRAITS[c][0], kg = t.sentences.find(x => PSC_LEVEL[x] === '1a');
    genAddKey(c, kg);
    const ticked = quickTicked(s, c, t);
    const offered = quickCandidates(s, c, t, false).map(x => PSC_LEVEL[x]);
    return { ticked, offered };
  });
  assert.ok(r.ticked); r.offered.forEach(l => assert.ok(['3', '4'].includes(l), l));
  await page.context().close();
});
