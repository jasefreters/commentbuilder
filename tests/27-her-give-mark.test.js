// v3.17.51: give-type verbs read "her" as "him" only before something a person is given; an undecided pasted "her" is marked in the draft.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, closeBrowser } = require('./helpers');
const { corpusInPage } = require('./pronoun-corpus');
after(closeBrowser);

test('give-type verbs: "give her extra time" is him, "brings her camera" is not sure, and the bank is still never sure and wrong', async () => {
  const page = await openApp();
  const r = await page.evaluate((src) => {
    const C = (new Function('return ' + src))()();
    return {
      bad: C.filter(e => { const h = herRole(e.before, e.after); return h.sure && h.role !== e.role; }).map(e => e.sentence),
      time: herRole('Staff give ', ' extra time.'), opp: herRole('This has given ', ' increased opportunities to share.'),
      cam: herRole('She brings ', ' camera.'), best: herRole('She continues giving ', ' best.'), cont: herRole('I look forward to seeing ', ' continued success.'),
    };
  }, corpusInPage.toString());
  assert.deepStrictEqual(r.bad, []);
  assert.deepStrictEqual(r.time, { role: 'obj', sure: true }); assert.deepStrictEqual(r.opp, { role: 'obj', sure: true });
  assert.strictEqual(r.cam.sure, false);
  assert.deepStrictEqual(r.best, { role: 'poss', sure: true }); assert.deepStrictEqual(r.cont, { role: 'poss', sure: true });
  await page.context().close();
});

async function pasteFor(page, who, text, pronoun) {
  return page.evaluate(async ([who, text, pronoun]) => {
    switchStu(students.findIndex(s => s.name === who)); setSubject('general'); setView('build'); render();
    if (pronoun) cur().pronoun = pronoun;
    const el = document.getElementById('outEditable'); el.innerText = '';
    el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return { marks: [...el.querySelectorAll('.her-ask')].map(m => m.textContent), toast: document.getElementById('toast').textContent };
  }, [who, text, pronoun]);
}
const PASTE = 'Mia is kind. She is calm and staff appreciate her calm manner. Mia reads daily.';

test('an undecided "her" in a paste for a boy is underlined, and choosing "his" fixes it; the mark is never saved', async () => {
  const page = await openApp(); await seedClass(page);
  const a = await pasteFor(page, 'Sam', PASTE);
  assert.deepStrictEqual(a.marks, ['her']); assert.ok(/underlined/.test(a.toast), a.toast);
  const r = await page.evaluate(async () => {
    const el = document.getElementById('outEditable');
    const saved = String(cur().draft || cur().generalDraft || '') + JSON.stringify(cur());
    el.querySelector('.her-ask').click();
    const pop = document.getElementById('herAskPop'), labels = [...pop.querySelectorAll('button')].map(b => b.textContent);
    pop.querySelector('[data-w="his"]').click();
    onDraftBlur(); await new Promise(r => setTimeout(r, 1000));
    return { labels, popGone: !document.getElementById('herAskPop'), draft: el.innerText.trim(), marks: el.querySelectorAll('.her-ask').length, final: commentText(cur(), 'general'), savedHasMark: /her-ask/.test(saved) };
  });
  assert.deepStrictEqual(r.labels, ['him', 'his', 'Leave it']);
  assert.strictEqual(r.draft, 'Sam is kind. He is calm and staff appreciate his calm manner. Sam reads daily.');
  assert.strictEqual(r.final, r.draft); assert.strictEqual(r.marks, 0); assert.ok(r.popGone); assert.strictEqual(r.savedHasMark, false);
  await page.context().close();
});

test('a "they" student is offered them / their; a girl gets no mark', async () => {
  const page = await openApp(); await seedClass(page);
  const j = await pasteFor(page, 'Jordan', PASTE, 'they');
  assert.deepStrictEqual(j.marks, ['her']);
  const labels = await page.evaluate(() => { document.querySelector('#outEditable .her-ask').click(); return [...document.querySelectorAll('#herAskPop button')].map(b => b.textContent); });
  assert.deepStrictEqual(labels, ['them', 'their', 'Leave it']);
  const a = await pasteFor(page, 'Ava', PASTE);
  assert.deepStrictEqual(a.marks, []);
  await page.context().close();
});
