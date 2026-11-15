// One reader for a comment (storage step 2, PR B). Review, Copy, Export all, the class stats, Check for issues and the
// Copy fallback must all show the same words, and no new code may read a comment some other way.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { openApp, seedClass, settle, openReview, changeInReview, closeBrowser } = require('./helpers');
const { buildOldShapes } = require('./old-shapes');

after(closeBrowser);

const APP = process.env.RCB_APP || path.join(__dirname, '..', 'report-comment-builder.html');

test('only the build code and the few comparing built with final text read the built-only text', () => {
  // getPublishedText, getSubjectPublishText and getBuiltCommentText give the comment as the sentences build it, before any Review
  // change. They may be called by the code that builds, and by the code that compares built with final. Everything else asks commentText.
  const src = fs.readFileSync(APP, 'utf8').split('\n');
  const allowed = new Set(['getPublishedText', 'getSubjectPublishText', 'getBuiltCommentText', 'getFinalCommentText', 'renderPublish',
    'learnFromCurrent', '_reviewToDraftIfChanged', '_hs', '_hsV2', '_upgradeSubject', 'replaceInStudent', 'copyDraft']);
  let fn = '(top)'; const offenders = [];
  src.forEach((l, i) => {
    const m = l.match(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/); if (m && (l.length - l.trimStart().length) <= 2) fn = m[1];
    if (/\b(getPublishedText|getSubjectPublishText|getBuiltCommentText)\(/.test(l) && !/^\s*function\s/.test(l) && !allowed.has(fn)) offenders.push(fn + ' (line ' + (i + 1) + ')');
  });
  assert.deepStrictEqual(offenders, [], 'these read a comment without commentText: ' + offenders.join(', '));
});

test('commentText is the one name for the finished comment', async () => {
  const page = await openApp(); await seedClass(page);
  const same = await page.evaluate(() => students.every(s => ['general', 'english', 'maths'].every(k => commentText(s, k) === getFinalCommentText(s, k))));
  assert.ok(same); await page.context().close();
});

// A General comment typed in Build, then changed in Review: every output must carry the Review change.
async function typedThenReviewEdit(page) {
  await page.evaluate(() => { switchStu(1); setSubject('general'); setView('build'); const el = document.getElementById('outEditable'); el.focus(); el.innerText = el.innerText + ' Typed in Build BBB.'; onDraftInput(); });
  await settle(page);
  await openReview(page, 'Ava', 'general');
  await changeInReview(page, 0, ' AAA');
  await settle(page, 1500);
}
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();

test('Export all (.txt) shows the same words as Review and Copy', async () => {
  const page = await openApp(); await seedClass(page); await typedThenReviewEdit(page);
  const r = await page.evaluate(() => { const s = students.find(x => x.name === 'Ava'); return { final: commentText(s, 'general'), exported: _exportAllText(), pane: getPublishedPaneText() }; });
  assert.ok(/AAA/.test(r.final) && /BBB/.test(r.final), 'the edit or the typed text is missing from the comment');
  assert.ok(norm(r.exported).includes(norm(r.final)), 'Export all does not show the comment as Review shows it');
  assert.strictEqual(norm(r.pane), norm(r.final));
  await page.context().close();
});

test('Export all (.txt) is named for the semester you are in', async () => {
  const page = await openApp(); await seedClass(page);
  const name = async () => { const d = page.waitForEvent('download'); await page.evaluate(() => exportAll()); return (await d).suggestedFilename(); };
  assert.strictEqual(await name(), 'report-comments-s1-2026.txt');
  await page.evaluate(() => setSemester(2)); await settle(page);
  assert.strictEqual(await name(), 'report-comments-s2-2026.txt');
  await page.context().close();
});

test('the class word counts use the same words as Review', async () => {
  const page = await openApp(); await seedClass(page); await typedThenReviewEdit(page);
  const r = await page.evaluate(() => {
    const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
    const expected = students.reduce((a, s) => a + ['general', 'english', 'maths'].reduce((n, k) => n + words(commentText(s, k)), 0), 0);
    return { total: getTotalWordsWritten(), expected };
  });
  assert.strictEqual(r.total, r.expected);
  await page.context().close();
});

test('every comment in the made-up old-data class appears the same way in Export all and in the word counts', async () => {
  const page = await openApp(); await buildOldShapes(page);
  const r = await page.evaluate(() => {
    const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
    const exported = _exportAllText(); const missing = [];
    students.forEach(s => { const t = commentText(s, 'general'); if (t && !exported.replace(/\s+/g, ' ').includes(t.replace(/\s+/g, ' ').trim())) missing.push(s.name); });
    const expected = students.reduce((a, s) => a + ['general', 'english', 'maths'].reduce((n, k) => n + words(commentText(s, k)), 0), 0);
    return { missing, total: getTotalWordsWritten(), expected };
  });
  assert.deepStrictEqual(r.missing, []);
  assert.strictEqual(r.total, r.expected);
  await page.context().close();
});
