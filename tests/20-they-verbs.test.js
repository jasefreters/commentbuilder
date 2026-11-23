// Pronoun fix plan, Step 4 (v3.17.44): "they" takes a plural verb in typed or pasted placeholders, and Final check flags "they shares".
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

const PASTE = '{{First-name}} is kind. {{He-she}} shares {{his-her}} ideas and others respect {{him-her}} because {{he-she}} listens.';

test('placeholders pasted into the draft for a "they" student give plural verbs', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(async (paste) => {
    setView('build'); setSubject('general'); render();
    const s = cur(); s.pronoun = 'they'; s.name = 'Jordan';
    const el = document.getElementById('outEditable'); el.innerText = paste;
    onDraftPaste(); onDraftInput(); onDraftBlur();
    await new Promise(r => setTimeout(r, 1200));
    return { draft: el.innerText, final: commentText(cur(), 'general') };
  }, PASTE);
  const want = 'Jordan is kind. They share their ideas and others respect them because they listen.';
  assert.strictEqual(r.draft, want); assert.strictEqual(r.final, want);
  await page.context().close();
});

test('he and she placeholders are filled as before', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const out = {};
    for (const [n, p] of [['Sam', 'he'], ['Ava', 'she']]) { const s = cur(); s.name = n; s.pronoun = p; out[n] = fillTypedPlaceholders('{{He-she}} shares {{his-her}} ideas because {{he-she}} listens.'); }
    return out;
  });
  assert.strictEqual(r.Sam, 'He shares his ideas because he listens.');
  assert.strictEqual(r.Ava, 'She shares her ideas because she listens.');
  await page.context().close();
});

test('Final check flags "They shares" and fixes it, for any student', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => ({
    j: finalCheck({ name: 'Jordan', pronoun: 'they' }, 'general', 'Jordan is kind. They shares their ideas and always listens to others.', []),
    s: finalCheck({ name: 'Sam', pronoun: 'he' }, 'general', 'Sam is kind and they is happy.', []),
    ok: finalCheck({ name: 'Jordan', pronoun: 'they' }, 'general', 'They themselves make choices. They share ideas.', []).length,
  }));
  assert.deepStrictEqual(r.j[0].kinds, ['verb']);
  assert.strictEqual(r.j[0].fixed, 'They share their ideas and always listen to others.');
  assert.strictEqual(r.s[0].fixed, 'Sam is kind and they are happy.');
  assert.strictEqual(r.ok, 0);
  await page.context().close();
});

test('no bank sentence gets a verb flag, for they, he or she (no false alarms)', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const all = []; const walk = o => { if (typeof o === 'string') { if (o.length > 15) all.push(o); } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    [RAW, ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD].forEach(walk);
    const hits = [];
    for (const [n, p] of [['Jordan', 'they'], ['Sam', 'he'], ['Ava', 'she']]) for (const t of all) for (const v of [t, t.replace(/^\{\{N\}\}/, '{{S}}')]) {
      const txt = applyRaw(v, n, PR[p], '5');
      if (finalCheck({ name: n, pronoun: p }, 'english', txt, []).some(x => x.kinds.includes('verb'))) hits.push(n + ': ' + txt);
    }
    return { n: all.length, hits: hits.slice(0, 5), count: hits.length };
  });
  assert.ok(r.n > 900, 'bank read: ' + r.n);
  assert.strictEqual(r.count, 0, r.hits.join('\n'));
  await page.context().close();
});
