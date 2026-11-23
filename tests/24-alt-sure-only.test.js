// Pronoun fix plan, Step 2 (v3.17.48): alternation uses the one "her" reader, never writes a guess, and reads other students' names.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
const { corpusInPage } = require('./pronoun-corpus');
after(closeBrowser);
const LEAD = 'Ava works hard. She is kind. ';

test('object "her" on a name turn becomes the name, never "Ava\'s"', async () => {
  const page = await openApp();
  const r = await page.evaluate((L) => ['Others respect her because she is kind.', 'Staff give her extra time.',
    'I would now like to see her take a more active role in class discussions as she has many valuable insights to share.'].map(x => fixAlternation(L + x, 'Ava', PR.she).text.slice(L.length)), LEAD);
  assert.deepStrictEqual(r, ['Others respect Ava because she is kind.', 'Staff give Ava extra time.',
    'I would now like to see Ava take a more active role in class discussions as she has many valuable insights to share.']);
  await page.context().close();
});

test('a "her" the reader is not sure about is left alone, and the next sentence still alternates', async () => {
  const page = await openApp();
  const r = await page.evaluate((L) => ({
    a: fixAlternation(L + 'Staff appreciate her calm manner. She listens well. She reads often.', 'Ava', PR.she).text.slice(L.length),
  }), LEAD);
  assert.strictEqual(r.a, 'Staff appreciate her calm manner. She listens well. Ava reads often.');
  await page.context().close();
});

test('no bank sentence gains "Ava\'s" before a verb or "Ava" before a noun on a name turn (she, he, they)', async () => {
  const page = await openApp();
  const r = await page.evaluate((src) => {
    const C = (new Function('return ' + src))()(), srcs = [...new Set(C.map(e => e.src))], bad = [];
    const V = 'learn|improve|take|continue|succeed|build|understand|speak|grow|explore|develop|become|reach|make|use|work|achieve|focus|share|try|stay|feel|think|be|do|go';
    const N = 'ideas|work|learning|classmates|peers|friends|skills|own|best|writing|reading|confidence|progress|goals';
    for (const [n, pr] of [['Ava', 'she'], ['Sam', 'he'], ['Jordan', 'they']]) for (const s0 of srcs) {
      const s = applyRaw(s0.replace(/^\{\{N\}\}/, '{{S}}'), n, PR[pr], '5'), l = n + ' works hard. ' + PR[pr].S + ' ' + (pr === 'they' ? 'are' : 'is') + ' kind. ';
      const out = fixAlternation(l + s, n, PR[pr]).text.slice(l.length);
      if (new RegExp('\\b' + n + "'s (?:" + V + ')\\b').test(out) || new RegExp('\\b' + n + ' (?:' + N + ')\\b').test(out)) bad.push(out);
    }
    return bad;
  }, corpusInPage.toString());
  assert.deepStrictEqual(r, []);
  await page.context().close();
});

test('a comment pasted from another student in the class is left as pasted in Review and export, and Final check flags the name', async () => {
  const page = await openApp(); await seedClass(page);
  const PASTE = 'Mia is a kind and caring student. She shares her ideas with others. Mia always helps her classmates.';
  const r = await page.evaluate(async (paste) => {
    const i = students.findIndex(s => s.name === 'Ava');
    switchStu(i); setSubject('general'); setView('build'); render();
    const el = document.getElementById('outEditable'); el.innerText = paste;
    onDraftInput(); onDraftBlur();
    await new Promise(r => setTimeout(r, 1200));
    const final = commentText(cur(), 'general');
    setView('publish'); await new Promise(r => setTimeout(r, 400));
    const review = document.getElementById('pubContent').textContent.replace(/\s+/g, ' ').trim();
    const others = _fcAllFirstNames().filter(n => n !== 'Ava');
    return { final, review, fc: finalCheck(cur(), 'general', final, others).filter(x => x.kinds.includes('othername')).length };
  }, PASTE);
  assert.strictEqual(r.final, PASTE);
  assert.ok(r.review.includes('She shares her ideas'), r.review);
  assert.ok(!/Ava shares/.test(r.review), r.review);
  assert.ok(r.fc >= 1);
  await page.context().close();
});
