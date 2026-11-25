// Accounts v2 on the Worker (v3.20.0): email + password, the 6-digit email code, sessions, classes by account with a
// version check, moving a username + PIN account across, codes, term dates, access, and the admin routes.
// Everything is off until the Worker setting ACCOUNTS = "on".
const { test } = require('node:test');
const assert = require('node:assert');
const { world, cls } = require('./worker-harness');

const ON = { ACCOUNTS: 'on', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Report Ready <hello@example.com>', APP_URL: 'https://app.example/' };
const DAY = 86400000;

async function signup(w, email = 'ava@school.edu.au', password = 'blue-kangaroo-7', opts = {}) {
  const s = await w.call('POST', '/auth/signup', { body: { email, password }, ...opts });
  assert.strictEqual(s.status, 200, JSON.stringify(s.json));
  const v = await w.call('POST', '/auth/verify', { body: { email, code: w.codeFor(email) } });
  assert.strictEqual(v.status, 200, JSON.stringify(v.json));
  return v.json;
}

test('off until ACCOUNTS is "on": config says so, the routes answer 404, username + PIN still works', async () => {
  const w = world();
  assert.deepStrictEqual((await w.call('GET', '/auth/config')).json.accounts, false);
  assert.strictEqual((await w.call('POST', '/auth/signup', { body: { email: 'a@b.co', password: 'longenough1' } })).status, 404);
  assert.strictEqual((await w.call('GET', '/admin/codes', { admin: w.env.ADMIN_KEY })).status, 404);
  assert.strictEqual((await w.call('PUT', '/session', { token: 'ava:1234', body: cls(2) })).status, 200);
  assert.strictEqual((await w.call('GET', '/session', { token: 'ava:1234' })).json.found, true);
});

test('without the email service, sign-up says email isn\'t set up yet', async () => {
  const w = world({ ACCOUNTS: 'on' });
  assert.strictEqual((await w.call('GET', '/auth/config')).json.email, false);
  const r = await w.call('POST', '/auth/signup', { body: { email: 'a@b.co', password: 'longenough1' } });
  assert.strictEqual(r.status, 503);
  assert.match(r.json.error, /Email isn.t set up yet/);
});

test('sign-up: password rules, the 6-digit code, then a 7-day trial and a session', async () => {
  const w = world(ON);
  assert.strictEqual((await w.call('POST', '/auth/signup', { body: { email: 'nope', password: 'longenough1' } })).status, 400);
  assert.match((await w.call('POST', '/auth/signup', { body: { email: 'a@b.co', password: 'short' } })).json.error, /at least 8/);
  assert.match((await w.call('POST', '/auth/signup', { body: { email: 'a@b.co', password: 'Password123' } })).json.error, /too easy/);
  await w.call('POST', '/auth/signup', { body: { email: 'Ava@School.edu.au ', password: 'blue-kangaroo-7' } });
  assert.strictEqual(w.emails.length, 1);
  assert.match(w.emails[0].subject, /Your Report Ready code: \d{6}/);
  assert.strictEqual((await w.call('POST', '/auth/verify', { body: { email: 'ava@school.edu.au', code: '000000' } })).status, 400);
  const v = await w.call('POST', '/auth/verify', { body: { email: 'ava@school.edu.au', code: w.codeFor('ava@school.edu.au') } });
  assert.strictEqual(v.status, 200);
  assert.match(v.json.token, /^[0-9a-f]{64}$/);
  assert.strictEqual(v.json.access.state, 'trial');
  assert.strictEqual(v.json.access.daysLeft, 7);
  const me = await w.call('GET', '/me', { bearer: v.json.token });
  assert.strictEqual(me.json.email, 'ava@school.edu.au');
  // nothing stores the password itself
  assert.ok(![...w.env.SESSIONS.m.values()].some(e => e.v.includes('blue-kangaroo-7')));
  // the email is taken now
  assert.strictEqual((await w.call('POST', '/auth/signup', { body: { email: 'ava@school.edu.au', password: 'another-pass-9' } })).status, 409);
});

test('five wrong codes and the code is gone', async () => {
  const w = world(ON);
  await w.call('POST', '/auth/signup', { body: { email: 'a@b.co', password: 'longenough1' } });
  for (let i = 0; i < 5; i++) await w.call('POST', '/auth/verify', { body: { email: 'a@b.co', code: '99999' + i } });
  assert.strictEqual((await w.call('POST', '/auth/verify', { body: { email: 'a@b.co', code: w.codeFor('a@b.co') } })).status, 429);
});

test('sign in, wrong passwords are limited, sign out ends the session', async () => {
  const w = world(ON);
  await signup(w);
  assert.strictEqual((await w.call('POST', '/auth/signin', { body: { email: 'ava@school.edu.au', password: 'wrong-one-1' } })).status, 401);
  const ok = await w.call('POST', '/auth/signin', { body: { email: 'AVA@school.edu.au', password: 'blue-kangaroo-7' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await w.call('GET', '/me', { bearer: ok.json.token })).status, 200);
  await w.call('POST', '/auth/signout', { bearer: ok.json.token });
  assert.strictEqual((await w.call('GET', '/me', { bearer: ok.json.token })).status, 401);
  for (let i = 0; i < 9; i++) await w.call('POST', '/auth/signin', { body: { email: 'ava@school.edu.au', password: 'wrong-' + i + 'xxxx' } });
  assert.strictEqual((await w.call('POST', '/auth/signin', { body: { email: 'ava@school.edu.au', password: 'blue-kangaroo-7' } })).status, 429);
  // across many emails from one address: 30 wrong tries an hour
  const w2 = world(ON);
  for (let i = 0; i < 30; i++) await w2.call('POST', '/auth/signin', { body: { email: 'x' + i + '@b.co', password: 'whatever-1' } });
  assert.strictEqual((await w2.call('POST', '/auth/signin', { body: { email: 'y@b.co', password: 'whatever-1' } })).status, 429);
});

test('a password stored with fewer rounds is re-scrambled at the next sign-in', async () => {
  const w = world(ON);
  const v = await signup(w);
  const id = (await w.call('GET', '/me', { bearer: v.token })).json && [...w.env.SESSIONS.m.keys()].find(k => k.startsWith('user:'));
  const u = JSON.parse(w.env.SESSIONS.m.get(id).v);
  const before = u.pw.hash;
  u.pw.rounds = 1; u.pw.hash = (await (async () => {   // pretend it was stored with 1 round
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('blue-kangaroo-7'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(u.pw.salt), c => c.charCodeAt(0)), iterations: 1 }, key, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  })());
  w.env.SESSIONS.m.get(id).v = JSON.stringify(u);
  assert.strictEqual((await w.call('POST', '/auth/signin', { body: { email: 'ava@school.edu.au', password: 'blue-kangaroo-7' } })).status, 200);
  const after = JSON.parse(w.env.SESSIONS.m.get(id).v).pw;
  assert.ok(after.rounds > 1);
  assert.notStrictEqual(after.hash, before);
});

test('forgot password: same answer for any email; the link sets a new password and signs out other devices', async () => {
  const w = world(ON);
  const v = await signup(w);
  assert.deepStrictEqual((await w.call('POST', '/auth/forgot', { body: { email: 'nobody@b.co' } })).json, { ok: true });
  const n = w.emails.length;
  assert.deepStrictEqual((await w.call('POST', '/auth/forgot', { body: { email: 'ava@school.edu.au' } })).json, { ok: true });
  assert.strictEqual(w.emails.length, n + 1);
  const t = w.resetFor('ava@school.edu.au');
  assert.ok(w.emails[n].text.includes('https://app.example/?reset='));
  assert.match((await w.call('POST', '/auth/reset', { body: { token: t, password: 'short' } })).json.error, /at least 8/);
  await new Promise(r => setTimeout(r, 5));
  const r = await w.call('POST', '/auth/reset', { body: { token: t, password: 'green-wombat-42' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await w.call('GET', '/me', { bearer: v.token })).status, 401, 'the old session ended');
  assert.strictEqual((await w.call('GET', '/me', { bearer: r.json.token })).status, 200);
  assert.strictEqual((await w.call('POST', '/auth/reset', { body: { token: t, password: 'another-one-9' } })).status, 400, 'a link works once');
  assert.strictEqual((await w.call('POST', '/auth/signin', { body: { email: 'ava@school.edu.au', password: 'green-wombat-42' } })).status, 200);
});

test('classes by account and year, with a version check so another device\'s newer save isn\'t lost (D7)', async () => {
  const w = world(ON);
  const { token } = await signup(w);
  assert.deepStrictEqual((await w.call('GET', '/class?year=2026', { bearer: token })).json, { found: false, version: 0 });
  const a = await w.call('PUT', '/class?year=2026', { bearer: token, body: cls(3), headers: { 'X-Base-Version': '0' } });
  assert.strictEqual(a.json.version, 1);
  const b = await w.call('PUT', '/class?year=2026', { bearer: token, body: cls(4), headers: { 'X-Base-Version': '1' } });
  assert.strictEqual(b.json.version, 2);
  // a device that last saw version 1 is stopped, and gets the newer copy
  const stale = await w.call('PUT', '/class?year=2026', { bearer: token, body: cls(9), headers: { 'X-Base-Version': '1' } });
  assert.strictEqual(stale.status, 409);
  assert.strictEqual(stale.json.version, 2);
  assert.strictEqual(stale.json.session.students.length, 4);
  // a save with no base version (the teacher chose "keep mine") goes through
  assert.strictEqual((await w.call('PUT', '/class?year=2026', { bearer: token, body: cls(9) })).json.version, 3);
  await w.call('PUT', '/class?year=2027', { bearer: token, body: cls(1) });
  const g = await w.call('GET', '/class?year=2026', { bearer: token });
  assert.strictEqual(g.json.session.students.length, 9);
  assert.strictEqual((await w.call('GET', '/class?year=2027', { bearer: token })).json.session.students.length, 1);
  assert.strictEqual((await w.call('GET', '/class?year=1999', { bearer: token })).status, 400);
  assert.strictEqual((await w.call('GET', '/class?year=2026')).status, 401);
});

test('moving a username + PIN account across at sign-up: every year copied, lifetime, the PIN switched off', async () => {
  const w = world(ON);
  await w.call('PUT', '/session', { token: 'jason:4821', body: cls(24) });
  await w.call('PUT', '/session', { token: 'jason:4821', year: 2027, body: cls(1) });
  await w.call('PUT', '/session', { token: 'jason:48211', body: cls(5) });   // someone else, PIN starts the same
  assert.strictEqual((await w.call('POST', '/auth/signup', { token: 'jason:0000', body: { email: 'j@school.edu.au', password: 'long-enough-1' } })).status, 400);
  const v = await signup(w, 'j@school.edu.au', 'long-enough-1', { token: 'jason:4821' });
  assert.strictEqual(v.access.plan, 'lifetime');
  assert.strictEqual((await w.call('GET', '/class?year=2026', { bearer: v.token })).json.session.students.length, 24);
  assert.strictEqual((await w.call('GET', '/class?year=2027', { bearer: v.token })).json.session.students.length, 1);
  const old = await w.call('GET', '/session', { token: 'jason:4821' });
  assert.strictEqual(old.status, 410);
  assert.match(old.json.error, /Sign in with your email/);
  assert.strictEqual((await w.call('PUT', '/session', { token: 'jason:4821', body: cls(1) })).status, 410);
  // the other account is untouched
  assert.strictEqual((await w.call('GET', '/session', { token: 'jason:48211' })).json.session.students.length, 5);
  // the old copy stays as a 30-day backup
  const e = w.env.SESSIONS.m.get('session:jason:4821');
  assert.ok(e && e.exp > Date.now() + 29 * DAY && e.exp < Date.now() + 31 * DAY);
});

test('moving across after making the email account first (/auth/link)', async () => {
  const w = world(ON);
  await w.call('PUT', '/session', { token: 'ben:1111', body: cls(7) });
  const v = await signup(w, 'ben@school.edu.au', 'long-enough-2');
  assert.strictEqual(v.access.plan, 'trial');
  const l = await w.call('POST', '/auth/link', { bearer: v.token, token: 'ben:1111' });
  assert.strictEqual(l.json.moved, 1);
  assert.strictEqual(l.json.access.plan, 'lifetime');
  assert.strictEqual((await w.call('GET', '/class', { bearer: v.token })).json.session.students.length, 7);
});

test('one free trial per email, even after the account is deleted', async () => {
  const w = world(ON);
  await signup(w, 'c@b.co', 'long-enough-3');
  const users = (await w.call('GET', '/admin/users', { admin: w.env.ADMIN_KEY })).json.users;
  assert.strictEqual((await w.call('DELETE', '/admin/users/' + users[0].id, { admin: w.env.ADMIN_KEY })).status, 200);
  const again = await signup(w, 'c@b.co', 'long-enough-3');
  assert.strictEqual(again.access.state, 'ended');
  assert.strictEqual(again.hadTrial, true);
});

test('codes: the admin makes them, teachers redeem them, with the same rules as the preview', async () => {
  const w = world(ON);
  const A = { admin: w.env.ADMIN_KEY };
  assert.strictEqual((await w.call('POST', '/admin/codes', { ...A, body: { code: 'staff room', type: 'lifetime', uses: 2 } })).json.code.code, 'STAFFROOM');
  assert.strictEqual((await w.call('POST', '/admin/codes', { ...A, body: { code: 'STAFFROOM', type: 'year', uses: 2 } })).status, 409);
  await w.call('POST', '/admin/codes', { ...A, body: { code: 'TRIAL30', type: 'trial', days: 30, uses: 100 } });
  await w.call('POST', '/admin/codes', { ...A, body: { code: 'OLDONE', type: 'year', uses: 5, expires: '2020-01-01' } });
  const t1 = (await signup(w, 'a1@b.co', 'long-enough-4')).token;
  const t2 = (await signup(w, 'a2@b.co', 'long-enough-5')).token;
  const t3 = (await signup(w, 'a3@b.co', 'long-enough-6')).token;
  const redeem = (t, code) => w.call('POST', '/codes/redeem', { bearer: t, body: { code } });
  const r = await redeem(t1, 'staffroom');
  assert.strictEqual(r.json.access.plan, 'lifetime');
  assert.match((await redeem(t1, 'STAFFROOM')).json.error, /already used/);
  await redeem(t2, 'STAFFROOM');
  assert.match((await redeem(t3, 'STAFFROOM')).json.error, /used up/);
  assert.match((await redeem(t3, 'OLDONE')).json.error, /expired/);
  assert.match((await redeem(t3, 'NOPE')).json.error, /isn.t right/);
  const tr = await redeem(t3, 'TRIAL30');
  assert.strictEqual(tr.json.access.state, 'trial');
  assert.strictEqual(tr.json.access.daysLeft, 37);
  await w.call('PATCH', '/admin/codes/TRIAL30', { ...A, body: { on: false } });
  assert.match((await redeem(t3, 'TRIAL30')).json.error, /switched off/);
  const list = (await w.call('GET', '/admin/codes', A)).json.codes;
  assert.strictEqual(list.find(c => c.code === 'STAFFROOM').used.length, 2);
  // a teacher can't reach the admin routes
  assert.strictEqual((await w.call('GET', '/admin/codes', { bearer: t1, ip: '5.5.5.5' })).status, 401);
});

test('term dates: set by the admin, used by semester passes', async () => {
  const w = world(ON);
  const A = { admin: w.env.ADMIN_KEY };
  assert.strictEqual((await w.call('GET', '/admin/terms', A)).json.terms['2027'].t2, '2027-07-02');
  await w.call('PUT', '/admin/terms', { ...A, body: { terms: { 2027: { t2: '2027-07-09', t4: '2027-12-17' }, bad: {} } } });
  assert.strictEqual((await w.call('GET', '/admin/terms', A)).json.terms['2027'].t2, '2027-07-09');
  await w.call('POST', '/admin/codes', { ...A, body: { code: 'SEMESTER', type: 'semester', uses: 5 } });
  const t = (await signup(w)).token;
  const r = await w.call('POST', '/codes/redeem', { bearer: t, body: { code: 'SEMESTER' } });
  assert.strictEqual(r.json.access.plan, 'semester');
  assert.ok(r.json.access.until > Date.now());
});

test('ENFORCE_ACCESS: when it\'s "on", an ended trial can read its class but not save or use AI', async () => {
  const w = world({ ...ON, ENFORCE_ACCESS: 'on' });
  const t = (await signup(w)).token;
  await w.call('PUT', '/class', { bearer: t, body: cls(2) });
  const id = [...w.env.SESSIONS.m.keys()].find(k => k.startsWith('user:'));
  const u = JSON.parse(w.env.SESSIONS.m.get(id).v); u.until = Date.now() - 1; w.env.SESSIONS.m.get(id).v = JSON.stringify(u);
  assert.strictEqual((await w.call('GET', '/class', { bearer: t })).json.session.students.length, 2);
  assert.strictEqual((await w.call('PUT', '/class', { bearer: t, body: cls(3) })).status, 402);
  const ai = await w.call('POST', '/api/anthropic', { bearer: t, body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'hi' }] } });
  assert.strictEqual(ai.status, 402);
  // the same account with enforcement off saves as normal
  w.env.ENFORCE_ACCESS = '';
  assert.strictEqual((await w.call('PUT', '/class', { bearer: t, body: cls(3) })).status, 200);
});

test('AI works for an email account and counts against that account', async () => {
  const w = world(ON);
  const t = (await signup(w)).token;
  const r = await w.call('POST', '/api/anthropic', { bearer: t, body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'Rewrite this' }] } });
  assert.strictEqual(r.status, 200);
  const id = JSON.parse(w.env.SESSIONS.m.get([...w.env.SESSIONS.m.keys()].find(k => k.startsWith('user:'))).v).id;
  assert.ok([...w.env.SESSIONS.m.keys()].some(k => k.startsWith('ai:' + id + ':')));
  assert.strictEqual((await w.call('POST', '/api/anthropic', { bearer: 'f'.repeat(64), body: { model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'x' }] } })).status, 401);
});

test('admin: list email accounts with their classes, send a reset link, delete', async () => {
  const w = world(ON);
  const A = { admin: w.env.ADMIN_KEY };
  const t = (await signup(w)).token;
  await w.call('PUT', '/class?year=2026', { bearer: t, body: cls(24) });
  const u = (await w.call('GET', '/admin/users', A)).json.users[0];
  assert.strictEqual(u.email, 'ava@school.edu.au');
  assert.deepStrictEqual(u.classes.map(c => [c.year, c.students]), [[2026, 24]]);
  assert.ok(!JSON.stringify(u).includes('hash'), 'no password data in the admin list');
  const n = w.emails.length;
  assert.strictEqual((await w.call('POST', '/admin/users/' + u.id + '/reset', A)).status, 200);
  assert.strictEqual(w.emails.length, n + 1);
  assert.match(w.emails[n].subject, /Reset your Report Ready password/);
  assert.strictEqual((await w.call('DELETE', '/admin/users/' + u.id, A)).status, 200);
  assert.strictEqual((await w.call('GET', '/me', { bearer: t })).status, 401);
  assert.ok(![...w.env.SESSIONS.m.keys()].some(k => k.startsWith('class:')));
});

test('after LEGACY_UNTIL, username + PIN sign-in has ended (only once accounts are on)', async () => {
  const w = world({ ...ON, LEGACY_UNTIL: '2020-01-01' });
  const r = await w.call('GET', '/session', { token: 'ava:1234' });
  assert.strictEqual(r.status, 410);
  assert.strictEqual(r.json.ended, true);
  const off = world({ LEGACY_UNTIL: '2020-01-01' });
  assert.strictEqual((await off.call('GET', '/session', { token: 'ava:1234' })).status, 200);
});
