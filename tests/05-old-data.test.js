// Old saved data: every way an older version stored a comment, loaded the way a saved class is loaded.
// The rule: the finished text of every comment is the same before and after loading, saving and switching semester.
// (This is the safety net for the "one source of truth" work: that change upgrades saved data, and none of these may move.)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { openApp, settle, closeBrowser, openReview, changeInReview } = require('./helpers');
const { SHAPES, buildOldShapes, finals } = require('./old-shapes');

const GOLDEN = path.join(__dirname, 'golden', 'old-shapes-finals.json');
let sessionJson, builtFinals;

before(async () => {
  const page = await openApp();
  await buildOldShapes(page);
  builtFinals = await finals(page);
  sessionJson = await page.evaluate(() => JSON.stringify(buildSession()));   // exactly what a save or a backup holds
  await page.context().close();
});
after(closeBrowser);

// A fresh browser that loads the saved class, as the app does on start-up, sign-in and backup import.
async function loadSaved(json) {
  const page = await openApp();
  await page.evaluate(j => { _applyPersistedState(JSON.parse(j)); loadCur(); render(); _applySemesterAfterLoad(JSON.parse(j)); }, json);
  await settle(page);
  return page;
}

test('the made-up class holds each old way of storing a comment', () => {
  const s = JSON.parse(sessionJson).students, by = n => s.find(x => x.name === n);
  assert.strictEqual(s.length, SHAPES.length);
  assert.ok(by('Bree').draftOverride, 'typed Build text');
  assert.ok(by('Cam').custom['__edited__'] && by('Cam').orderedAtDone.length, 'Done text');
  assert.ok(by('Dana').pubEditGeneral || by('Dana').custom['__edited__'], 'Review edit');
  const f = by('Faye'); assert.ok(f.draftOverride && f.custom['__edited__'] && f.draftOverride !== f.custom['__edited__'][0], 'stores that disagree');
  assert.ok(by('Gus').engDraftEdited, 'English typed over');
  assert.ok(by('Kim').paraLayout, 'paragraph layout');
  assert.ok(by('Ivy').s2DraftOverride && by('Ivy').s1DraftOverride, 'two semesters');
  const ps = s.filter(x => x.name !== 'Ivy');
  assert.ok(ps.every(x => !x.s2DraftOverride), 'only Ivy has a Semester 2 comment');
});

test('every comment names its own student', async () => {
  Object.keys(builtFinals).filter(k => k.startsWith('S1|') && k.endsWith('|general')).forEach(k => {
    const name = k.split('|')[1]; if (name === 'Ivy') return;
    assert.ok(builtFinals[k].includes(name), name + "'s General comment does not name them");
  });
});

test('the finished text of every comment matches the saved record', async () => {
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(GOLDEN)) { fs.writeFileSync(GOLDEN, JSON.stringify(builtFinals, null, 1) + '\n'); }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const changed = Object.keys({ ...golden, ...builtFinals }).filter(k => golden[k] !== builtFinals[k]);
  assert.deepStrictEqual(changed, [], 'these comments read differently from the saved record: ' + changed.join(', '));
});

test('saving and loading the class keeps every finished comment', async () => {
  const page = await loadSaved(sessionJson);
  const after = await finals(page);
  const changed = Object.keys(builtFinals).filter(k => builtFinals[k] !== after[k]);
  assert.deepStrictEqual(changed, [], 'changed by loading: ' + changed.join(', '));
  assert.deepStrictEqual(page.errors, []);
  await page.context().close();
});

test('loading, then visiting every comment in Review and every other tab, keeps every finished comment', async () => {
  const page = await loadSaved(sessionJson);
  const before = await finals(page);
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < students.length; i++) for (const s of ['general', 'english', 'maths']) { switchStu(i); setSubject(s); setView('publish'); await wait(15); setView('build'); }
  });
  await settle(page);
  const after = await finals(page);
  const changed = Object.keys(before).filter(k => before[k] !== after[k] && !k.startsWith('S1|Faye|general'));   // Faye: see the known-problem test below
  assert.deepStrictEqual(changed, [], 'changed by looking: ' + changed.join(', '));
  await page.context().close();
});

test('the same class saved a second time reads the same (nothing drifts between saves)', async () => {
  const page = await loadSaved(sessionJson);
  const again = await page.evaluate(() => JSON.stringify(buildSession()));
  const page2 = await loadSaved(again);
  const a = await finals(page), b = await finals(page2);
  assert.deepStrictEqual(Object.keys(a).filter(k => a[k] !== b[k]), []);
  await page.context().close(); await page2.context().close();
});

// ── Known problems the one-source-of-truth work fixes (see the audit, drift routes 1 and 2) ──
// Opening a comment whose saved copies disagree must not change what it says. Today the newest wording shows only while a
// Review copy is still valid; opening the student clears it and the older typed text comes back (a real class was found in this state).
test('opening a comment whose saved copies disagree does not change its words', { todo: 'drift route 1b: opening the student clears the Review copy and the older typed text shows' }, async () => {
  const page = await loadSaved(sessionJson);
  const g = () => page.evaluate(() => getFinalCommentText(students.find(s => s.name === 'Faye'), 'general'));
  const before = await g();
  await page.evaluate(() => { switchStu(students.findIndex(s => s.name === 'Faye')); setSubject('general'); });
  await settle(page);
  assert.strictEqual(await g(), before);
  await page.context().close();
});

// A General comment typed in Build, then changed in Review. The Review change must survive a save, a load and a tab change.
async function typedThenReviewEdit(page) {
  await page.evaluate(() => { switchStu(1); setSubject('general'); setView('build'); const el = document.getElementById('outEditable'); el.focus(); el.innerText = el.innerText + ' Typed in Build BBB.'; onDraftInput(); });
  await settle(page);
  await openReview(page, 'Ava', 'general');
  await changeInReview(page, 0, ' AAA');
  await settle(page, 1500);
}
const { seedClass } = require('./helpers');

test('a Review change made after typing in Build survives a save, a load and a tab change', { todo: 'drift route 1: the typed text keeps the old words until the next navigation' }, async () => {
  const page = await openApp(); await seedClass(page); await typedThenReviewEdit(page);
  const saved = await page.evaluate(() => JSON.stringify(buildSession()));   // a save made right after the edit
  const p2 = await loadSaved(saved);
  await p2.evaluate(() => { switchStu(1); setSubject('english'); setSubject('general'); });
  await settle(p2);
  const text = await p2.evaluate(() => getFinalCommentText(students.find(s => s.name === 'Ava'), 'general'));
  assert.ok(/AAA/.test(text), 'the Review change was lost');
  assert.ok(/BBB/.test(text), 'the typed text was lost');
  await page.context().close(); await p2.context().close();
});

test('Export all (.txt) shows the same words as Review and Copy', { todo: 'drift route 2: Export all ignores Review changes made after typing in Build' }, async () => {
  const page = await openApp(); await seedClass(page); await typedThenReviewEdit(page);
  const r = await page.evaluate(() => { const s = students.find(x => x.name === 'Ava'); const n = t => String(t || '').replace(/\s+/g, ' ').trim(); return { final: n(getFinalCommentText(s, 'general')), exported: n(getPublishedText(s)) }; });
  assert.strictEqual(r.exported, r.final);
  await page.context().close();
});

// ── Your own class, checked on your own computer only (nothing from it is ever committed) ──
// RCB_REAL_BACKUP=/path/backup.json RCB_REAL_BEFORE=/path/before.json npm test
const real = process.env.RCB_REAL_BACKUP, realBefore = process.env.RCB_REAL_BEFORE;
test('your real class: every finished comment, both semesters, is the same as it was before the change', { skip: !(real && realBefore) && 'set RCB_REAL_BACKUP and RCB_REAL_BEFORE to run' }, async () => {
  const bk = JSON.parse(fs.readFileSync(real, 'utf8')), ref = JSON.parse(fs.readFileSync(realBefore, 'utf8'));
  const page = await openApp();
  const got = await page.evaluate(bk => {
    _applyPersistedState(bk); loadCur(); render(); _applySemesterAfterLoad(bk);
    const grab = () => { const o = {}; students.forEach((s, i) => ['general', 'english', 'maths'].forEach(k => { o[(s.uid || i) + '|' + s.name + '|' + k] = getFinalCommentText(s, k); })); return o; };
    const r = { s2: grab() }; setSemester(1); r.s1 = grab(); setSemester(2); return r;
  }, bk);
  const diff = ['s1', 's2'].flatMap(sem => Object.keys(ref[sem]).filter(k => ref[sem][k] !== got[sem][k]).map(k => sem + ' ' + k));
  assert.deepStrictEqual(diff, []);
  await page.context().close();
});
