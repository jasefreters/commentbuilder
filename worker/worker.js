// Report Comment Builder — Cloudflare Worker
// Handles: Anthropic API proxy + KV session storage (username:pin tokens)
// Version 2026-11-15: AI only for signed-in accounts with a monthly allowance; sign-in attempt limits.

const ALLOWED_ORIGIN = 'https://jasefreters.github.io';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Token, X-Admin-Key, x-api-key, anthropic-version',
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
const SIGNIN_PER_ADDRESS = 10;       // wrong username/PIN tries per username from one address, per 15 minutes
const SIGNIN_PER_USERNAME = 60;      // wrong tries per username from anywhere, per hour
const NEW_ACCOUNTS_PER_ADDRESS = 3;  // new accounts one address may create per day

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
    if (request.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ error: 'unauthorised' }, 401);
    if (url.pathname === '/admin/feedback' && request.method === 'GET') {
      const list = await KV.list({ prefix: 'feedback:' });
      const items = (await Promise.all(list.keys.map(k => KV.get(k.name, 'json')))).filter(Boolean)
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
    // GET /admin/accounts  (requires X-Admin-Key header)
    if (path === '/admin/accounts') {
      const adminKey = request.headers.get('X-Admin-Key');
      if (!adminKey || adminKey !== env.ADMIN_KEY) {
        return cors(JSON.stringify({ error: 'Unauthorised' }), 401);
      }
      if (request.method !== 'GET') {
        return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
      }

      // List all keys with prefix "session:"
      const list = await env.SESSIONS.list({ prefix: 'session:' });
      const accounts = await Promise.all(
        list.keys.map(async (k) => {
          // Key format: session:username:pin — show username only, not PIN
          const parts = k.name.replace('session:', '').split(':');
          const username = parts[0];
          // Get metadata for last saved time
          const meta = k.metadata || {};
          // Get value to count students
          let studentCount = 0;
          try {
            const val = await env.SESSIONS.get(k.name);
            if (val) {
              const parsed = JSON.parse(val);
              studentCount = (parsed.students || []).length;
            }
          } catch {}
          return {
            username,
            lastSaved: meta.savedAt || 'unknown',
            students: studentCount,
            key: k.name,
          };
        })
      );

      // Sort by lastSaved descending
      accounts.sort((a, b) => new Date(b.lastSaved) - new Date(a.lastSaved));

      return cors(JSON.stringify({
        total: accounts.length,
        accounts,
      }), 200);
    }

    // ── ADMIN: delete an account ───────────────────────────────
    // DELETE /admin/accounts/:key  (requires X-Admin-Key header)
    if (path.startsWith('/admin/accounts/')) {
      const adminKey = request.headers.get('X-Admin-Key');
      if (!adminKey || adminKey !== env.ADMIN_KEY) {
        return cors(JSON.stringify({ error: 'Unauthorised' }), 401);
      }
      if (request.method !== 'DELETE') {
        return cors(JSON.stringify({ error: 'Method not allowed' }), 405);
      }
      const kvKey = decodeURIComponent(path.replace('/admin/accounts/', ''));
      await env.SESSIONS.delete(kvKey);
      return cors(JSON.stringify({ ok: true, deleted: kvKey }), 200);
    }

    // ── SESSION ROUTES ─────────────────────────────────────────
    if (path === '/session') {
      const token = (request.headers.get('X-User-Token') || '').trim().toLowerCase();

      if (!validateToken(token)) {
        return cors(JSON.stringify({ error: 'Invalid or missing credentials. Provide X-User-Token as username:pin.' }), 401);
      }

      const key = 'session:' + token;

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const username = token.split(':')[0];
      const rlAddr = 'rl:signin:' + username + ':' + await sha(ip);
      const rlUser = 'rl:signin:' + username;

      if (request.method === 'GET') {
        // Too many wrong tries for this username: stop before looking anything up.
        const [a, u] = await Promise.all([env.SESSIONS.get(rlAddr), env.SESSIONS.get(rlUser)]);
        if (parseInt(a || '0', 10) >= SIGNIN_PER_ADDRESS || parseInt(u || '0', 10) >= SIGNIN_PER_USERNAME) {
          return cors(JSON.stringify({ error: 'Too many attempts. Wait 15 minutes and try again.' }), 429);
        }
        const val = await env.SESSIONS.get(key);
        if (!val) {
          await Promise.all([bump(env.SESSIONS, rlAddr, 900), bump(env.SESSIONS, rlUser, 3600)]);
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
          metadata: { savedAt: new Date().toISOString() }
        });
        return cors(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }), 200);
      }

      if (request.method === 'DELETE') {
        await env.SESSIONS.delete(key);
        await env.SESSIONS.delete('acct:' + await sha(token));
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

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req),
      });
      const data = await upstream.text();

      // Add what this request cost to the account's total.
      try {
        const u = JSON.parse(data).usage;
        if (u) {
          const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          const cost = Math.ceil(inTok * price[0] + (u.output_tokens || 0) * price[1]);
          await env.SESSIONS.put(useKey, String(used + cost), { expirationTtl: 62 * 86400 });
        }
      } catch {}

      return new Response(data, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return cors(JSON.stringify({ error: 'Not found' }), 404);
  }
};
