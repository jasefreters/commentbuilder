// The editing box in Review: click a highlighted word, choose Edit, change the sentence, Apply.
// These use real clicks and typing.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, seedClass, snapshot, settle, openReview, changedKeys, closeBrowser } = require('./helpers');
after(closeBrowser);

// Opens the editing box on the first sentence that has a highlighted word, and returns that sentence.
async function openEditBox(page) {
  const idx = await page.evaluate(() => [...document.querySelectorAll('#pubContent span[data-si]')].findIndex(s => s.querySelector('mark.dup-word')));
  assert.ok(idx >= 0, 'the comment has a highlighted word to click');
  const span = page.locator('#pubContent span[data-si]').nth(idx);
  const before = (await span.textContent()).trim();
  await span.locator('mark.dup-word').first().click();
  await page.waitForSelector('#synDropdown', { state: 'visible' });
  await page.click('#synTabEdit');
  await page.waitForSelector('#synEditArea');
  return { idx, before };
}
async function applyEdit(page, text) { await page.fill('#synEditArea', text); await page.click('.syn-rewrite-btn.apply'); }

for (const subj of ['english', 'maths']) {
  test(`two changes typed in the editing box are both saved (${subj}), even when leaving at once`, async () => {
    const page = await openApp(); await seedClass(page);
    const start = await snapshot(page);
    await openReview(page, 'Ava', subj);
    const { before } = await openEditBox(page);
    const w = before.split(' '); w[1] = 'ALPHA'; w[w.length - 2] = 'OMEGA';
    await applyEdit(page, w.join(' '));
    await page.evaluate(() => switchStu((currentIdx + 1) % students.length));   // flick to the next student straight away
    await settle(page);
    const end = await snapshot(page);
    assert.deepEqual(changedKeys(start, end), ['Ava|' + subj]);
    assert.ok(end['Ava|' + subj].includes(w.join(' ')), 'the sentence is saved exactly as typed');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

// KNOWN PROBLEM, found 15 Nov 2026, not yet fixed (marked "todo" so it reports without failing the run).
// The app keeps names and pronouns alternating from sentence to sentence. If a teacher changes the opening
// "Tom" to "He" (or the other way) and also changes another word, the app puts the name back and keeps the
// other change: two changes typed, one saved, and nothing tells the teacher.
for (const subj of ['general', 'english', 'maths']) {
  test(`changing the opening name or pronoun in the editing box is kept (${subj})`, { todo: 'the app silently puts the name or pronoun back' }, async () => {
    const page = await openApp(); await seedClass(page);
    await openReview(page, 'Tom', subj);
    const { before } = await openEditBox(page);
    const w = before.replace(/^(Tom|He)\b/, /^Tom\b/.test(before) ? 'He' : 'Tom').split(' '); w[w.length - 2] = 'OMEGA';
    await applyEdit(page, w.join(' '));
    await settle(page, 400);
    await page.evaluate(() => switchStu(0)); await settle(page);
    const text = (await snapshot(page))['Tom|' + subj];
    await page.context().close();
    assert.ok(text.includes(w.join(' ')), 'the sentence is saved exactly as typed');
  });
}
