// The Cloudflare Worker (worker/worker.js), run in Node against a stand-in for Cloudflare's storage (KV).
// Covers: saving and loading a class, school years, sign-in limits, new-account limits, the AI allowance,
// suggestions, and the admin routes (key guess limit, no PINs in the list, paging past 1,000, delete by id).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// worker.js is an ES module; load it from its source so the repo needs no build step or extra packages.
let worker;
async function load() {
  if (worker) return worker;
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
  worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
  return worker;
}

// A stand-in for Workers KV: get / put (with expiry and metadata) / delete / list (1,000 a page, with a cursor)
class FakeKV {
  constructor() { this.m = new Map(); this.reads = 0; }
  async get(k, type) {
    this.reads++;
    const e = this.m.get(k);
    if (!e || (e.exp && e.exp < Date.now())) return null;
    return type === 'json' ? JSON.parse(e.v) : e.v;
  }
  async put(k, v, o = {}) { this.m.set(k, { v: String(v), meta: o.metadata, exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? parseInt(cursor, 10) : 0;
    const keys = all.slice(start, start + limit).map(name => ({ name, metadata: this.m.get(name).meta }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(start + limit) };
  }
}

let env, upstream;
beforeEach(() => {
  env = { SESSIONS: new FakeKV(), ADMIN_KEY: 'correct-horse-battery', ANTHROPIC_API_KEY: 'sk-test' };
  upstream = [];
  globalThis.fetch = async (url, init) => {   // the Anthropic API, as far as the Worker can tell
    upstream.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1000, output_tokens: 500 } }), { status: 200 });
  };
});

async function call(method, p, { token, year, admin, ip = '1.1.1.1', body } = {}) {
  const w = await load();
  const headers = { 'CF-Connecting-IP': ip };
  if (token) headers['X-User-Token'] = token;
  if (year) headers['X-Class-Year'] = String(year);
  if (admin) headers['X-Admin-Key'] = admin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await w.fetch(new Request('https://w.example' + p, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), env);
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}
const cls = n => ({ students: Array.from({ length: n }, (_, i) => ({ name: 'S' + i })) });

test('a class saves and loads; a new year has its own key; 2026 keeps the original key', async () => {
  assert.strictEqual((await call('PUT', '/session', { token: 'ava:1234', body: cls(3) })).status, 200);
  const got = await call('GET', '/session', { token: 'ava:1234' });
  assert.strictEqual(got.json.found, true);
  assert.strictEqual(got.json.session.students.length, 3);
  assert.ok(env.SESSIONS.m.has('session:ava:1234'));
  assert.strictEqual((await call('GET', '/session', { token: 'ava:1234', year: 2027 })).json.found, false);
  await call('PUT', '/session', { token: 'ava:1234', year: 2027, body: cls(1) });
  assert.ok(env.SESSIONS.m.has('session:ava:1234:2027'));
  assert.strictEqual((await call('GET', '/session', { token: 'ava:1234', year: 2026 })).json.session.students.length, 3);
  assert.strictEqual((await call('GET', '/session', { token: 'ava:1234', year: 1999 })).status, 400);
  assert.strictEqual((await call('GET', '/session', { token: 'nopin' })).status, 401);
});

test('a save records its student count, so the admin list needn\'t read the class', async () => {
  await call('PUT', '/session', { token: 'ava:1234', body: cls(24) });
  assert.strictEqual(env.SESSIONS.m.get('session:ava:1234').meta.students, 24);
});

test('wrong sign-ins: 10 per username from one address, then refused', async () => {
  for (let i = 0; i < 10; i++) assert.strictEqual((await call('GET', '/session', { token: 'ava:' + (1000 + i) })).json.found, false);
  assert.strictEqual((await call('GET', '/session', { token: 'ava:9999' })).status, 429);
  // another address can still try that username
  assert.strictEqual((await call('GET', '/session', { token: 'ava:9999', ip: '2.2.2.2' })).status, 200);
});

test('wrong sign-ins: 30 per address across every username, then refused (D2)', async () => {
  for (let i = 0; i < 30; i++) assert.strictEqual((await call('GET', '/session', { token: 'user' + i + ':1234' })).status, 200);
  assert.strictEqual((await call('GET', '/session', { token: 'someoneelse:1234' })).status, 429);
  assert.strictEqual((await call('GET', '/session', { token: 'someoneelse:1234', ip: '2.2.2.2' })).status, 200);
});

test('an empty new year for a real account is not a wrong sign-in', async () => {
  await call('PUT', '/session', { token: 'ava:1234', body: cls(1) });
  for (let i = 0; i < 15; i++) await call('GET', '/session', { token: 'ava:1234', year: 2027 });
  assert.strictEqual((await call('GET', '/session', { token: 'ava:1234' })).status, 200);
});

test('new accounts: 3 per address a day', async () => {
  for (let i = 0; i < 3; i++) assert.strictEqual((await call('PUT', '/session', { token: 'new' + i + ':1234', body: cls(1) })).status, 200);
  assert.strictEqual((await call('PUT', '/session', { token: 'new9:1234', body: cls(1) })).status, 429);
  // saving an existing account again is fine
  assert.strictEqual((await call('PUT', '/session', { token: 'new0:1234', body: cls(2) })).status, 200);
});

test('AI: only for accounts, only allowed models, capped tokens, and a monthly allowance', async () => {
  const ask = (token, extra = {}) => call('POST', '/api/anthropic', { token, body: { model: 'claude-haiku-4-5', max_tokens: 99999, messages: [{ role: 'user', content: 'hi' }], ...extra } });
  assert.strictEqual((await ask('ghost:1234')).status, 401);
  await call('PUT', '/session', { token: 'ava:1234', body: cls(1) });
  assert.strictEqual((await ask('ava:1234', { model: 'claude-opus-x' })).status, 400);
  assert.strictEqual((await ask('ava:1234', { stream: true })).status, 400);
  assert.strictEqual((await ask('ava:1234')).status, 200);
  assert.strictEqual(upstream[0].body.max_tokens, 1200);
  // haiku: 1,000 in x $1 + 500 out x $5 per million = $0.0035 a request, so $2 lasts 572 requests
  const useKey = [...env.SESSIONS.m.keys()].find(k => k.startsWith('ai:'));
  env.SESSIONS.m.get(useKey).v = String(2e6);
  const r = await ask('ava:1234');
  assert.strictEqual(r.status, 429);
  assert.strictEqual(r.json.error.type, 'usage_limit');
});

test('suggestions: anyone can send; reading needs the admin key', async () => {
  assert.strictEqual((await call('POST', '/feedback', { body: { message: 'Love it', type: 'School enquiry' } })).status, 200);
  assert.strictEqual((await call('GET', '/admin/feedback', { admin: 'wrong' })).status, 401);
  const r = await call('GET', '/admin/feedback', { admin: env.ADMIN_KEY });
  assert.strictEqual(r.json.items.length, 1);
  assert.strictEqual(r.json.items[0].type, 'School enquiry');
});

test('admin key: 5 wrong tries an hour from one address, then even the right key waits (D3)', async () => {
  for (let i = 0; i < 5; i++) assert.strictEqual((await call('GET', '/admin/accounts', { admin: 'guess' + i })).status, 401);
  assert.strictEqual((await call('GET', '/admin/accounts', { admin: env.ADMIN_KEY })).status, 429);
  assert.strictEqual((await call('GET', '/admin/feedback', { admin: env.ADMIN_KEY })).status, 429);
  assert.strictEqual((await call('GET', '/admin/accounts', { admin: env.ADMIN_KEY, ip: '9.9.9.9' })).status, 200);
  assert.strictEqual((await call('GET', '/admin/accounts', { ip: '8.8.8.8' })).status, 401);
});

test('admin list has no PINs, and pages past 1,000 accounts (D3, D10)', async () => {
  await call('PUT', '/session', { token: 'ava:4821', body: cls(24) });
  await call('PUT', '/session', { token: 'ava:4821', year: 2027, body: cls(2) });
  for (let i = 0; i < 1100; i++) await env.SESSIONS.put('session:bulk' + i + ':0000', JSON.stringify(cls(1)), { metadata: { savedAt: '2026-01-01T00:00:00Z' } });
  const r = await call('GET', '/admin/accounts', { admin: env.ADMIN_KEY });
  assert.strictEqual(r.json.total, 1102);
  const text = JSON.stringify(r.json);
  assert.ok(!text.includes('4821'), 'a PIN is in the admin list');
  assert.ok(!text.includes('session:'), 'a storage key is in the admin list');
  const ava = r.json.accounts.find(a => a.username === 'ava');
  assert.strictEqual(ava.students, 24);
  assert.match(ava.id, /^[0-9a-f]{32}$/);
  assert.ok(r.json.accounts.find(a => a.username === 'ava (2027)'));
});

test('admin delete by id removes that class (and the account with its first class); a raw key is refused', async () => {
  await call('PUT', '/session', { token: 'ava:4821', body: cls(3) });
  await call('PUT', '/session', { token: 'ben:1111', body: cls(3) });
  assert.strictEqual((await call('DELETE', '/admin/accounts/' + encodeURIComponent('session:ben:1111'), { admin: env.ADMIN_KEY })).status, 404);
  const list = (await call('GET', '/admin/accounts', { admin: env.ADMIN_KEY })).json.accounts;
  const ava = list.find(a => a.username === 'ava');
  assert.strictEqual((await call('DELETE', '/admin/accounts/' + ava.id, { admin: env.ADMIN_KEY })).status, 200);
  assert.ok(!env.SESSIONS.m.has('session:ava:4821'));
  assert.ok(env.SESSIONS.m.has('session:ben:1111'));
  // ava's account marker is gone, so the AI route no longer treats her as signed in
  const ai = await call('POST', '/api/anthropic', { token: 'ava:4821', body: { model: 'claude-haiku-4-5', messages: [] } });
  assert.strictEqual(ai.status, 401);
  assert.strictEqual((await call('DELETE', '/admin/accounts/' + ava.id, { admin: 'nope', ip: '7.7.7.7' })).status, 401);
});
