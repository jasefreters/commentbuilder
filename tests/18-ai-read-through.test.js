// AI read-through (v3.17.42): names never leave, suggestions render escaped, a fix changes one sentence, Stop and errors behave.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

async function setup() { const page = await openApp(); await seedClass(page); await settle(page); return page; }

test('request bodies hold no student name, and the preview shows what is sent', async () => {
  const page = await setup();
  const r = await page.evaluate(async () => {
    const bodies = [];
    anthropicFetch = async b => { bodies.push(JSON.stringify(b)); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '[]' }] }) }; };
    setView('stats'); startAiReadThrough();
    const sample = _ai.sample, stage = _ai.stage;
    await _aiLoop();
    return { bodies, sample, stage, names: students.map(s => s.name), n: bodies.length, jobs: _ai.jobs.length, after: _ai.stage };
  });
  assert.strictEqual(r.stage, 'confirm'); assert.strictEqual(r.after, 'done');
  assert.strictEqual(r.n, r.jobs); assert.ok(r.n >= 6);
  const parts = new Set(); r.names.forEach(n => { parts.add(n); n.split(/[\s-]+/).forEach(p => p.length >= 2 && parts.add(p)); });
  r.bodies.concat([r.sample]).forEach(b => parts.forEach(n => assert.ok(!new RegExp('\\b' + n + '\\b').test(b), n + ' found in a request')));
  assert.ok(/Student/.test(r.sample));
  await page.context().close();
});

test('a suggestion renders escaped, only real sentences count, and applying a fix changes only that sentence', async () => {
  const page = await setup();
  const r = await page.evaluate(async () => {
    switchStu(0); setSubject('general'); setView('stats');
    const real = splitSentences(commentText(students[0], 'general'));
    const wasBefore = commentText(students[0], 'general');
    startAiReadThrough();
    const anon = _ai.jobs[0].anon.find(p => p.subj === 'general').text; const aSents = splitSentences(anon);
    anthropicFetch = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify([
      { subject: 'general', sentence: aSents[1], problem: '<script>window.__x=1</script> odd word', fix1: 'Student ' + '<img src=x onerror="window.__y=1"> works hard.', fix2: 'Student tries hard.' },
      { subject: 'general', sentence: 'This sentence is not in the comment.', problem: 'made up', fix1: 'a', fix2: 'b' }
    ]) }] }) });
    await _aiLoop();
    const items = _ai.items.length;
    const html = document.getElementById('fcPanel').innerHTML;
    const injected = !!document.querySelector('#fcPanel script, #fcPanel img') || window.__x || window.__y;
    _aiApply(_ai.items[0], 1);
    const after = splitSentences(commentText(students[0], 'general'));
    const changed = after.map((x, i) => x !== real[i]).filter(Boolean).length;
    return { items, injected: !!injected, escaped: html.includes('&lt;script&gt;'), changed, len: [real.length, after.length], second: after[1], name: cn(students[0]), left: _ai.items.length };
  });
  assert.strictEqual(r.items, 1); assert.ok(!r.injected); assert.ok(r.escaped);
  assert.strictEqual(r.changed, 1, JSON.stringify(r)); assert.strictEqual(r.len[0], r.len[1]);
  assert.match(r.second, /^(Sam|He) tries hard\.$/);   // the app's own name and pronoun alternation may turn the name into a pronoun
  assert.strictEqual(r.left, 0);
  await page.context().close();
});

test('Stop halts further requests, and a failed request keeps earlier results and shows the usual message', async () => {
  const page = await setup();
  const r = await page.evaluate(async () => {
    setView('stats'); startAiReadThrough();
    let calls = 0;
    anthropicFetch = async () => { calls++; if (calls === 2) _ai.stop = true; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '[]' }] }) }; };
    await _aiLoop();
    const stopped = { calls, stopped: _ai.stopped, done: _ai.done };
    startAiReadThrough();
    let c2 = 0; const jobs = _ai.jobs.length;
    anthropicFetch = async () => { c2++; if (c2 === 3) throw new Error('AI_LIMIT'); const a = splitSentences(_ai.jobs[c2 - 1].anon[0].text); return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify([{ subject: _ai.jobs[c2 - 1].anon[0].subj, sentence: a[0], problem: 'odd', fix1: 'Student is well.', fix2: 'Student is fine.' }]) }] }) }; };
    await _aiLoop();
    return { stopped, c2, jobs, items: _ai.items.length, err: _ai.err, stage: _ai.stage };
  });
  assert.strictEqual(r.stopped.calls, 2); assert.ok(r.stopped.stopped);
  assert.strictEqual(r.c2, 3); assert.strictEqual(r.items, 2); assert.match(r.err, /AI allowance/); assert.strictEqual(r.stage, 'done');
  await page.context().close();
});
