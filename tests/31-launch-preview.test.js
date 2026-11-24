// Launch preview (v3.19.0): sign-in, the 7-day trial, passes and access codes, kept on the device until the Worker side
// is built. These check the rules that will move to the Worker, and that teachers see nothing unless the preview is on.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');

after(closeBrowser);
const D = 86400000;

test('teachers see nothing of the preview unless it is switched on', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => { toggleSettings('account'); const a = document.getElementById('lpAccount').hidden;
    localStorage.setItem('rcb_preview', 'launch'); setSettingsTab('account'); return [a, document.getElementById('lpAccount').hidden]; });
  assert.deepStrictEqual(r, [true, false]);
  assert.deepStrictEqual(page.errors, []);
  await page.context().close();
});

test('a semester pass ends on the last day of Term 2 or Term 4, whichever comes next', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const t = LP_TERMS_DEFAULT, d = iso => new Date(iso + 'T12:00:00').getTime(), day = ms => new Date(ms).toISOString().slice(0, 10);
    const e = (x) => { const v = lpSemesterEnd(d(x), t); return v && new Date(v).toLocaleDateString('en-CA'); };
    return [e('2026-11-24'), e('2026-12-18'), e('2027-03-01'), e('2027-07-03'), e('2028-01-10')];
  });
  assert.deepStrictEqual(r, ['2026-12-17', '2027-07-02', '2027-07-02', '2027-12-17', null]);
  await page.context().close();
});

test('trial, passes and codes', async () => {
  const page = await openApp();
  const r = await page.evaluate((D) => {
    const now = new Date('2027-03-01T12:00:00').getTime();
    const trial = { email: 'a@b.co', plan: 'trial', until: now + 7 * D };
    const out = {};
    out.trial = lpStatus(trial, now).label;
    out.ended = lpStatus({ email: 'a@b.co', plan: 'trial', until: now - 1 }, now).state;
    out.sem = lpStatus(lpGrant(trial, 'semester', 0, now, LP_TERMS_DEFAULT).acct, now).state;
    out.semUntil = new Date(lpGrant(trial, 'semester', 0, now, LP_TERMS_DEFAULT).acct.until).toLocaleDateString('en-CA');
    const year = lpGrant(trial, 'year', 0, now).acct;
    out.yearDays = Math.round((year.until - now) / D);
    // a trial code on top of a year pass adds days and keeps the pass
    const more = lpGrant(year, 'trial', 30, now).acct;
    out.moreKeepsPlan = more.plan; out.moreDays = Math.round((more.until - now) / D);
    // a semester code never shortens a longer pass
    out.noShorten = lpGrant(year, 'semester', 0, now, LP_TERMS_DEFAULT).acct.until === year.until;
    out.life = lpStatus(lpGrant(trial, 'lifetime', 0, now).acct, now).label;
    const store = { codes: [{ code: 'STAFF', type: 'lifetime', uses: 2, used: [], on: true, expires: '' },
                            { code: 'OLD', type: 'year', uses: 5, used: [], on: true, expires: '2027-01-01' },
                            { code: 'OFF', type: 'year', uses: 5, used: [], on: false, expires: '' }], terms: {} };
    const a = lpRedeem(store, trial, ' staff ', now), again = lpRedeem(store, trial, 'STAFF', now);
    lpRedeem(store, { email: 'c@d.co' }, 'STAFF', now);
    out.redeem = [a.ok && a.acct.plan, again.msg, lpRedeem(store, { email: 'e@f.co' }, 'STAFF', now).msg,
      lpRedeem(store, trial, 'OLD', now).msg, lpRedeem(store, trial, 'OFF', now).msg, lpRedeem(store, trial, 'NOPE', now).msg];
    return out;
  }, D);
  assert.match(r.trial, /^Free trial · 7 days left$/);
  assert.strictEqual(r.ended, 'ended');
  assert.strictEqual(r.sem, 'paid');
  assert.strictEqual(r.semUntil, '2027-07-02');
  assert.strictEqual(r.yearDays, 372);   // bought with 7 trial days left: the year starts when the trial ends
  assert.strictEqual(r.moreKeepsPlan, 'year');
  assert.strictEqual(r.moreDays, 402);
  assert.ok(r.noShorten);
  assert.strictEqual(r.life, 'Lifetime access');
  assert.deepStrictEqual(r.redeem, ['lifetime', 'You’ve already used that code.', 'That code has been used up.',
    'That code has expired.', 'That code has been switched off.', 'That code isn’t right. Check it and try again.']);
  await page.context().close();
});

test('one free trial per email address', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    localStorage.setItem('rcb_preview', 'launch'); toggleSettings('account');
    const make = () => { document.getElementById('lpEmail').value = 'T@School.edu.au'; document.getElementById('lpPass').value = 'longenough'; lpCreate();
      document.getElementById('lpVerify').value = '123456'; lpVerify(); return lpStatus(lpStore().acct).state; };
    const first = make(); lpSignOut(); const second = make();
    return [first, second, document.getElementById('lpEnded').classList.contains('on') || lpStatus(lpStore().acct).state];
  });
  assert.deepStrictEqual(r.slice(0, 2), ['trial', 'ended']);
  await page.context().close();
});
