// Final check (v3.17.41): wrong pronouns, other students' names and spacing are found, and fixed in one click, through Review.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

test('finalCheck flags wrong pronouns, fixes the safe ones and leaves verb changes to the teacher', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const sam = { name: 'Sam', pronoun: 'he' }, ava = { name: 'Ava', pronoun: 'she' };
    return {
      ok: finalCheck(sam, 'general', 'Sam shows his best work and he is kind to him.', []).length,
      a: finalCheck(sam, 'general', 'Sam shows her best work and helps her friends.', [])[0],
      b: finalCheck(ava, 'general', 'Ava shows his best work and Ava helps him.', [])[0],
      c: finalCheck({ name: 'Jordan', pronoun: 'they' }, 'general', 'Jordan is kind and he helps his friends.', [])[0],
    };
  });
  assert.strictEqual(r.ok, 0);
  assert.strictEqual(r.a.fixed, 'Sam shows his best work and helps his friends.');
  assert.strictEqual(r.b.fixed, 'Ava shows her best work and Ava helps her.');
  assert.ok(r.c.partial && r.c.kinds.includes('pronoun'));
  await page.context().close();
});

test('finalCheck finds another student\'s name and spacing slips, and fixes them', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const sam = { name: 'Sam', pronoun: 'he' };
    return {
      n: finalCheck(sam, 'general', 'Sam works well with Ava.', ['Ava', 'Sam'])[0],
      s: finalCheck(sam, 'general', 'Sam  reads well , and writes clearly.Next term.', [])[0],
    };
  });
  assert.deepStrictEqual(r.n.kinds, ['othername']); assert.strictEqual(r.n.fixed, null);
  assert.deepStrictEqual(r.s.kinds, ['spacing']); assert.ok(!/  | ,/.test(r.s.fixed), r.s.fixed);
  await page.context().close();
});

test('finalCheck shows "her mother" as a check, finds half a hyphenated name, a doubled word and a missing full stop', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const sam = { name: 'Sam', pronoun: 'he' }, mj = { name: 'Mary-Jane', pronoun: 'she' };
    return {
      rel: finalCheck(sam, 'general', 'Sam talks about her mother often.', [])[0],
      hy: finalCheck(mj, 'general', 'Mary works well and Mary-Jane shares.', [])[0],
      dd: finalCheck(sam, 'general', 'Sam works works hard.', [])[0],
      en: finalCheck(sam, 'general', 'Sam works hard', [])[0],
    };
  });
  assert.ok(r.rel.partial && /someone else/.test(r.rel.note));
  assert.strictEqual(r.hy.fixed, 'Mary-Jane works well and Mary-Jane shares.');
  assert.strictEqual(r.dd.fixed, 'Sam works hard.');
  assert.strictEqual(r.en.fixed, 'Sam works hard.');
  await page.context().close();
});

test('running the check changes nothing, and Fix writes the corrected sentence through Review', async () => {
  const page = await openApp();
  await seedClass(page);
  await settle(page);
  const r = await page.evaluate(() => {
    // Put a wrong pronoun into Sam's (he) general comment the way a paste would.
    switchStu(0); setSubject('general'); setView('publish');
    const sp = document.querySelector('#pubContent span[data-si]');
    sp.textContent = 'Sam is proud of her work and she shares it.';
    _afterReviewEdit(); setView('stats');
    const before = JSON.stringify(students.map(s => [s.pubEditGeneral, s.name]));
    runFinalCheck();
    const after1 = JSON.stringify(students.map(s => [s.pubEditGeneral, s.name]));
    const items = _fc.items.filter(x => x.stuIdx === 0 && x.subj === 'general' && x.kinds.includes('pronoun'));
    const found = items.length;
    _fcApply(items.filter(x => x.fixed && !x.partial));
    const text = commentText(students[0], 'general');
    return { unchanged: before === after1, found, text, view: currentView, left: _fc.items.filter(x => x.stuIdx === 0 && x.kinds.includes('pronoun') && !x.partial).length };
  });
  assert.ok(r.unchanged); assert.ok(r.found >= 1, JSON.stringify(r));
  assert.ok(!/\bher\b/.test(r.text) || /she shares/.test(r.text) === false, r.text);
  assert.strictEqual(r.view, 'stats'); assert.strictEqual(r.left, 0);
  await page.context().close();
});

test('every bank sentence passes the pronoun check for he, she and they', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const bad = [];
    const all = [];
    Object.values(RAW).forEach(a => a.forEach(t => all.push(t)));
    ['he', 'she', 'they'].forEach(p => all.forEach(t => {
      const txt = t.replace(/\{\{N\}\}/g, 'Mia').replace(/\{\{S\}\}/g, PR[p].S).replace(/\{\{s\}\}/g, PR[p].s).replace(/\{\{O\}\}/g, PR[p].O).replace(/\{\{o\}\}/g, PR[p].o).replace(/\{\{Pos\}\}/g, PR[p].Pos).replace(/\{\{pos\}\}/g, PR[p].pos).replace(/\{\{r\}\}/g, PR[p].r);
      finalCheck({ name: 'Mia', pronoun: p }, 'general', txt, []).forEach(x => { if (x.kinds.includes('pronoun')) bad.push(p + ': ' + txt); });
    }));
    return bad.slice(0, 5);
  });
  assert.deepStrictEqual(r, []);
  await page.context().close();
});

test('review fixes: own hyphenated name is not flagged, common-word names are skipped, pronoun fix leaves names alone, ellipsis kept, teacher put back', async () => {
  const page = await openApp();
  await seedClass(page); await settle(page);
  const r = await page.evaluate(() => {
    const rl = { name: 'Ruby-Lee', pronoun: 'she' }, sam = { name: 'Sam', pronoun: 'he' };
    const own = finalCheck(rl, 'general', 'Ruby-Lee is kind and shares her work.', ['Ruby-Lee', 'Sam']);
    const common = finalCheck(sam, 'general', 'Will Sam try harder? Sam may improve in May.', ['Will', 'May', 'Grace']);
    const combo = finalCheck(sam, 'general', 'Sam helps Zara with her work.', ['Zara']);
    const ell = finalCheck(sam, 'general', 'Sam wrote "Wait..." today.', []);
    switchStu(1); setSubject('english'); setView('publish');
    const sp = Array.from(document.querySelectorAll('#pubContent span[data-si]')).filter(x => !x.classList.contains('fd-line'))[1];
    sp.textContent = sp.textContent.replace(/\b(She|she)\b/, m => m === 'She' ? 'He' : 'he').replace(/\b(her)\b/, 'his');
    _afterReviewEdit(); setView('stats');
    switchStu(3); setSubject('maths'); setView('stats');
    runFinalCheck();
    const its = _fc.items.filter(x => x.stuIdx === 1 && x.kinds.includes('pronoun') && x.fixed && !x.partial);
    _fcApply(its);
    return { own: own.length, common: common.length, combo: combo.map(x => [x.kinds, x.fixed]), ell: ell.length, pos: [currentIdx, currentSubject, currentView], n: its.length };
  });
  assert.strictEqual(r.own, 0, JSON.stringify(r)); assert.strictEqual(r.common, 0, JSON.stringify(r.common));
  assert.deepStrictEqual(r.combo, [[['pronoun'], 'Sam helps Zara with his work.'], [['othername'], null]]);
  assert.strictEqual(r.ell, 0); assert.ok(r.n >= 1);
  assert.deepStrictEqual(r.pos, [3, 'maths', 'stats']);
  await page.context().close();
});
