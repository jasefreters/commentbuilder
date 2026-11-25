// Runs worker/worker.js in Node against a stand-in for Cloudflare's storage (KV), with outside calls (the AI
// service, the email service) caught. Used by the Worker tests.
const fs = require('fs');
const path = require('path');

let worker;
async function loadWorker() {
  if (worker) return worker;
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
  worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
  return worker;
}

// get / getWithMetadata / put (with expiry and metadata) / delete / list (1,000 a page, with a cursor)
class FakeKV {
  constructor() { this.m = new Map(); }
  _live(k) { const e = this.m.get(k); if (!e || (e.exp && e.exp < Date.now())) return null; return e; }
  async get(k, type) { const e = this._live(k); if (!e) return null; return type === 'json' ? JSON.parse(e.v) : e.v; }
  async getWithMetadata(k) { const e = this._live(k); return e ? { value: e.v, metadata: e.meta || null } : { value: null, metadata: null }; }
  async put(k, v, o = {}) { this.m.set(k, { v: String(v), meta: o.metadata, exp: o.expirationTtl ? Date.now() + o.expirationTtl * 1000 : 0 }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter(k => k.startsWith(prefix) && this._live(k)).sort();
    const start = cursor ? parseInt(cursor, 10) : 0;
    const keys = all.slice(start, start + limit).map(name => ({ name, metadata: this.m.get(name).meta }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(start + limit) };
  }
}

// A fresh Worker world: storage, settings, and a record of emails sent and AI requests made
function world(settings = {}) {
  const w = { env: { SESSIONS: new FakeKV(), ADMIN_KEY: 'correct-horse-battery', ANTHROPIC_API_KEY: 'sk-test', ...settings }, emails: [], ai: [] };
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      w.emails.push(JSON.parse(init.body));
      return new Response('{"id":"e1"}', { status: 200 });
    }
    w.ai.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 100, output_tokens: 50 } }), { status: 200 });
  };
  w.call = async (method, p, { token, bearer, year, admin, ip = '1.1.1.1', body, headers: extra = {} } = {}) => {
    const wk = await loadWorker();
    const headers = { 'CF-Connecting-IP': ip, ...extra };
    if (token) headers['X-User-Token'] = token;
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (year) headers['X-Class-Year'] = String(year);
    if (admin) headers['X-Admin-Key'] = admin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await wk.fetch(new Request('https://w.example' + p, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), w.env);
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  };
  // the 6-digit code in the last email sent to this address
  w.codeFor = email => { const e = [...w.emails].reverse().find(x => x.to[0] === email); return e && (e.text.match(/\b(\d{6})\b/) || [])[1]; };
  w.resetFor = email => { const e = [...w.emails].reverse().find(x => x.to[0] === email); return e && (e.text.match(/[?&]reset=([0-9a-f]{64})/) || [])[1]; };
  return w;
}
const cls = n => ({ students: Array.from({ length: n }, (_, i) => ({ name: 'S' + i })) });

module.exports = { loadWorker, FakeKV, world, cls };
