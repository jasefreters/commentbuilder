// The app with email accounts switched on (v3.20.0), running against the real Worker code (worker/worker.js) with
// stand-in storage: making an account, moving a username + PIN account across, syncing, codes, and signing out.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { browser, closeBrowser, APP } = require('./helpers');
const { world, loadWorker, cls } = require('./worker-harness');

after(closeBrowser);
const ON = { ACCOUNTS: 'on', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Report Ready <hello@example.com>' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

// Opens the app with its cloud calls answered by the Worker code in this process
async function openWithWorker(w, init) {
  const wk = await loadWorker();
  const ctx = await (await browser()).newContext();
  await ctx.route(/^https?:\/\//, async route => {
    const req = route.request(); const url = new URL(req.url());
    if (!/workers\.dev$/.test(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>landing</p>' });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const headers = { ...req.headers(), 'cf-connecting-ip': '1.1.1.1' };
    const res = await wk.fetch(new Request(url.href, { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() }), w.env);
    return route.fulfill({ status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: await res.text() });
  });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(APP);
  await page.waitForFunction(() => typeof _stateLoaded !== 'undefined' && _stateLoaded && typeof _acctCfg !== 'undefined', null, { timeout: 15000 });
  await page.evaluate(() => { _rcShownThisLoad = true; const o = document.getElementById('rcOverlay'); if (o) o.style.display = 'none'; window.confirm = () => true; });
  await page.waitForFunction(() => acctLive(), null, { timeout: 5000 }).catch(() => {});
  return page;
}
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });

test('accounts on: a new teacher makes an account, gets the trial, and their class syncs to it', async () => {
  const w = world(ON);
  const page = await openWithWorker(w);
  await page.evaluate(() => {
    students = [_normStudent({ name: 'Sam', pronoun: 'he', year: '5' }, 0), _normStudent({ name: 'Ava', pronoun: 'she', year: '5' }, 1)];
    currentIdx = 0; totalStudents = 2; loadCur(); render(); autoSave();
    toggleSettings('account');
  });
  assert.ok(await page.isVisible('#lpAccount'));
  assert.ok(!(await page.textContent('#lpAccount')).includes('Preview.'), 'no preview banner once accounts are on');
  await page.fill('#lpEmail', 'new@school.edu.au'); await page.fill('#lpPass', 'kookaburra-55');
  await page.click('#lpAccount >> text=Create account');
  await until(page, () => !!document.getElementById('lpVerify'));
  await page.fill('#lpVerify', w.codeFor('new@school.edu.au'));
  await page.click('#lpAccount >> text=Verify and start my trial');
  await until(page, () => /Free trial · 7 days left/.test(document.getElementById('lpAccount').textContent));
  assert.match(await page.textContent('#lpAccount'), /new@school\.edu\.au/);
  const id = JSON.parse(w.env.SESSIONS.m.get([...w.env.SESSIONS.m.keys()].find(k => k.startsWith('user:'))).v).id;
  await until(page, () => true);
  await new Promise(r => setTimeout(r, 300));
  const saved = w.env.SESSIONS.m.get('class:' + id + ':2026');
  assert.ok(saved, 'the class reached the account');
  assert.deepStrictEqual(JSON.parse(saved.v).students.map(s => s.name), ['Sam', 'Ava']);
  // a code from the admin applies on the account card
  await w.call('POST', '/admin/codes', { admin: w.env.ADMIN_KEY, body: { code: 'STAFF2027', type: 'lifetime', uses: 5 } });
  await page.fill('#lpCode', 'staff2027'); await page.click('#lpAccount >> text=Apply');
  await until(page, () => /Lifetime access/.test(document.getElementById('lpAccount').textContent));
  assert.deepStrictEqual(page.errors, []);
  await page.context().close();
});

test('a username + PIN teacher is asked to add an email; their classes move across and the PIN stops working', async () => {
  const w = world(ON);
  await w.call('PUT', '/session', { token: 'jason:4821', body: { ...cls(3), savedAt: '2026-11-20T00:00:00.000Z' } });
  const page = await openWithWorker(w, () => { localStorage.setItem('rcb_cloud_user', JSON.stringify('jason')); localStorage.setItem('rcb_cloud_pin', JSON.stringify('4821')); });
  await until(page, () => students.length === 3);
  await page.evaluate(() => toggleSettings('account'));
  await until(page, () => /Add your email and a password/.test(document.getElementById('lpAccount').textContent));
  await page.fill('#lpEmail', 'jason@school.edu.au'); await page.fill('#lpPass', 'magpie-swoop-9');
  await page.click('#lpAccount >> text=Add email and password');
  await until(page, () => !!document.getElementById('lpVerify'));
  await page.fill('#lpVerify', w.codeFor('jason@school.edu.au'));
  await page.click('#lpAccount >> text=Verify and move my account');
  await until(page, () => /Lifetime access/.test(document.getElementById('lpAccount').textContent));
  const r = await page.evaluate(() => ({ legacy: _legacyToken(), acct: !!acctToken(), n: students.length, msg: document.getElementById('lpAccount').textContent }));
  assert.strictEqual(r.legacy, null, 'the username and PIN are gone from this device');
  assert.ok(r.acct);
  assert.strictEqual(r.n, 3);
  assert.match(r.msg, /PIN no longer works/);
  assert.strictEqual((await w.call('GET', '/session', { token: 'jason:4821' })).status, 410);
  assert.deepStrictEqual(page.errors, []);
  await page.context().close();
});

test('signing out saves, then clears the class from this computer; signing back in brings it back', async () => {
  const w = world(ON);
  const page = await openWithWorker(w);
  await page.evaluate(() => { students = [_normStudent({ name: 'Mia', pronoun: 'she', year: '5' }, 0)]; currentIdx = 0; totalStudents = 1; loadCur(); render(); autoSave(); toggleSettings('account'); });
  await page.fill('#lpEmail', 'mia@school.edu.au'); await page.fill('#lpPass', 'wattle-tree-12');
  await page.click('#lpAccount >> text=Create account');
  await until(page, () => !!document.getElementById('lpVerify'));
  await page.fill('#lpVerify', w.codeFor('mia@school.edu.au'));
  await page.click('#lpAccount >> text=Verify and start my trial');
  await until(page, () => /Free trial/.test(document.getElementById('lpAccount').textContent));
  await Promise.all([page.waitForURL(/github\.io/), page.evaluate(() => acctSignOut())]);
  await page.goto(APP);
  await page.waitForFunction(() => typeof _stateLoaded !== 'undefined' && _stateLoaded, null, { timeout: 15000 });
  const cleared = await page.evaluate(() => ({ token: acctToken(), stored: Object.keys(localStorage).filter(k => /^rcb_session/.test(k)).map(k => localStorage.getItem(k)).join(' '), names: students.map(s => s.name).filter(Boolean) }));
  assert.strictEqual(cleared.token, '');
  assert.ok(!cleared.stored.includes('Mia'), 'the class is gone from this computer');
  assert.deepStrictEqual(cleared.names, []);
  await page.evaluate(() => { _rcShownThisLoad = true; const o = document.getElementById('rcOverlay'); if (o) o.style.display = 'none'; });
  await page.waitForFunction(() => acctLive(), null, { timeout: 5000 });
  await page.evaluate(() => toggleSettings('account'));
  await page.fill('#lpEmail', 'mia@school.edu.au'); await page.fill('#lpPass', 'wattle-tree-12');
  await page.click('#lpAccount >> text=Sign in');
  await until(page, () => students.some(s => s.name === 'Mia'));
  await page.context().close();
});

test('accounts off (the Worker says so, or doesn\'t know): no account section unless the preview is on', async () => {
  const w = world();
  const page = await openWithWorker(w);
  const r = await page.evaluate(() => { toggleSettings('account'); return { live: acctLive(), hidden: document.getElementById('lpAccount').hidden }; });
  assert.deepStrictEqual(r, { live: false, hidden: true });
  await page.context().close();
});
