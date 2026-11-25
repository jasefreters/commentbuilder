// v3.17.53 (audit H): text from students, accounts or the AI service never runs as code on the page.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, closeBrowser } = require('./helpers');
after(closeBrowser);

const P1 = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const P2 = "O'Brien\"><svg onload=window.__xss=99>";
const P3 = "Zed');window.__xss=7;//";

test('hostile student names and notes run nothing on any screen', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(async ([P1, P2, P3]) => {
    const wait = ms => new Promise(r => setTimeout(r, ms)); const log = [];
    students[0].name = P1; students[1].name = P2; students[2].name = P3; students[0].notes = P1; students[1].notes = P2;
    const steps = [() => { setView('build'); setSubject('general'); switchStu(0); render(); }, () => { setSubject('english'); render(); },
      () => { switchStu(1); render(); }, () => { switchStu(2); render(); }, () => { switchStu(0); setView('publish'); }, () => { switchStu(1); setView('publish'); },
      () => setView('stats'), () => { setView('build'); toggleSettings(); }, () => toggleSettings(), () => { runFinalCheck(); }, () => autoSave()];
    for (const f of steps) { try { f(); } catch (e) { log.push(e.message); } await wait(120); }
    const broken = [...document.querySelectorAll('[onclick]')].filter(e => { try { new Function(e.getAttribute('onclick')); return false; } catch (x) { return true; } }).length;
    return { xss: window.__xss || 0, broken, injected: document.querySelectorAll('img[src=x],svg[onload]').length, log };
  }, [P1, P2, P3]);
  assert.strictEqual(r.xss, 0); assert.strictEqual(r.injected, 0); assert.strictEqual(r.broken, 0, 'an onclick handler was broken by a name');
  await page.context().close();
});

test('the admin account list shows a hostile username as text, and its Delete button gets the exact name', async () => {
  const page = await openApp();
  const r = await page.evaluate(async ([P1, P2]) => {
    const calls = [];
    window.adminDeleteAccount = (k, u) => { calls.push([k, u]); };
    window.adminDeleteTeacher = t => { calls.push([t.classes[0].id, t.user]); };   // v3.19.3: Delete removes the whole teacher
    const realFetch = window.fetch;
    window.fetch = async (url) => /admin\/accounts/.test(String(url))
      ? new Response(JSON.stringify({ total: 2, accounts: [{ username: P1, key: 'session:' + P1 + ':1234', lastSaved: 'unknown', students: '<b>9</b>' }, { username: P2, key: 'session:' + P2 + ':9', lastSaved: 'unknown', students: 3 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response('{}', { status: 200 });
    try { await adminRefresh(); } catch (e) {}
    window.fetch = realFetch;
    await new Promise(r => setTimeout(r, 150));
    const rows = [...document.querySelectorAll('#adminTableBody tr')];
    const btns = rows.map(tr => tr.querySelector('button')).filter(Boolean);
    btns.forEach(b => b.click());
    return { xss: window.__xss || 0, injected: document.querySelectorAll('#adminTableBody img, #adminTableBody svg[onload], #adminTableBody b').length, firstCell: rows[0] && rows[0].querySelector('td').textContent.trim(), calls, inline: document.querySelectorAll('#adminTableBody [onclick]').length };
  }, [P1, P2]);
  assert.strictEqual(r.xss, 0); assert.strictEqual(r.injected, 0); assert.strictEqual(r.inline, 0);
  assert.ok(r.firstCell.startsWith(P1), r.firstCell);
  assert.deepStrictEqual(r.calls.map(c => c[1]), [P1, P2]);
  await page.context().close();
});

test('an AI error message is shown as text', async () => {
  const page = await openApp(); await seedClass(page);
  const r = await page.evaluate(async (P1) => {
    setView('publish'); setCloudUser('testteacher'); setCloudPin('1234');
    const wait = ms => new Promise(r => setTimeout(r, ms)); const out = [];
    window.anthropicFetch = async () => new Response(JSON.stringify({ error: { message: P1 } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    try { await runCheck(); } catch (e) {} await wait(100);
    out.push(document.getElementById('checkStatus').textContent);
    window.anthropicFetch = async () => { throw new Error(P1); };
    try { await runCheck(); } catch (e) {} await wait(100);
    out.push(document.getElementById('checkStatus').textContent);
    return { xss: window.__xss || 0, injected: document.querySelectorAll('#checkStatus img').length, out };
  }, P1);
  assert.strictEqual(r.xss, 0); assert.strictEqual(r.injected, 0);
  assert.ok(r.out.every(t => t.includes("<img")), JSON.stringify(r.out));
  await page.context().close();
});
