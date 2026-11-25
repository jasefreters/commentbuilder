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
// Version 2026-11-25c (app v3.20.0): email + password accounts (see ACCOUNTS v2 below), off until ACCOUNTS = "on".
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Base-Version, X-User-Token, X-Class-Year, X-Admin-Key, x-api-key, anthropic-version',
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

// ══ ACCOUNTS v2 (added 25 Nov 2026, app v3.20.0): email + password, sessions, classes by account, access ══
// Plan: claude/account-redesign-plan.md (Reports project). Everything here is OFF until the Worker has the
// setting ACCOUNTS = "on". Until then /auth/config says so, every other route below answers 404, and the
// username + PIN routes above work exactly as before.
//
// Settings (Cloudflare → Worker → Settings → Variables):
//   ACCOUNTS        "on" to switch these routes on
//   ENFORCE_ACCESS  "on" from launch day: saving, the bank and AI need an active trial or pass
//   RESEND_API_KEY  (secret) sends sign-up codes and reset links; without it sign-up says email isn't set up
//   EMAIL_FROM      e.g. "Complete Comments <hello@completecomments.com.au>"
//   APP_URL         the app's address, for reset links
//   LEGACY_UNTIL    last day of username + PIN sign-in, default 2027-03-31

// Password scrambling rounds. Kept low so sign-in fits the free plan's 10 ms of computer time a request.
// Raise this (to 100,000, the most Workers allows) once on Workers Paid: each password records its own rounds,
// and is re-scrambled with the new number the next time that teacher signs in.
const PW_ROUNDS = 2000;
const PW_MIN = 8, PW_MAX = 200;
const SESSION_DAYS = 60;
const TRIAL_DAYS = 7;
const DAY_MS = 86400000;
const TERMS_DEFAULT = { 2026: { t2: '2026-07-03', t4: '2026-12-17' }, 2027: { t2: '2027-07-02', t4: '2027-12-17' } };
// A short list of the passwords people pick most; the rest of the rule is just the length.
const COMMON_PW = new Set(('password password1 password12 password123 passw0rd 12345678 123456789 1234567890 11111111 ' +
  '00000000 87654321 qwertyui qwertyuiop qwerty123 iloveyou abc12345 abcd1234 letmein1 welcome1 welcome123 ' +
  'football baseball sunshine princess superman starwars trustno1 whatever 1q2w3e4r 1qaz2wsx zaq12wsx ' +
  'aaaaaaaa asdfghjk asdf1234 monkey123 dragon12 master12 teacher1 teacher123 school123 student1 ' +
  'reportready completecomments complete123 report123 changeme').split(' '));

const enc = new TextEncoder();
function b64(bytes) { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function randomHex(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function normEmail(e) { return String(e || '').trim().toLowerCase(); }
function okEmail(e) { return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < PW_MIN) return 'Your password needs at least ' + PW_MIN + ' characters.';
  if (pw.length > PW_MAX) return 'That password is too long.';
  if (COMMON_PW.has(pw.toLowerCase())) return 'That password is too easy to guess. Choose another.';
  return '';
}
async function pwHash(pw, saltB64, rounds) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: rounds }, key, 256);
  return b64(bits);
}
async function pwMake(pw) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, rounds: PW_ROUNDS, hash: await pwHash(pw, salt, PW_ROUNDS) };
}
async function pwCheck(pw, rec) { return !!rec && sameText(await pwHash(pw, rec.salt, rec.rounds), rec.hash); }

// ── access: the same rules as the app's launch preview (lpStatus, lpGrant, lpSemesterEnd, lpRedeem) ──
function endOfDay(iso) { const d = Date.parse(iso + 'T23:59:59+10:00'); return isNaN(d) ? null : d; }   // Sydney (AEST)
function semesterEnd(now, terms) {
  const ends = [];
  Object.keys(terms).forEach(y => ['t2', 't4'].forEach(k => { const e = terms[y] && terms[y][k] && endOfDay(terms[y][k]); if (e) ends.push(e); }));
  return ends.sort((a, b) => a - b).find(e => e > now) || null;
}
function accessOf(user, now) {
  if (!user) return { state: 'none' };
  if (user.plan === 'lifetime') return { state: 'paid', plan: 'lifetime' };
  if (user.until && user.until > now) {
    return user.plan === 'trial'
      ? { state: 'trial', plan: 'trial', until: user.until, daysLeft: Math.max(1, Math.ceil((user.until - now) / DAY_MS)) }
      : { state: 'paid', plan: user.plan, until: user.until };
  }
  return { state: 'ended', plan: user.plan || 'trial', until: user.until || null };
}
function grant(user, kind, days, now, terms) {
  if (user.plan === 'lifetime') return { ok: true, user };
  if (kind === 'lifetime') return { ok: true, user: { ...user, plan: 'lifetime', until: null } };
  const from = Math.max(now, user.until || 0);
  let until;
  if (kind === 'semester') { until = semesterEnd(now, terms); if (!until) return { ok: false, msg: 'Term dates for that semester are not set yet.' }; }
  else if (kind === 'year') until = from + 365 * DAY_MS;
  else until = from + Math.max(1, days | 0) * DAY_MS;
  if (user.until && user.until > until) until = user.until;
  const paidNow = accessOf(user, now).state === 'paid';
  return { ok: true, user: { ...user, plan: kind === 'trial' ? (paidNow ? user.plan : 'trial') : kind, until } };
}
function codeNorm(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
async function termsOf(KV) { return { ...TERMS_DEFAULT, ...((await KV.get('config:terms', 'json')) || {}) }; }

// ── storage helpers ──
async function getUser(KV, id) { return id ? KV.get('user:' + id, 'json') : null; }
async function putUser(KV, u) { await KV.put('user:' + u.id, JSON.stringify(u)); }
async function newSession(KV, user, device) {
  const token = randomHex(32);
  await KV.put('sess:' + await sha(token), JSON.stringify({ uid: user.id, at: Date.now(), seen: Date.now(), device: String(device || '').slice(0, 80) }),
    { expirationTtl: SESSION_DAYS * 86400 });
  return token;
}
// The signed-in account for a request (Authorization: Bearer <token>), or null. Keeps a used session alive for
// another 60 days, writing at most once a day.
async function sessionUser(KV, request) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  if (!m) return null;
  const key = 'sess:' + await sha(m[1]);
  const s = await KV.get(key, 'json');
  if (!s) return null;
  const user = await getUser(KV, s.uid);
  if (!user || (user.authEpoch && s.at < user.authEpoch)) return null;   // a password reset ends older sessions
  if (Date.now() - (s.seen || 0) > DAY_MS) {
    s.seen = Date.now();
    await KV.put(key, JSON.stringify(s), { expirationTtl: SESSION_DAYS * 86400 });
    user.lastSeen = s.seen; await putUser(KV, user);
  }
  return { user, sessKey: key };
}
const YEAR_OK = y => /^20\d\d$/.test(String(y)) && +y >= FIRST_CLASS_YEAR && +y <= new Date().getUTCFullYear() + 2;

// Copy every year's class from a username + PIN account to an email account, then switch the PIN off.
// The old copies stay 30 days as a backup that the PIN can no longer open.
async function moveLegacy(KV, legacyToken, user) {
  const keys = (await listAll(KV, 'session:' + legacyToken)).filter(k => k.name === 'session:' + legacyToken || k.name.startsWith('session:' + legacyToken + ':'));
  let moved = 0;
  for (const k of keys) {
    const rest = k.name.slice(('session:' + legacyToken).length);
    const year = rest ? parseInt(rest.slice(1), 10) : FIRST_CLASS_YEAR;
    if (!YEAR_OK(year)) continue;
    const val = await KV.get(k.name);
    if (val == null) continue;
    const dest = 'class:' + user.id + ':' + year;
    if (!(await KV.get(dest))) {   // never overwrite a class the new account already has
      await KV.put(dest, val, { metadata: { savedAt: (k.metadata && k.metadata.savedAt) || new Date().toISOString(), students: studentsIn(val), version: 1 } });
    }
    if ((await KV.get(dest)) == null) throw new Error('copy failed');
    await KV.put(k.name, val, { expirationTtl: 30 * 86400, metadata: { ...(k.metadata || {}), movedTo: user.id } });
    moved++;
  }
  await KV.put('moved:' + await sha(legacyToken), user.id);
  await KV.delete('acct:' + await sha(legacyToken));
  return moved;
}

async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
    });
    return r.ok;
  } catch { return false; }
}
async function sendReset(env, KV, user) {
  const token = randomHex(32);
  await KV.put('reset:' + await sha(token), user.id, { expirationTtl: 3600 });
  const link = (env.APP_URL || 'https://jasefreters.github.io/commentbuilder/report-comment-builder.html') + '?reset=' + token;
  return sendEmail(env, user.email, 'Reset your Complete Comments password',
    'Hi,\n\nSomeone asked to reset the password for your Complete Comments account. To choose a new one, open this link within the next hour:\n\n' +
    link + '\n\nIf you didn\'t ask for this, you can ignore this email. Your password hasn\'t changed.\n\nComplete Comments');
}

// Answers an /auth, /me, /class, /codes or /admin/(users|codes|terms) request, or returns null for other paths.
async function accountsRoute(request, env, path, reply) {
  const KV = env.SESSIONS;
  const on = env.ACCOUNTS === 'on';
  if (path === '/auth/config') return reply({ accounts: on, email: !!(env.RESEND_API_KEY && env.EMAIL_FROM), enforce: env.ENFORCE_ACCESS === 'on', trialDays: TRIAL_DAYS });
  const mine = /^\/(auth|me|class|codes)(\/|$)/.test(path) || /^\/admin\/(users|codes|terms)(\/|$)/.test(path);
  if (!mine) return null;
  if (!on) return reply({ error: 'Not found' }, 404);
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipKey = await sha(ip);
  const body = async () => { try { return await request.json(); } catch { return {}; } };
  const limited = async (key, max, ttl) => {
    if (parseInt((await KV.get(key)) || '0', 10) >= max) return true;
    await bump(KV, key, ttl); return false;
  };

  // ── sign-up: email + password (+ an old username + PIN to bring across) → 6-digit code by email ──
  if (path === '/auth/signup' && request.method === 'POST') {
    const b = await body();
    const email = normEmail(b.email);
    if (!okEmail(email)) return reply({ error: 'Enter your email address.' }, 400);
    const bad = pwProblem(b.password); if (bad) return reply({ error: bad }, 400);
    if (await KV.get('email:' + email)) return reply({ error: 'That email already has an account. Sign in instead.' }, 409);
    if (await limited('rl:signup:' + ipKey, 10, 3600)) return reply({ error: 'Too many sign-ups from this connection. Try again in an hour.' }, 429);
    let legacy = null;
    const lt = (request.headers.get('X-User-Token') || '').trim().toLowerCase();
    if (lt) {
      if (!validateToken(lt) || !(await accountExists(env, lt))) return reply({ error: 'That username and PIN don\'t match an account.' }, 400);
      legacy = lt;
    }
    if (!(env.RESEND_API_KEY && env.EMAIL_FROM)) return reply({ error: 'Email isn\'t set up yet, so new accounts can\'t be made. Try again soon.' }, 503);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    await KV.put('verify:' + email, JSON.stringify({ code: await sha(email + ':' + code), tries: 0, pw: await pwMake(b.password), legacy }), { expirationTtl: 900 });
    const sent = await sendEmail(env, email, 'Your Complete Comments code: ' + code,
      'Hi,\n\nYour code to finish making your Complete Comments account is:\n\n' + code + '\n\nIt works for 15 minutes. If you didn\'t ask for this, you can ignore this email.\n\nComplete Comments');
    if (!sent) return reply({ error: 'The email couldn\'t be sent. Check the address and try again.' }, 502);
    return reply({ ok: true, sent: true });
  }

  // ── verify the 6-digit code → account made, trial started (or lifetime, for a teacher brought across) ──
  if (path === '/auth/verify' && request.method === 'POST') {
    const b = await body();
    const email = normEmail(b.email);
    const v = await KV.get('verify:' + email, 'json');
    if (!v) return reply({ error: 'That code has expired. Ask for a new one.' }, 400);
    if (v.tries >= 5) { await KV.delete('verify:' + email); return reply({ error: 'Too many wrong codes. Ask for a new one.' }, 429); }
    if (!sameText(await sha(email + ':' + String(b.code || '').trim()), v.code)) {
      v.tries++; await KV.put('verify:' + email, JSON.stringify(v), { expirationTtl: 900 });
      return reply({ error: 'That code isn\'t right.' }, 400);
    }
    if (await KV.get('email:' + email)) { await KV.delete('verify:' + email); return reply({ error: 'That email already has an account. Sign in instead.' }, 409); }
    const trialKey = 'trialused:' + await sha(email);
    const hadTrial = !!(await KV.get(trialKey));
    let user = { id: randomHex(16), email, verified: true, pw: v.pw, created: now, lastSeen: now, plan: 'trial', until: hadTrial ? now - 1 : now + TRIAL_DAYS * DAY_MS };
    await KV.put('email:' + email, user.id);
    if (!hadTrial) await KV.put(trialKey, '1');
    if (v.legacy) {
      user = { ...user, plan: 'lifetime', until: null, legacy: v.legacy.split(':')[0] };
      await putUser(KV, user);
      await moveLegacy(KV, v.legacy, user);
    } else await putUser(KV, user);
    await KV.delete('verify:' + email);
    return reply({ ok: true, token: await newSession(KV, user, b.device), access: accessOf(user, now), hadTrial });
  }

  // ── sign in ──
  if (path === '/auth/signin' && request.method === 'POST') {
    const b = await body();
    const email = normEmail(b.email);
    const rlE = 'rl:pw:' + await sha(email), rlA = 'rl:pw-all:' + ipKey;
    const [e, a] = await Promise.all([KV.get(rlE), KV.get(rlA)]);
    if (parseInt(e || '0', 10) >= 10 || parseInt(a || '0', 10) >= 30) return reply({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
    const id = await KV.get('email:' + email);
    let user = id ? await getUser(KV, id) : null;
    if (!user || !(await pwCheck(String(b.password || ''), user.pw))) {
      await Promise.all([bump(KV, rlE, 900), bump(KV, rlA, 3600)]);
      return reply({ error: 'That email and password don\'t match.' }, 401);
    }
    if (user.pw.rounds < PW_ROUNDS) user.pw = await pwMake(String(b.password));   // stronger scrambling, now it's allowed
    user.lastSeen = now; await putUser(KV, user);
    return reply({ ok: true, token: await newSession(KV, user, b.device), access: accessOf(user, now) });
  }

  if (path === '/auth/forgot' && request.method === 'POST') {
    const b = await body();
    const email = normEmail(b.email);
    if (await limited('rl:forgot:' + await sha(email), 3, 3600)) return reply({ ok: true });
    const id = await KV.get('email:' + email);
    const user = id ? await getUser(KV, id) : null;
    if (user) await sendReset(env, KV, user);
    return reply({ ok: true });   // the same answer either way, so it can't be used to find out who has an account
  }

  if (path === '/auth/reset' && request.method === 'POST') {
    const b = await body();
    const key = 'reset:' + await sha(String(b.token || ''));
    const id = await KV.get(key);
    const user = id ? await getUser(KV, id) : null;
    if (!user) return reply({ error: 'That link has expired. Ask for a new one.' }, 400);
    const bad = pwProblem(b.password); if (bad) return reply({ error: bad }, 400);
    user.pw = await pwMake(b.password);
    user.authEpoch = now;   // signs out every other device
    await putUser(KV, user);
    await KV.delete(key);
    await KV.delete('rl:pw:' + await sha(user.email));
    return reply({ ok: true, token: await newSession(KV, { ...user }, b.device) });
  }

  // ── everything below needs a signed-in account ──
  if (/^\/admin\//.test(path)) {
    const denied = await adminCheck(request, KV, env, reply);
    if (denied) return denied;
    return adminAccountsRoute(request, env, path, reply, now);
  }
  const who = await sessionUser(KV, request);
  if (!who) return reply({ error: 'Sign in again.', signin: true }, 401);
  let user = who.user;

  if (path === '/auth/signout' && request.method === 'POST') { await KV.delete(who.sessKey); return reply({ ok: true }); }

  if (path === '/me' && request.method === 'GET') {
    return reply({ email: user.email, created: user.created, legacy: user.legacy || null, access: accessOf(user, now), enforce: env.ENFORCE_ACCESS === 'on' });
  }

  // a signed-in teacher brings an old username + PIN account across (if they made the email account first)
  if (path === '/auth/link' && request.method === 'POST') {
    const lt = (request.headers.get('X-User-Token') || '').trim().toLowerCase();
    if (!validateToken(lt) || !(await accountExists(env, lt))) return reply({ error: 'That username and PIN don\'t match an account.' }, 400);
    const moved = await moveLegacy(KV, lt, user);
    user = { ...user, plan: 'lifetime', until: null, legacy: lt.split(':')[0] };
    await putUser(KV, user);
    return reply({ ok: true, moved, access: accessOf(user, now) });
  }

  if (path === '/codes/redeem' && request.method === 'POST') {
    const b = await body();
    if (await limited('rl:code:' + user.id, 10, 3600)) return reply({ error: 'Too many tries. Wait an hour.' }, 429);
    const code = codeNorm(b.code);
    const c = code && await KV.get('code:' + code, 'json');
    if (!c) return reply({ error: 'That code isn\'t right. Check it and try again.' }, 400);
    if (!c.on) return reply({ error: 'That code has been switched off.' }, 400);
    if (c.expires && endOfDay(c.expires) < now) return reply({ error: 'That code has expired.' }, 400);
    if ((c.used || []).includes(user.id)) return reply({ error: 'You\'ve already used that code.' }, 400);
    if ((c.used || []).length >= c.uses) return reply({ error: 'That code has been used up.' }, 400);
    const g = grant(user, c.type, c.days, now, await termsOf(KV));
    if (!g.ok) return reply({ error: g.msg }, 400);
    c.used = (c.used || []).concat(user.id);
    await KV.put('code:' + code, JSON.stringify(c));
    await putUser(KV, g.user);
    return reply({ ok: true, type: c.type, days: c.days || 0, access: accessOf(g.user, now) });
  }

  // ── a year's class: load, and save with a version check so another device's newer save isn't lost (D7) ──
  if (path === '/class') {
    const y = new URL(request.url).searchParams.get('year') || String(FIRST_CLASS_YEAR);
    if (!YEAR_OK(y)) return reply({ error: 'Invalid class year.' }, 400);
    const key = 'class:' + user.id + ':' + y;
    if (request.method === 'GET') {
      const { value, metadata } = await KV.getWithMetadata(key);
      if (value == null) return reply({ found: false, version: 0 });
      return reply({ found: true, session: JSON.parse(value), version: (metadata && metadata.version) || 1, savedAt: metadata && metadata.savedAt });
    }
    if (request.method === 'PUT') {
      if (env.ENFORCE_ACCESS === 'on' && accessOf(user, now).state === 'ended') return reply({ error: 'Your trial or pass has ended. Choose a pass to keep saving.', access: accessOf(user, now) }, 402);
      const text = await request.text();
      if (text.length > 10 * 1024 * 1024) return reply({ error: 'Class too large' }, 413);
      try { JSON.parse(text); } catch { return reply({ error: 'Invalid JSON' }, 400); }
      const { value, metadata } = await KV.getWithMetadata(key);
      const current = value == null ? 0 : ((metadata && metadata.version) || 1);
      const base = request.headers.get('X-Base-Version');
      if (base !== null && base !== '' && parseInt(base, 10) !== current) {
        return reply({ conflict: true, version: current, savedAt: metadata && metadata.savedAt, session: value == null ? null : JSON.parse(value) }, 409);
      }
      const savedAt = new Date().toISOString();
      await KV.put(key, text, { metadata: { savedAt, students: studentsIn(text), version: current + 1 } });
      return reply({ ok: true, version: current + 1, savedAt });
    }
    if (request.method === 'DELETE') {
      await KV.delete(key);
      return reply({ ok: true });
    }
  }
  return reply({ error: 'Not found' }, 404);
}

// ── admin: accounts made with an email, codes, term dates ──
async function adminAccountsRoute(request, env, path, reply, now) {
  const KV = env.SESSIONS;
  const body = async () => { try { return await request.json(); } catch { return {}; } };
  if (path === '/admin/users' && request.method === 'GET') {
    const users = (await Promise.all((await listAll(KV, 'user:')).map(k => KV.get(k.name, 'json')))).filter(Boolean);
    const classes = await listAll(KV, 'class:');
    return reply({ users: users.map(u => ({
      id: u.id, email: u.email, created: u.created, lastSeen: u.lastSeen, legacy: u.legacy || null, access: accessOf(u, now),
      classes: classes.filter(k => k.name.startsWith('class:' + u.id + ':')).map(k => ({ year: +k.name.split(':')[2], students: (k.metadata || {}).students || 0, savedAt: (k.metadata || {}).savedAt })),
    })) });
  }
  let m = /^\/admin\/users\/([0-9a-f]{32})\/reset$/.exec(path);
  if (m && request.method === 'POST') {
    const user = await getUser(KV, m[1]);
    if (!user) return reply({ error: 'Not found' }, 404);
    const sent = await sendReset(env, KV, user);
    return sent ? reply({ ok: true }) : reply({ error: 'Email isn\'t set up yet, so the reset link couldn\'t be sent.' }, 503);
  }
  m = /^\/admin\/users\/([0-9a-f]{32})$/.exec(path);
  if (m && request.method === 'DELETE') {
    const user = await getUser(KV, m[1]);
    if (!user) return reply({ error: 'Not found' }, 404);
    for (const k of await listAll(KV, 'class:' + user.id + ':')) await KV.delete(k.name);
    await KV.delete('email:' + user.email);
    await KV.delete('user:' + user.id);
    return reply({ ok: true });   // their sessions stop working because the account is gone; trialused stays
  }
  if (path === '/admin/codes' && request.method === 'GET') {
    const codes = (await Promise.all((await listAll(KV, 'code:')).map(k => KV.get(k.name, 'json')))).filter(Boolean);
    return reply({ codes: codes.sort((a, b) => (b.created || 0) - (a.created || 0)) });
  }
  if (path === '/admin/codes' && request.method === 'POST') {
    const b = await body();
    const code = codeNorm(b.code);
    const type = ['lifetime', 'trial', 'semester', 'year'].includes(b.type) ? b.type : null;
    const days = parseInt(b.days, 10), uses = parseInt(b.uses, 10);
    if (code.length < 4 || code.length > 20) return reply({ error: 'Codes need 4 to 20 letters or numbers.' }, 400);
    if (!type) return reply({ error: 'Choose what the code gives.' }, 400);
    if (type === 'trial' && !(days >= 1 && days <= 365)) return reply({ error: 'Trial days must be from 1 to 365.' }, 400);
    if (!(uses >= 1 && uses <= 10000)) return reply({ error: 'Uses must be from 1 to 10,000.' }, 400);
    if (b.expires && !/^\d{4}-\d{2}-\d{2}$/.test(b.expires)) return reply({ error: 'Invalid stop date.' }, 400);
    if (await KV.get('code:' + code)) return reply({ error: 'That code already exists.' }, 409);
    const c = { code, type, days: type === 'trial' ? days : 0, uses, expires: b.expires || '', note: String(b.note || '').slice(0, 80), on: true, used: [], created: now };
    await KV.put('code:' + code, JSON.stringify(c));
    return reply({ ok: true, code: c });
  }
  m = /^\/admin\/codes\/([A-Z0-9]{4,20})$/.exec(path);
  if (m && request.method === 'PATCH') {
    const c = await KV.get('code:' + m[1], 'json');
    if (!c) return reply({ error: 'Not found' }, 404);
    const b = await body();
    if (typeof b.on === 'boolean') c.on = b.on;
    await KV.put('code:' + m[1], JSON.stringify(c));
    return reply({ ok: true, code: c });
  }
  if (path === '/admin/terms' && request.method === 'GET') return reply({ terms: await termsOf(KV) });
  if (path === '/admin/terms' && request.method === 'PUT') {
    const b = await body(), t = {};
    for (const [y, v] of Object.entries(b.terms || {})) {
      if (!/^20\d\d$/.test(y) || !v) continue;
      t[y] = {};
      for (const k of ['t2', 't4']) if (v[k] && /^\d{4}-\d{2}-\d{2}$/.test(v[k])) t[y][k] = v[k];
    }
    await KV.put('config:terms', JSON.stringify(t));
    return reply({ ok: true, terms: await termsOf(KV) });
  }
  return reply({ error: 'Not found' }, 404);
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

    // ── Accounts v2 (email + password): off until the ACCOUNTS setting is "on" ──
    {
      const r = await accountsRoute(request, env, path, (o, st) => cors(JSON.stringify(o), st));
      if (r) return r;
    }

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

      // Once accounts are on: a username + PIN that has moved to an email account no longer opens anything,
      // and after LEGACY_UNTIL no username + PIN does.
      if (env.ACCOUNTS === 'on') {
        if (await env.SESSIONS.get('moved:' + await sha(token))) {
          return cors(JSON.stringify({ error: 'This account has moved to email sign-in. Sign in with your email instead.', moved: true }), 410);
        }
        const until = endOfDay(env.LEGACY_UNTIL || '2027-03-31');
        if (until && Date.now() > until) {
          return cors(JSON.stringify({ error: 'Username and PIN sign-in has ended. Contact Complete Comments to move your account across.', ended: true }), 410);
        }
      }

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
      // An email account (Bearer session, when accounts are on) or a username + PIN account
      let aiWho = null;
      if (env.ACCOUNTS === 'on' && /^Bearer /.test(request.headers.get('Authorization') || '')) {
        const s = await sessionUser(env.SESSIONS, request);
        if (!s) return aiError('sign_in_required', 'Sign in again to use the AI features.', 401);
        if (env.ENFORCE_ACCESS === 'on' && accessOf(s.user, Date.now()).state === 'ended') return aiError('access_ended', 'Your trial or pass has ended.', 402);
        aiWho = s.user.id;
      }
      const token = (request.headers.get('X-User-Token') || '').trim().toLowerCase();
      if (!aiWho && (!validateToken(token) || !(await accountExists(env, token)))) {
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
      const useKey = 'ai:' + (aiWho || await sha(token)) + ':' + monthKey();
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
