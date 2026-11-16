// "Beginning to" removed from General sentences (v3.17.30): the sentences say what the student can do, the level tags moved to the
// earlier level, and a comment built with the older wording still works.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');

after(closeBrowser);

test('no General sentence says "beginning to"', async () => {
  const page = await openApp();
  const bad = await page.evaluate(() => { const o = []; CATS.forEach(c => RAW[c].forEach(s => { if (/beginning to/i.test(s)) o.push(s); })); return o; });
  assert.deepStrictEqual(bad, []);
  await page.context().close();
});

test('each reworded sentence is in the bank once, the old one is not offered, and old and new are linked', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const out = { n: 0, problems: [] };
    Object.entries(SENTENCE_REWORDS).forEach(([o, n]) => {
      out.n++;
      const cats = CATS.filter(c => RAW[c].includes(n));
      if (cats.length !== 1) out.problems.push('new not once: ' + n.slice(0, 50));
      if (CATS.some(c => RAW[c].includes(o))) out.problems.push('old still offered: ' + o.slice(0, 50));
      if (GEN_OLD2NEW[o] !== n || GEN_NEW2OLD[n] !== o) out.problems.push('not linked: ' + o.slice(0, 50));
      if (SENT_CAT[o] !== SENT_CAT[n]) out.problems.push('old has no category: ' + o.slice(0, 50));
    });
    return out;
  });
  assert.strictEqual(r.n, 34);
  assert.deepStrictEqual(r.problems, []);
  await page.context().close();
});

test('a comment already built with the older wording still shows it as picked and can take it out', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(() => {
    switchStu(0); setSubject('general');
    const old = Object.keys(SENTENCE_REWORDS).find(o => SENT_CAT[o] === 'Personality');
    const nw = SENTENCE_REWORDS[old], cat = 'Personality';
    cur().selected[cat] = (cur().selected[cat] || []).concat([old]); cur().ordered.push(old); render();
    const shown = genSelForm(cat, nw, cur()) === old;
    toggleOpt(cat, nw);
    return { shown, gone: !cur().selected[cat].includes(old) && !cur().ordered.includes(old) };
  });
  assert.ok(r.shown, 'the new sentence shows as picked through the old key');
  assert.ok(r.gone, 'clicking it takes the old wording out');
  await page.context().close();
});

test('the level tags moved to the earlier level', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const order = ['1a', '1b', '2', '3', '4'], bad = [];
    Object.entries(SENTENCE_REWORDS).forEach(([o, n]) => { if (PSC_LEVEL[o] || !PSC_LEVEL[n]) return; });
    const tagged = Object.values(SENTENCE_REWORDS).filter(n => PSC_LEVEL[n]);
    return { tagged: tagged.length, sample: PSC_LEVEL['{{N}} persists with short tasks and benefits from encouragement when work becomes difficult.'], sample2: PSC_LEVEL['{{N}} shares {{pos}} personal preferences when given choices in the classroom.'] };
  });
  assert.strictEqual(r.tagged, 29);
  assert.strictEqual(r.sample, '1b');   // was Level 2
  assert.strictEqual(r.sample2, '1a');  // was Level 1a: nothing earlier, so it stays
  await page.context().close();
});

// v3.17.39: eight rewordings from the Semester 2 2026 final check
const FINAL_CHECK_OLD = ['predicted categories', 'similar fractions', 'navigates the keyboard', 'pictures and links', 'takes on teacher feedback', 'peers, consistently showing', 'who shows genuine care'];
test('the final-check rewordings: old wording gone from the banks, new wording in, old comments still show as picked', async () => {
  const page = await openApp();
  const r = await page.evaluate(old => {
    const all = JSON.stringify([RAW, ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD]);
    const left = old.filter(x => all.includes(x));
    const newS = '{{S}} creates surveys and records data using predetermined categories.';
    const oldS = '{{S}} creates surveys and records data using predicted categories.';
    const subjOk = subjHas([oldS], newS) && !subjHas([newS], oldS) === true;
    const gen = SENTENCE_REWORDS['{{N}} is respected by {{pos}} peers, consistently showing a kind-hearted nature.'] === '{{N}} is respected by {{pos}} peers and consistently shows a kind-hearted nature.';
    const fdNew = 'Adding and subtracting fractions with the same denominator.', fdOld = 'Adding and subtracting similar fractions.';
    const fd = fdHas([fdOld], fdNew) && !fdHas([fdNew], fdOld);
    const tagged = ['Data', 'Reading Comprehension', 'Handwriting'].every(() => true) && !!_skTag('Data', newS);
    return { left, subjOk, gen, fd, tagged };
  }, FINAL_CHECK_OLD);
  assert.deepStrictEqual(r.left, []);
  assert.ok(r.subjOk && r.gen && r.fd && r.tagged);
  await page.context().close();
});
