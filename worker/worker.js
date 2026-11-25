// Report Comment Builder — Cloudflare Worker
// Handles: Anthropic API proxy + KV session storage (username:pin tokens)
// Version 2026-11-15: AI only for signed-in accounts with a monthly allowance; sign-in attempt limits.
// Version 2026-11-24 (app v3.18.0): school years. A request may send X-Class-Year (2027 and later). 2026, or no year,
// uses the original key 'session:user:pin', so every class saved before this change stays where it is.
// Later years are stored as 'session:user:pin:YEAR'.
// Version 2026-11-25 (app v3.19.2): sign-in hardening, no change to how classes are stored.
// - Wrong sign-ins are also limited per address across every username (SIGNIN_PER_ADDRESS_ALL).
// - Wrong admin keys are limited per address (ADMIN_TRIES_PER_ADDRESS), on every admin route.
// - The admin account list no longer contains PINs: each account has an id (a fingerprint of its storage key).
//   Delete by that id. The list pages past 1,000 accounts, and student counts come from save metadata.
// Version 2026-11-25b (app v3.19.3):
// - The admin list also sends, for each class, its account fingerprint, username, year and the account's AI
//   spending this month, so the app can show one row per teacher.
// - The AI route only takes requests shaped like the app's own (D8): one user message of plain text, the app's
//   own system line or none, an allowed model, and no tools, images, files or extra settings.
// - AI spending is reserved before the request and settled after, so requests sent together can't overspend.

const ALLOWED_ORIGIN = 'https://jasefreters.github.io';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Token, X-Class-Year, X-Admin-Key, x-api-key, anthropic-version',
};

function cors(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function validateToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [user, pin] = parts;
  if (!user || user.length < 2) return false;
  if (!pin || pin.length < 4) return false;
  if (!/^[a-z0-9_\-]+$/.test(user)) return false;
  return true;
}

// ── School years (added 24 Nov 2026) ───────────────────────────────
const FIRST_CLASS_YEAR = 2026;
// The class year a request asks for: null for 2026 or none (the original key), the year for 2027 and later,
// or false when the header is not a sensible year.
function classYearOf(request) {
  const y = (request.headers.get('X-Class-Year') || '').trim();
  if (!y) return null;
  if (!/^20\d\d$/.test(y)) return false;
  const n = parseInt(y, 10);
  if (n === FIRST_CLASS_YEAR) return null;
  if (n < FIRST_CLASS_YEAR || n > new Date().getUTCFullYear() + 2) return false;
  return n;
}

// ── AI allowance and sign-in limits (added Nov 2026) ───────────────
// Each signed-in account may use about this much AI per calendar month (US dollars of tokens).
const AI_MONTHLY_USD = 2;
// Price per million tokens [input, output]. Only these models are allowed through.
const AI_MODELS = {
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
};
const AI_MAX_TOKENS = 1200;          // most output one request may ask for
const AI_MAX_BODY = 60 * 1024;       // largest request the AI route accepts
// The only system line the app sends (AI_JSON_SYSTEM in the app). A request may send this or no system line.
const AI_APP_SYSTEM = 'You reply with valid JSON only. The first character of your reply must be the opening bracket. Write no words before or after the JSON.';
const AI_ALLOWED_KEYS = ['model', 'max_tokens', 'system', 'messages', 'temperature'];
// What's wrong with an AI request, or '' when it is shaped like one of the app's own
function aiShapeProblem(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return 'Invalid request.';
  const extra = Object.keys(req).filter(k => !AI_ALLOWED_KEYS.includes(k));
  if (extra.length) return 'That request has settings the app does not use: ' + extra.join(', ') + '.';
  if (req.system !== undefined && req.system !== AI_APP_SYSTEM) return 'That system instruction is not one the app uses.';
  if (!Array.isArray(req.messages) || req.messages.length !== 1) return 'The app sends one message at a time.';
  const m = req.messages[0];
  if (!m || m.role !== 'user' || typeof m.content !== 'string' || Object.keys(m).length !== 2) return 'The app sends plain text only.';
  if (!m.content.trim()) return 'Empty request.';
  if (req.temperature !== undefined && !(typeof req.temperature === 'number' && req.temperature >= 0 && req.temperature <= 1)) return 'Invalid temperature.';
  return '';
}
const SIGNIN_PER_ADDRESS = 10;       // wrong username/PIN tries per username from one address, per 15 minutes
const SIGNIN_PER_USERNAME = 60;      // wrong tries per username from anywhere, per hour
const NEW_ACCOUNTS_PER_ADDRESS = 3;  // new accounts one address may create per day
const SIGNIN_PER_ADDRESS_ALL = 30;   // wrong tries from one address across every username, per hour
const ADMIN_TRIES_PER_ADDRESS = 5;   // wrong admin keys from one address, per hour

function aiError(type, message, status) {
  return cors(JSON.stringify({ type: 'error', error: { type, message } }), status);
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function bump(KV, key, ttl) {
  const n = parseInt((await KV.get(key)) || '0', 10) + 1;
  await KV.put(key, String(n), { expirationTtl: ttl });
  return n;
}

// True when this username and PIN belong to an account that has saved a class.
// A small marker (named by a fingerprint, never the PIN) saves reading the whole class each time.
async function accountExists(env, token) {
  const mark = 'acct:' + await sha(token);
  if (await env.SESSIONS.get(mark)) return true;
  const val = await env.SESSIONS.get('session:' + token);
  if (!val) return false;
  await env.SESSIONS.put(mark, '1');
  return true;
}

// ── Admin key check (added 25 Nov 2026) ───────────────────────────
// A wrong key counts against the address; after ADMIN_TRIES_PER_ADDRESS in an hour, even the right key is refused
// until the hour is up. Returns null when the key is right, or the Response to send.
function sameText(a, b) {   // compares in the same time whatever matches, so the key can't be guessed letter by letter
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function adminCheck(request, KV, env, reply) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = 'rl:admin:' + await sha(ip);
  if (parseInt((await KV.get(rl)) || '0', 10) >= ADMIN_TRIES_PER_ADDRESS) {
    return reply({ error: 'Too many wrong admin keys. Wait an hour and try again.' }, 429);
  }
  const key = request.headers.get('X-Admin-Key');
  if (!env.ADMIN_KEY || !key || !sameText(key, env.ADMIN_KEY)) {
    await bump(KV, rl, 3600);
    return reply({ error: 'Unauthorised' }, 401);
  }
  return null;
}
// Every key with a prefix, past KV's 1,000-a-page limit
async function listAll(KV, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await KV.list({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}
function studentsIn(text) {
  try { return (JSON.parse(text).students || []).length; } catch { return 0; }
}

// Replace a reservation with the real cost, reading the latest total so other requests' reservations stay counted
async function settle(KV, key, reserve, cost) {
  const now = parseInt((await KV.get(key)) || '0', 10);
  await KV.put(key, String(Math.max(0, now - reserve + cost)), { expirationTtl: 62 * 86400 });
}

function monthKey() { return new Date().toISOString().slice(0, 7); }
function nextMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export default {
  async fetch(request, env) {
      // ── Suggestions (app v3.15.0) ──────────────
{
  const url = new URL(request.url);
  if (url.pathname === '/feedback' || url.pathname.startsWith('/admin/feedback')) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-User-Token',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    // the Worker's storage (KV): found automatically, whatever its name is
    const KV = Object.values(env).find(v => v && typeof v.list === 'function' && typeof v.put === 'function' && typeof v.get === 'function');
    if (!KV) return json({ error: 'no storage' }, 500);

    // Anyone using the app can send one (at most 10 an hour from one address)
    if (url.pathname === '/feedback' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
      const message = String(b.message || '').trim().slice(0, 4000);
      if (message.length < 3) return json({ error: 'empty' }, 400);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rl = 'fbrl:' + ip, n = parseInt((await KV.get(rl)) || '0', 10);
      if (n >= 10) return json({ error: 'too many' }, 429);
      await KV.put(rl, String(n + 1), { expirationTtl: 3600 });
      const at = new Date().toISOString();
      const id = at + '-' + Math.random().toString(36).slice(2, 8);
      const item = {
        id, at, message,
        type: String(b.type || '').slice(0, 40),
        contact: String(b.contact || '').slice(0, 200),
        user: String(b.user || '').slice(0, 60),
        version: String(b.version || '').slice(0, 20),
        ua: String(b.ua || '').slice(0, 200),
      };
      await KV.put('feedback:' + id, JSON.stringify(item));
      return json({ ok: true });
    }

    // Reading and deleting needs the admin key
    const denied = await adminCheck(request, KV, env, json);
    if (denied) return denied;
    if (url.pathname === '/admin/feedback' && request.method === 'GET') {
      const keys = await listAll(KV, 'feedback:');
      const items = (await Promise.all(keys.map(k => KV.get(k.name, 'json')))).filter(Boolean)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return json({ items });
    }
    if (url.pathname.startsWith('/admin/feedback/') && request.method === 'DELETE') {
      await KV.delete('feedback:' + decodeURIComponent(url.pathname.slice('/admin/feedback/'.length)));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
}
    // ── end Suggestions ─────────────────────────

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    // ── ADMIN: list all accounts ───────────────────────────────
    // GET /admin/accounts  (requires X-Admin-Key header). PINs are never sent: each account has an id instead.
    if (path === '/admin/accounts') {
      const denied = await adminCheck(request, env.SESSIONS, env, (o, st) => cors(JSON.stringify(o), st));
      if (denied) return denied;
      if (request.method !== 'GET') {
        return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
      }
      const keys = await listAll(env.SESSIONS, 'session:');
      const accounts = await Promise.all(keys.map(async (k) => {
        // Key format: session:username:pin[:year]. Show the username (and a later year), never the PIN.
        const parts = k.name.slice('session:'.length).split(':');
        const meta = k.metadata || {};
        // Saves since 25 Nov 2026 carry the student count; older ones are read once to count.
        const students = typeof meta.students === 'number' ? meta.students : studentsIn(await env.SESSIONS.get(k.name));
        // The account fingerprint (username + PIN, hashed) groups a teacher's years without showing the PIN.
        // Two teachers who picked the same username have different fingerprints, so they stay apart.
        const acct = await sha(parts[0] + ':' + parts[1]);
        return {
          id: await sha(k.name),
          acct,
          user: parts[0],
          year: parts[2] ? parseInt(parts[2], 10) : FIRST_CLASS_YEAR,
          username: parts[0] + (parts[2] ? ' (' + parts[2] + ')' : ''),   // for app versions before v3.19.3
          lastSaved: meta.savedAt || 'unknown',
          students,
        };
      }));
      // AI spending this month, once per account (millionths of a dollar, shown in dollars)
      const spend = {};
      await Promise.all([...new Set(accounts.map(a => a.acct))].map(async (acct) => {
        spend[acct] = parseInt((await env.SESSIONS.get('ai:' + acct + ':' + monthKey())) || '0', 10) / 1e6;
      }));
      accounts.forEach(a => { a.aiUsd = Math.round(spend[a.acct] * 10000) / 10000; });
      accounts.sort((a, b) => new Date(b.lastSaved) - new Date(a.lastSaved));
      return cors(JSON.stringify({ total: accounts.length, teachers: new Set(accounts.map(a => a.acct)).size, aiLimitUsd: AI_MONTHLY_USD, accounts }), 200);
    }

    // ── ADMIN: delete an account ───────────────────────────────
    // DELETE /admin/accounts/:id  (requires X-Admin-Key header). The id comes from the list above.
    if (path.startsWith('/admin/accounts/')) {
      const denied = await adminCheck(request, env.SESSIONS, env, (o, st) => cors(JSON.stringify(o), st));
      if (denied) return denied;
      if (request.method !== 'DELETE') {
        return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
      }
      const id = decodeURIComponent(path.slice('/admin/accounts/'.length));
      let kvKey = null;
      if (/^[0-9a-f]{32}$/.test(id)) {
        for (const k of await listAll(env.SESSIONS, 'session:')) {
          if (await sha(k.name) === id) { kvKey = k.name; break; }
        }
      }
      if (!kvKey) return cors(JSON.stringify({ error: 'Not found' }), 404);
      await env.SESSIONS.delete(kvKey);
      // The whole account goes when its first (2026) class goes, as when a teacher deletes it themselves
      const parts = kvKey.slice('session:'.length).split(':');
      if (parts.length === 2) await env.SESSIONS.delete('acct:' + await sha(parts.join(':')));
      return cors(JSON.stringify({ ok: true }), 200);
    }

    // ── SESSION ROUTES ─────────────────────────────────────────
    if (path === '/session') {
      const token = (request.headers.get('X-User-Token') || '').trim().toLowerCase();

      if (!validateToken(token)) {
        return cors(JSON.stringify({ error: 'Invalid or missing credentials. Provide X-User-Token as username:pin.' }), 401);
      }

      // 2026 (or no year) keeps the original key; 2027 and later have their own.
      const year = classYearOf(request);
      if (year === false) {
        return cors(JSON.stringify({ error: 'Invalid class year.' }), 400);
      }
      const key = 'session:' + token + (year ? ':' + year : '');

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const username = token.split(':')[0];
      const rlAddr = 'rl:signin:' + username + ':' + await sha(ip);
      const rlUser = 'rl:signin:' + username;
      const rlAll = 'rl:signin-all:' + await sha(ip);   // every username from this address

      if (request.method === 'GET') {
        // Too many wrong tries for this username: stop before looking anything up.
        const [a, u, all] = await Promise.all([env.SESSIONS.get(rlAddr), env.SESSIONS.get(rlUser), env.SESSIONS.get(rlAll)]);
        if (parseInt(a || '0', 10) >= SIGNIN_PER_ADDRESS || parseInt(u || '0', 10) >= SIGNIN_PER_USERNAME ||
            parseInt(all || '0', 10) >= SIGNIN_PER_ADDRESS_ALL) {
          return cors(JSON.stringify({ error: 'Too many attempts. Wait 15 minutes and try again.' }), 429);
        }
        const val = await env.SESSIONS.get(key);
        if (!val) {
          // An empty new year for a real account is not a wrong sign-in, so it does not count towards the limit.
          if (!(year && await accountExists(env, token))) {
            await Promise.all([bump(env.SESSIONS, rlAddr, 900), bump(env.SESSIONS, rlUser, 3600), bump(env.SESSIONS, rlAll, 3600)]);
          }
          return cors(JSON.stringify({ found: false }), 200);
        }
        return cors(JSON.stringify({ found: true, session: JSON.parse(val) }), 200);
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        if (body.length > 10 * 1024 * 1024) {
          return cors(JSON.stringify({ error: 'Session too large' }), 413);
        }
        try { JSON.parse(body); } catch {
          return cors(JSON.stringify({ error: 'Invalid JSON' }), 400);
        }
        // A first save creates the account. One address may only create a few a day.
        if (!(await accountExists(env, token))) {
          const rlNew = 'rl:new:' + await sha(ip) + ':' + new Date().toISOString().slice(0, 10);
          if (parseInt((await env.SESSIONS.get(rlNew)) || '0', 10) >= NEW_ACCOUNTS_PER_ADDRESS) {
            return cors(JSON.stringify({ error: 'Too many new accounts from this connection today.' }), 429);
          }
          await bump(env.SESSIONS, rlNew, 86400);
          await env.SESSIONS.put('acct:' + await sha(token), '1');
        }
        await env.SESSIONS.put(key, body, {
          metadata: { savedAt: new Date().toISOString(), students: studentsIn(body) }   // the count saves the admin list a read
        });
        return cors(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }), 200);
      }

      if (request.method === 'DELETE') {
        await env.SESSIONS.delete(key);
        // Deleting a later year's class leaves the account itself in place.
        if (!year) await env.SESSIONS.delete('acct:' + await sha(token));
        return cors(JSON.stringify({ ok: true }), 200);
      }

      return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
    }

    // ── ANTHROPIC API PROXY ────────────────────────────────────
    // Only for signed-in accounts, and only up to AI_MONTHLY_USD of tokens each per month.
    if (path === '/api/anthropic') {
      if (request.method !== 'POST') {
        return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
      }
      const token = (request.headers.get('X-User-Token') || '').trim().toLowerCase();
      if (!validateToken(token) || !(await accountExists(env, token))) {
        return aiError('sign_in_required', 'Sign in to cloud sync to use the AI features.', 401);
      }
      const body = await request.text();
      if (body.length > AI_MAX_BODY) return aiError('too_large', 'That request is too large.', 413);
      let req;
      try { req = JSON.parse(body); } catch { return aiError('bad_request', 'Invalid JSON.', 400); }
      const price = AI_MODELS[req && req.model];
      if (!price) return aiError('bad_request', 'That AI model is not available.', 400);
      if (req.stream) return aiError('bad_request', 'Streaming is not available.', 400);
      const shape = aiShapeProblem(req);
      if (shape) return aiError('bad_request', shape, 400);
      req.max_tokens = Math.min(parseInt(req.max_tokens, 10) || AI_MAX_TOKENS, AI_MAX_TOKENS);

      // Spending so far this month, kept in millionths of a dollar.
      const useKey = 'ai:' + await sha(token) + ':' + monthKey();
      const used = parseInt((await env.SESSIONS.get(useKey)) || '0', 10);
      const limit = AI_MONTHLY_USD * 1e6;
      if (used >= limit) {
        return cors(JSON.stringify({ type: 'error', error: {
          type: 'usage_limit',
          message: 'This account has used its AI allowance for the month.',
          resets: nextMonthStart(),
        } }), 429);
      }

      // Reserve the most this request could cost before sending it, so requests sent together each see the others'
      // share. Input is estimated at one token per 3 characters (generous for English); output at max_tokens.
      const reserve = Math.ceil((body.length / 3) * price[0] + req.max_tokens * price[1]);
      await env.SESSIONS.put(useKey, String(used + reserve), { expirationTtl: 62 * 86400 });

      let upstream;
      try {
        upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(req),
        });
      } catch (e) {
        await settle(env.SESSIONS, useKey, reserve, 0);
        return aiError('upstream', 'The AI service could not be reached. Try again.', 502);
      }
      const data = await upstream.text();

      // Swap the reservation for what this request really cost (nothing, if it failed). Storage has no add-up-in-one-step,
      // so two requests finishing at the same moment can leave one counted at its reservation: a small over-count,
      // never an under-count.
      let cost = 0;
      try {
        const u = JSON.parse(data).usage;
        if (u) {
          const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          cost = Math.ceil(inTok * price[0] + (u.output_tokens || 0) * price[1]);
        }
      } catch {}
      await settle(env.SESSIONS, useKey, reserve, cost);

      return new Response(data, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return cors(JSON.stringify({ error: 'Not found' }), 404);
  }
};
