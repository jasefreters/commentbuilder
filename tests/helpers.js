// Shared set-up for the safety-net tests.
// Every test opens the real app file in a hidden browser. Nothing is sent anywhere: all web requests are blocked
// unless a test supplies its own pretend cloud.
const path = require('path');
const { chromium } = require('playwright');

// RCB_APP lets the same tests be pointed at another copy of the app (for example an older version).
const APP = 'file://' + path.resolve(process.env.RCB_APP || path.join(__dirname, '..', 'report-comment-builder.html'));
const SUBJECTS = ['general', 'english', 'maths'];

let _browser;
async function browser() { return _browser || (_browser = await chromium.launch()); }
async function closeBrowser() { if (_browser) { await _browser.close(); _browser = null; } }

// Opens the app in a fresh, empty browser profile. `cloud` is an optional pretend cloud (see fakeCloud()).
async function openApp({ cloud, context } = {}) {
  const ctx = context || await (await browser()).newContext();
  if (!context) {
    await ctx.route(/^https?:\/\//, route => (cloud ? cloud.handle(route) : route.abort()));
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(APP);
  await page.waitForFunction(() => typeof _stateLoaded !== 'undefined' && _stateLoaded, null, { timeout: 15000 });
  // No "Recent changes" pop-up in tests: it covers the page and blocks clicks.
  await page.evaluate(() => { _rcShownThisLoad = true; const o = document.getElementById('rcOverlay'); if (o) o.style.display = 'none'; });
  return page;
}

// A made-up class of six, each with a General, English and Maths comment and two future directions per subject.
// Built through the app's own functions, the way a teacher's clicks would.
async function seedClass(page) {
  await page.evaluate(() => {
    const kids = [['Sam', 'he'], ['Ava', 'she'], ['Jordan', 'they'], ['Mia', 'she'], ['Ruby-Lee', 'she'], ['Tom', 'he']];
    students = kids.map((k, i) => _normStudent({ name: k[0], pronoun: k[1], year: '5' }, i));
    currentIdx = 0; totalStudents = students.length;
    loadCur(); render(); updateProgress();
    const gcats = ['Personality', 'Effort & Work Habits', 'Social Skills', 'Independence', 'Closing Statement'];
    students.forEach((_, i) => {
      switchStu(i);
      setSubject('general');
      gcats.forEach((c, j) => { const a = RAW[c]; toggleOpt(c, a[(i * 2 + j) % a.length]); });
      ['english', 'maths'].forEach(subj => {
        setSubject(subj);
        const bank = getBank();
        Object.keys(bank).filter(c => c !== 'Below Expectations').slice(0, 5).forEach((c, j) => {
          const g = bank[c]; const arr = g.C || g[Object.keys(g)[0]];
          toggleSubjOpt(c, arr[(i + j) % arr.length]);
        });
        const fd = subj === 'english' ? ENGLISH_FD : MATHS_FD; const strands = Object.keys(fd);
        toggleFD(fd[strands[i % strands.length]]['Stage 3'][0]);
        toggleFD(fd[strands[(i + 1) % strands.length]]['Stage 3'][1]);
      });
    });
    switchStu(0); setSubject('general'); setView('build');
    autoSave();
  });
  await settle(page);
  // Open every comment in Review once, as a teacher finishing a class has. (Opening Review marks a comment Done.)
  await page.evaluate(async subjects => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < students.length; i++) { switchStu(i); for (const s of subjects) { setSubject(s); setView('publish'); await wait(20); } }
    setView('build'); switchStu(0); setSubject('general'); autoSave();
  }, SUBJECTS);
  await settle(page);
}

// The finished text of every comment in the class: { "Sam|english": "...", ... }
function snapshot(page) {
  return page.evaluate(subjects => {
    const out = {};
    students.forEach(s => subjects.forEach(k => { out[s.name + '|' + k] = getFinalCommentText(s, k); }));
    return out;
  }, SUBJECTS);
}

// Lets the app's timers (autosave, repaint) finish.
async function settle(page, ms = 250) { await page.waitForTimeout(ms); }

// Opens one student's comment in Review.
async function openReview(page, name, subj) {
  await page.evaluate(([name, subj]) => {
    switchStu(students.findIndex(s => s.name === name));
    setSubject(subj);
    setView('publish');
  }, [name, subj]);
  await page.waitForSelector('#pubContent span[data-pi][data-si]');
  await settle(page);
}

// Changes one sentence in Review the way the app's own tools do (a synonym swap, a suggested fix, Polish):
// the words on the page change, then the tool calls _afterReviewEdit(), as every Review tool in the app does.
async function changeInReview(page, sentenceIndex, text) {
  await page.evaluate(([i, text]) => {
    const span = document.querySelectorAll('#pubContent span[data-pi][data-si]')[i];
    const t = span.textContent.replace(/\s+$/, '');
    const end = /[.!?]$/.test(t) ? t.slice(-1) : '';
    span.textContent = (end ? t.slice(0, -1) : t) + text + end + ' ';
    _afterReviewEdit();
  }, [sentenceIndex, text]);
}

// What changed between two snapshots: a list of "Sam|english" keys.
function changedKeys(before, after) {
  return Object.keys({ ...before, ...after }).filter(k => before[k] !== after[k]).sort();
}

// A pretend cloud that several pretend devices can share. It keeps one saved class per sign-in.
function fakeCloud() {
  const store = new Map();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  return {
    store,
    saves: 0,
    offline: false,
    async handle(route) {
      const req = route.request(); const url = new URL(req.url());
      if (this.offline) return route.abort();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname !== '/session') return route.fulfill({ status: 404, headers: cors, body: '{}' });
      const token = (req.headers()['x-user-token'] || '').toLowerCase();
      const json = (o, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
      if (req.method() === 'GET') return store.has(token) ? json({ found: true, session: JSON.parse(store.get(token)) }) : json({ found: false });
      if (req.method() === 'PUT') { store.set(token, req.postData()); this.saves++; return json({ ok: true, savedAt: new Date().toISOString() }); }
      return json({ error: 'Method not allowed' }, 405);
    },
  };
}

module.exports = { APP, SUBJECTS, openApp, seedClass, snapshot, settle, openReview, changeInReview, changedKeys, fakeCloud, closeBrowser, browser };
