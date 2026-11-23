// Pronoun fix plan, Step 3 (v3.17.49): templatise and Final check use the one "her" reader.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

test('every bank sentence written for Ava, saved through templatise and used for Sam, reads as the bank does for Sam', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const all = []; const walk = o => { if (typeof o === 'string') { if (o.length > 10) all.push(o); } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    [RAW, ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD].forEach(walk);
    const bad = [];
    for (const src of new Set(all)) {
      const back = templatise(applyRaw(src, 'Ava', PR.she, '5'), 'Ava', PR.she);
      const got = applyRaw(back, 'Sam', PR.he, '5'), want = applyRaw(src, 'Sam', PR.he, '5');
      if (got !== want) bad.push(want + '  ||  ' + got);
    }
    return bad;
  });
  assert.deepStrictEqual(r.slice(0, 5), []);
  await page.context().close();
});

test('"Add & save to my bank" asks "like him or like his" only for a "her" the reader is not sure about', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(async () => {
    const i = students.findIndex(s => s.name === 'Ava'); switchStu(i); setSubject('general'); setView('build'); render();
    const tab = currentTab, ta = () => document.getElementById('customInput');
    const open = () => { const m = document.getElementById('herAsk'); return !!(m && m.style.display === 'flex'); };
    const out = {};
    // sure: no question
    if (typeof toggleComposer === 'function' && !ta()) toggleComposer();
    ta().value = 'Ava shares her ideas and others help her when she is stuck.';
    addCustomSentence(true); out.sureAsked = open(); out.sureSaved = (myBank[tab] || []).map(x => x.text).pop();
    // not sure: question, then "like his"
    if (!ta()) toggleComposer();
    ta().value = 'Staff appreciate her calm manner.';
    addCustomSentence(true); out.asked = open();
    out.dialog = !!document.querySelector('#herAsk [role=dialog][aria-modal=true]');
    document.querySelector('#herAsk [data-her="poss"]').click();
    out.closed = !open(); out.saved = (myBank[tab] || []).map(x => x.text).pop();
    // cancel saves nothing
    if (!ta()) toggleComposer();
    ta().value = 'Visitors admire her painting.';
    const n = (myBank[tab] || []).length;
    addCustomSentence(true); document.querySelector('#herAsk [data-her="cancel"]').click();
    out.cancelSaved = (myBank[tab] || []).length - n;
    return out;
  });
  assert.strictEqual(r.sureAsked, false);
  assert.strictEqual(r.sureSaved, '{{N}} shares {{pos}} ideas and others help {{o}} when {{s}} is stuck.');
  assert.strictEqual(r.asked, true); assert.strictEqual(r.dialog, true); assert.strictEqual(r.closed, true);
  assert.strictEqual(r.saved, 'Staff appreciate {{pos}} calm manner.');
  assert.strictEqual(r.cancelSaved, 0);
  await page.context().close();
});

test('Final check offers "help him learn" for a boy, and leaves a not-sure "her" to the teacher', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const sam = { name: 'Sam', pronoun: 'he' };
    return {
      a: finalCheck(sam, 'general', 'Sam uses strategies that help her learn.', [])[0],
      b: finalCheck(sam, 'general', 'Staff give her extra time so Sam can finish.', [])[0],
      c: finalCheck(sam, 'general', 'Sam packs her camera.', [])[0],
    };
  });
  assert.strictEqual(r.a.fixed, 'Sam uses strategies that help him learn.'); assert.ok(!r.a.partial);
  assert.strictEqual(r.b.fixed, 'Staff give him extra time so Sam can finish.');
  assert.ok(r.c.partial && r.c.fixed === null && /him.*his/.test(r.c.note), r.c.note);
  await page.context().close();
});
