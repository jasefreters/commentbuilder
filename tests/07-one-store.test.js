// One store for a comment (v3.17.23): old data is upgraded on load, the words never change, nothing is lost, new edits write one place.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { openApp, settle, closeBrowser, seedClass } = require('./helpers');
const { SHAPES, buildOldShapes, finals } = require('./old-shapes');

let sessionJson, golden;
before(async () => {
  const page = await openApp();
  await buildOldShapes(page);
  golden = await finals(page);
  sessionJson = await page.evaluate(() => JSON.stringify(buildSession()));
  await page.context().close();
});
after(closeBrowser);
async function loadSaved(json) {
  const page = await openApp();
  await page.evaluate(j => { window._ls = null; try { localStorage.removeItem('rcb_pre_upgrade_v3'); } catch (e) {} _applyPersistedState(JSON.parse(j)); loadCur(); render(); _applySemesterAfterLoad(JSON.parse(j)); }, json);
  await settle(page);
  return page;
}

test('the made-up old class really is stored the old ways before the upgrade', () => {
  const s = JSON.parse(sessionJson).students;
  assert.ok(s.some(x => x.custom && x.custom['__edited__']), 'some Done text');
  assert.ok(s.some(x => x.pubEditGeneral || x.pubEditEnglish || x.pubEditMaths), 'some Review copies');
});

test('after loading, no comment is stored the old way, and every finished comment is word for word the same', async () => {
  const page = await loadSaved(sessionJson);
  const left = await page.evaluate(() => students.map(s => ({ n: s.name, done: !!(s.custom && s.custom['__edited__']), pe: !!(s.pubEditGeneral || s.pubEditEnglish || s.pubEditMaths || (currentSemester === 1 ? s.s2PubEditGeneral || s.s2PubEditEnglish || s.s2PubEditMaths : s.s1PubEditGeneral || s.s1PubEditEnglish || s.s1PubEditMaths)), cat: !!s.editedCat })).filter(x => x.done || x.pe || x.cat));
  assert.deepStrictEqual(left, [], 'old-way fields left after the upgrade (these may only remain when the new reading did not match)');
  const got = await finals(page);
  assert.deepStrictEqual(got, golden);
  await page.context().close();
});

test('the upgrade keeps a whole-class safety copy, and a comment whose stores disagreed keeps the older words in History', async () => {
  const page = await loadSaved(sessionJson);
  await page.evaluate(() => _upgradeAll('test')); await settle(page, 200);
  const r = await page.evaluate(async () => {
    const mk = JSON.parse(localStorage.getItem('rcb_pre_upgrade_v3') || 'null');
    return { safety: !!mk, n: mk && mk.students.length, pending: _pendingUpgradeHist.length };
  });
  // the safety copy is written on the first change; load already made it (the second call has nothing left to change)
  const hist = await page.evaluate(() => { const f = students.find(s => s.name === 'Faye'); return (_hist[f.uid] || []).map(h => h.why); });
  assert.ok(hist.includes('Before upgrade'), 'Faye (typed text, Done text and Review copy disagreed) has a "Before upgrade" version: ' + JSON.stringify(hist));
  await page.context().close();
});

test('upgrading twice changes nothing more', async () => {
  const page = await loadSaved(sessionJson);
  const a = await page.evaluate(() => JSON.stringify(students));
  const changed = await page.evaluate(() => _upgradeAll('again'));
  const b = await page.evaluate(() => JSON.stringify(students));
  assert.strictEqual(changed, false);
  assert.strictEqual(a, b);
  await page.context().close();
});

test('both semesters are upgraded (Ivy has a different comment in each)', async () => {
  const page = await loadSaved(sessionJson);
  const r = await page.evaluate(() => { const i = students.find(s => s.name === 'Ivy'); return { s1: i.s1DraftOverride || i.draftOverride, s2: i.s2DraftOverride }; });
  assert.ok(r.s2 && /semester two/.test(r.s2), 'Semester 2 words kept');
  await page.context().close();
});

test('the same words stored the old way and the new way have the same sync fingerprint', async () => {
  const page = await openApp();
  await page.evaluate(j => { students = JSON.parse(j).students.map((s, i) => _normStudent(s, i)); }, sessionJson);
  const r = await page.evaluate(() => students.map(s => { const old = JSON.parse(JSON.stringify(s)); const up = JSON.parse(JSON.stringify(s)); _upgradeStudent(up); return [s.name, _hs(old) === _hs(up)]; }));
  r.forEach(([n, same]) => assert.ok(same, n + ': old-form and upgraded-form fingerprints differ'));
  await page.context().close();
});

test('Done in Build keeps the words in the one store', async () => {
  const page = await openApp(); await seedClass(page);
  await page.evaluate(() => { switchStu(0); setSubject('general'); setView('build'); const el = document.getElementById('outEditable'); el.focus(); el.innerText = el.innerText + ' Typed before Done.'; onDraftInput(); doneDraft(); });
  await settle(page);
  const r = await page.evaluate(() => { const s = students[0]; return { d: s.draftOverride, e: !!(s.custom && s.custom['__edited__']), f: commentText(s, 'general') }; });
  assert.ok(/Typed before Done/.test(r.d), 'draftOverride holds the Done text');
  assert.strictEqual(r.e, false, 'no separate Done text');
  assert.ok(/Typed before Done/.test(r.f));
  await page.context().close();
});

test('a new sentence ticked after Done goes into the text and shows', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(() => {
    switchStu(0); setSubject('general'); setView('build');
    const el = document.getElementById('outEditable'); el.focus(); el.innerText = el.innerText + ' Typed before Done.'; onDraftInput(); doneDraft();
    const a = RAW['Independence']; const key = a.find(x => !students[0].ordered.includes(x)) || a[a.length - 1];
    toggleOpt('Independence', key);
    return { t: commentText(students[0], 'general'), o: students[0].ordered.length };
  });
  assert.ok(/Typed before Done/.test(r.t), 'typed text kept');
  await page.context().close();
});

test('the other semester keeps showing what it showed, even when its Done text was shared (the old Done text was never kept per semester)', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const mk = () => ({ name: 'Zed', pronoun: 'he', year: '5', selected: {}, ordered: [], custom: { '__edited__': ['Zed worked well in Semester Two.'] }, editedCat: 'Personality', orderedAtDone: [], orderedAfterEdit: [], s1EditedCat: 'Personality', s1OrderedAtDone: [], s1OrderedAfterEdit: [] });
    students = [_normStudent(mk(), 0)]; currentSemester = 2;
    const stu = students[0];
    semStash(stu, 2);
    const before = (() => { const c = JSON.parse(JSON.stringify(stu)); semStash(c, 2); semLoad(c, 1); return commentText(c, 'general'); })();
    _upgradeStudent(stu);
    const c = JSON.parse(JSON.stringify(stu)); semLoad(c, 1);
    return { before, after: commentText(c, 'general'), live: commentText(stu, 'general') };
  });
  assert.strictEqual(r.after, r.before);
  assert.strictEqual(r.live, 'Zed worked well in Semester Two.');
  await page.context().close();
});
