// Pronoun fix plan, Step 6a (v3.17.50): a comment written for another student is changed to this student as it is pasted.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, closeBrowser } = require('./helpers');
after(closeBrowser);

const MIA = 'Mia is a kind and caring student. She shares her ideas and others respect her because she listens. Mia always helps.';

// Pastes the way a browser does: a paste event with the clipboard text; if the app does not take it over, the text goes in as typed.
async function paste(page, who, text, opts = {}) {
  return page.evaluate(async ([who, text, opts]) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    if (opts.flagOff) lsSet('rcb_pasteconvert', false);
    switchStu(students.findIndex(s => s.name === who)); setSubject('general'); setView('build'); render();
    if (opts.pronoun) cur().pronoun = opts.pronoun;
    const el = document.getElementById('outEditable'); el.innerText = ''; document.getElementById('toast').textContent = '';
    el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    if (!ev.defaultPrevented) document.execCommand('insertText', false, text);
    onDraftInput();
    const toast = document.getElementById('toast').textContent;
    if (opts.undo) { const b = document.querySelector('#toast .toast-btn'); if (b) b.click(); onDraftInput(); }
    onDraftBlur(); await wait(1200);
    const final = commentText(cur(), 'general');
    setView('publish'); await wait(300);
    const review = document.getElementById('pubContent').textContent.replace(/\s+/g, ' ').trim();
    const others = _fcAllFirstNames().filter(n => n !== who);
    const fc = finalCheck(cur(), 'general', final, others).concat(fcNoName(cur(), 'general', final));
    return { draft: el.innerText.trim(), final, review, toast, fc: fc.map(x => x.kinds.join('+')), keys: Object.keys(cur()).sort().join(',') };
  }, [who, text, opts]);
}

test('Mia\'s comment pasted into Ava\'s draft becomes Ava\'s, in the draft, Review and export, and Final check finds nothing', async () => {
  const page = await openApp(); await seedClass(page);
  const before = await page.evaluate(() => Object.keys(students.find(s => s.name === 'Ava')).sort().join(','));
  const r = await paste(page, 'Ava', MIA);
  const want = 'Ava is a kind and caring student. She shares her ideas and others respect her because she listens. Ava always helps.';
  assert.strictEqual(r.draft, want); assert.strictEqual(r.final, want); assert.ok(r.review.includes(want), r.review);
  assert.deepStrictEqual(r.fc, []);
  assert.ok(/Changed Mia to Ava/.test(r.toast) && /Undo/.test(r.toast), r.toast);
  assert.strictEqual(r.keys, before, 'no new keys on the saved student');
  await page.context().close();
});

test('the same paste into Sam\'s and Jordan\'s drafts gives he and they, with the right verbs', async () => {
  const page = await openApp(); await seedClass(page);
  const s = await paste(page, 'Sam', MIA);
  assert.strictEqual(s.final, 'Sam is a kind and caring student. He shares his ideas and others respect him because he listens. Sam always helps.');
  assert.ok(/she to he/.test(s.toast), s.toast);
  const j = await paste(page, 'Jordan', MIA, { pronoun: 'they' });
  assert.strictEqual(j.final, 'Jordan is a kind and caring student. They share their ideas and others respect them because they listen. Jordan always helps.');
  await page.context().close();
});

test('"her mother" and another student named in the comment are left alone; a not-sure "her" is left and flagged', async () => {
  const page = await openApp(); await seedClass(page);
  const a = await paste(page, 'Sam', 'Mia talks about her mother often. She works well with Tom. Mia reads daily.');
  assert.strictEqual(a.final, 'Sam talks about her mother often. He works well with Tom. Sam reads daily.');
  const b = await paste(page, 'Sam', 'Mia is kind. She is calm and staff appreciate her calm manner. Mia reads daily.');
  assert.strictEqual(b.final, 'Sam is kind. He is calm and staff appreciate her calm manner. Sam reads daily.');
  assert.ok(b.fc.some(k => k.includes('pronoun')), b.fc.join(' '));
  await page.context().close();
});

test('two subject names, or mixed pronoun sets, are not converted; a name from outside the class needs two uses', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const F = ['Ava', 'Sam', 'Jordan', 'Mia', 'Ruby-Lee', 'Tom'], sam = { name: 'Sam', pronoun: 'he' };
    const c = t => { const x = convertPasted(t, sam, F); return x.changed ? x.text : null; };
    return { two: c('Mia is kind. Tom is funny.'), mixed: c('Mia is kind. She reads. He writes.'), out2: c('Zara is kind. Zara reads well.'), out1: c('Zara is kind. She reads well.'), own: c('Sam is kind. He shares his ideas.') };
  });
  assert.strictEqual(r.two, null);
  assert.strictEqual(r.mixed, 'Sam is kind. She reads. He writes.', 'mixed sets: only the name changes');
  assert.strictEqual(r.out2, 'Sam is kind. Sam reads well.');
  assert.strictEqual(r.out1, null); assert.strictEqual(r.own, null);
  await page.context().close();
});

test('Undo restores the paste exactly, the switch off pastes as today, and this student\'s own comment is unchanged', async () => {
  const page = await openApp(); await seedClass(page);
  const u = await paste(page, 'Ava', MIA, { undo: true });
  assert.strictEqual(u.draft, MIA);
  const own = await paste(page, 'Ava', 'Ava is kind. She shares her ideas.');
  assert.strictEqual(own.draft, 'Ava is kind. She shares her ideas.'); assert.ok(!/Changed/.test(own.toast));
  const off = await paste(page, 'Ava', MIA, { flagOff: true });
  assert.strictEqual(off.draft, MIA);
  await page.context().close();
});
