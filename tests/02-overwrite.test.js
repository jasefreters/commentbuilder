// The rule these tests protect: a change to one comment changes that comment and nothing else.
// Each test is a way a saved comment has been overwritten, or could be.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, seedClass, snapshot, settle, openReview, changeInReview, changedKeys, closeBrowser, SUBJECTS } = require('./helpers');
after(closeBrowser);

const MARK = ' Zebra';   // typed into a sentence so the edit can be found again

async function start() { const page = await openApp(); await seedClass(page); return page; }
async function finish(page) { assert.deepEqual(page.errors, [], 'no script errors'); await page.context().close(); }

// A tour of the app that edits nothing: every student, every subject, Build and Review, and the arrows in Review.
async function tour(page) {
  await page.evaluate(async subjects => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < students.length; i++) {
      switchStu(i);
      for (const s of subjects) { setSubject(s); setView('publish'); await wait(30); setView('build'); }
    }
    setView('publish');
    for (let i = 0; i < students.length + 2; i++) { pubNavStudent(1); await wait(30); }
    for (const s of subjects) { setSubject(s); await wait(30); pubNavStudent(-1); await wait(30); }
    setView('build'); switchStu(0); setSubject('general');
  }, SUBJECTS);
  await settle(page);
}

test('looking through the whole class changes nothing', async () => {
  const page = await start();
  const before = await snapshot(page);
  await tour(page); await tour(page);
  assert.deepEqual(changedKeys(before, await snapshot(page)), []);
  await finish(page);
});

for (const subj of SUBJECTS) {
  test(`a change made in Review (${subj}) changes only that student's ${subj} comment`, async () => {
    const page = await start();
    const before = await snapshot(page);
    await openReview(page, 'Ava', subj);
    await changeInReview(page, 1, MARK);
    // leave straight away, without clicking out of the sentence first
    await page.evaluate(() => switchStu(students.findIndex(s => s.name === 'Mia')));
    await settle(page);
    await tour(page);
    const after = await snapshot(page);
    assert.deepEqual(changedKeys(before, after), ['Ava|' + subj]);
    assert.ok(after['Ava|' + subj].includes(MARK.trim()), 'the typed word is kept');
    await finish(page);
  });

  test(`a change made in Review (${subj}) then changing subject keeps the edit where it was typed`, async () => {
    const page = await start();
    const before = await snapshot(page);
    await openReview(page, 'Tom', subj);
    await changeInReview(page, 0, MARK);
    const next = SUBJECTS[(SUBJECTS.indexOf(subj) + 1) % 3];
    await page.evaluate(s => setSubject(s), next);
    await settle(page);
    await page.evaluate(() => pubNavStudent(1)); await settle(page);
    await tour(page);
    const after = await snapshot(page);
    assert.deepEqual(changedKeys(before, after), ['Tom|' + subj]);
    assert.ok(after['Tom|' + subj].includes(MARK.trim()));
    await finish(page);
  });
}

test('a change made in Review then using the next-student arrow keeps the edit on the first student', async () => {
  const page = await start();
  const before = await snapshot(page);
  await openReview(page, 'Sam', 'english');
  await changeInReview(page, 2, MARK);
  await page.evaluate(() => pubNavStudent(1)); await settle(page);
  await page.evaluate(() => pubNavStudent(1)); await settle(page);
  const after = await snapshot(page);
  assert.deepEqual(changedKeys(before, after), ['Sam|english']);
  await finish(page);
});

test('edits to several students in a row each stay with their own student', async () => {
  const page = await start();
  const before = await snapshot(page);
  const edits = [['Sam', 'general'], ['Ava', 'english'], ['Jordan', 'maths'], ['Mia', 'general'], ['Ruby-Lee', 'english'], ['Tom', 'maths']];
  for (const [name, subj] of edits) {
    await openReview(page, name, subj);
    await changeInReview(page, 0, ' Mark' + name.replace(/\W/g, ''));
  }
  await tour(page);
  const after = await snapshot(page);
  assert.deepEqual(changedKeys(before, after), edits.map(e => e.join('|')).sort());
  for (const [name, subj] of edits) {
    const text = after[name + '|' + subj];
    assert.ok(text.includes('Mark' + name.replace(/\W/g, '')), name + ' keeps their own edit');
    for (const [other] of edits) if (other !== name) assert.ok(!text.includes('Mark' + other.replace(/\W/g, '')), name + ' has not picked up the edit made for ' + other);
  }
  await finish(page);
});

test('typing in the Build draft changes only that student, and keeps its paragraphs', async () => {
  const page = await start();
  await page.evaluate(() => { switchStu(1); setSubject('general'); setView('build'); });
  await settle(page);
  const before = await snapshot(page);
  const box = page.locator('#outEditable');
  await box.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(MARK + ' walks to school.');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await settle(page);
  await tour(page);
  const after = await snapshot(page);
  assert.deepEqual(changedKeys(before, after), ['Ava|general']);
  assert.ok(after['Ava|general'].includes('walks to school'));
  assert.ok(!/[a-z0-9][.!?][A-Z]/.test(after['Ava|general']), 'no sentences glued together');
  await finish(page);
});

test('a comment with blank lines between paragraphs keeps them after Review and a tour', async () => {
  const page = await start();
  await page.evaluate(() => {
    const s = students[2];
    s.draftOverride = 'Jordan enjoys reading.\n\nThey work well with others.\n\nI wish Jordan well.';
    switchStu(2); setSubject('general'); render();
  });
  const before = await snapshot(page);
  assert.equal(before['Jordan|general'].split(/\n\s*\n/).length, 3);
  await openReview(page, 'Jordan', 'general');
  await tour(page);
  const after = await snapshot(page);
  assert.deepEqual(changedKeys(before, after), []);
  await finish(page);
});

test('changing a future direction changes only that student and subject', async () => {
  const page = await start();
  const before = await snapshot(page);
  await page.evaluate(() => {
    switchStu(3); setSubject('english');
    const cur2 = getCurFD(); toggleFD(cur2[0]);   // remove one
    const pool = ENGLISH_FD[Object.keys(ENGLISH_FD).slice(-1)[0]]['Stage 3'];
    toggleFD(pool.find(t => !getCurFD().includes(t) && t !== cur2[0]));   // add a different one
  });
  await settle(page); await tour(page);
  assert.deepEqual(changedKeys(before, await snapshot(page)), ['Mia|english']);
  await finish(page);
});

test('adding a sentence in Build changes only that student and subject', async () => {
  const page = await start();
  const before = await snapshot(page);
  await page.evaluate(() => { switchStu(4); setSubject('general'); setView('build'); const a = RAW['Leadership']; toggleOpt('Leadership', a[0]); });
  await settle(page); await tour(page);
  assert.deepEqual(changedKeys(before, await snapshot(page)), ['Ruby-Lee|general']);
  await finish(page);
});

test('marking a comment Done changes no text', async () => {
  const page = await start();
  const before = await snapshot(page);
  for (const subj of SUBJECTS) {
    await openReview(page, 'Sam', subj);
    await page.evaluate(() => toggleDone());
    await settle(page);
  }
  await tour(page);
  assert.deepEqual(changedKeys(before, await snapshot(page)), []);
  await finish(page);
});

test('everything is still there after the page is closed and opened again', async () => {
  const page = await start();
  await openReview(page, 'Ava', 'maths');
  await changeInReview(page, 1, MARK);
  await page.evaluate(() => switchStu(0)); await settle(page, 600);
  const before = await snapshot(page);
  assert.ok(before['Ava|maths'].includes(MARK.trim()));
  const ctx = page.context();
  await page.close();
  const again = await openApp({ context: ctx });
  const after = await snapshot(again);
  assert.deepEqual(changedKeys(before, after), []);
  await tour(again);
  assert.deepEqual(changedKeys(before, await snapshot(again)), []);
  assert.deepEqual(again.errors, []);
  await ctx.close();
});

test('going to Semester 2 and back leaves Semester 1 comments as they were', async () => {
  const page = await start();
  await openReview(page, 'Tom', 'general');
  await changeInReview(page, 0, MARK);
  await page.evaluate(() => { switchStu(0); setView('build'); }); await settle(page);
  const before = await snapshot(page);
  await page.evaluate(() => setSemester(2)); await settle(page);
  await tour(page);
  await page.evaluate(() => setSemester(1)); await settle(page);
  assert.deepEqual(changedKeys(before, await snapshot(page)), []);
  await finish(page);
});

test('a random wander through the app (300 moves, no edits) changes nothing', async () => {
  const page = await start();
  await openReview(page, 'Ava', 'english'); await changeInReview(page, 0, MARK);
  await openReview(page, 'Tom', 'general'); await changeInReview(page, 1, MARK);
  await page.evaluate(() => switchStu(0)); await settle(page);
  const before = await snapshot(page);
  await page.evaluate(async subjects => {
    let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let k = 0; k < 300; k++) {
      const m = rnd(6);
      if (m === 0) switchStu(rnd(students.length));
      else if (m === 1) setSubject(subjects[rnd(3)]);
      else if (m === 2) setView('publish');
      else if (m === 3) setView('build');
      else if (m === 4) { if (currentView === 'publish') pubNavStudent(rnd(2) ? 1 : -1); }
      else autoSave();
      if (k % 7 === 0) await wait(20);
    }
  }, SUBJECTS);
  await settle(page, 500);
  assert.deepEqual(changedKeys(before, await snapshot(page)), []);
  await finish(page);
});
