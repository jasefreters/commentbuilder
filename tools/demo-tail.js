// ══ DEMO MODE start-up ════════════════════════════════════════════════════════════
function demoStart() {
  // a small sample class on a first visit (the demo remembers changes on this device only)
  const seed = () => {
    if (students.length === 1 && !students[0].name && !Object.keys(students[0].selected || {}).length) {
      students = [
        { name: 'Sam', pronoun: 'he', year: '5' },
        { name: 'Ava', pronoun: 'she', year: '5' },
        { name: 'Jordan', pronoun: 'they', year: '4' },
        { name: 'Mia', pronoun: 'she', year: '6' }
      ].map((s, i) => _normStudent(s, i));
      currentIdx = 0; totalStudents = students.length;
      loadCur(); render(); updateProgress();
    }
  };
  let n = 0;
  const wait = setInterval(() => { if (_stateLoaded || ++n > 40) { clearInterval(wait); try { seed(); } catch (e) { console.error(e); } } }, 100);
  const logo = document.querySelector('header .logo');
  if (logo) logo.insertAdjacentHTML('beforeend', ' <span class="demo-pill">Demo</span>');
  const right = document.querySelector('.hdr-right');
  if (right) right.insertAdjacentHTML('afterbegin',
    '<a class="demo-cta" href="index.html#signup">Get started free</a>' +
    '<button class="demo-reset" type="button" onclick="demoReset()" title="Clear everything you tried and start again">Start over</button>');
  _rcShownThisLoad = true;   // no "Recent changes" pop-up: the demo has no history
  const rcBtn = document.querySelector('[onclick="openRecentChanges(true)"]');
  if (rcBtn) { const row = rcBtn.closest('.settings-row'); if (row) { if (row.previousElementSibling) row.previousElementSibling.style.display = 'none'; row.style.display = 'none'; } }
  const ap = document.querySelector('.sw-pane[data-swpane="appearance"]');
  if (ap) ap.insertAdjacentHTML('beforeend', '<div class="sw-pane-title">This demo</div><div class="settings-row"><span class="settings-row-label">Start over<span class="sw-help">Clears everything you tried here and brings back the sample class. Nothing in this demo is sent anywhere.</span></span><button class="settings-action-btn" onclick="demoReset()">Start over</button></div>');
  const lab = document.getElementById('saveLabel'); if (lab) lab.textContent = 'Demo';
}
function demoReset() {
  if (!confirm('Clear everything you tried in the demo and start again?')) return;
  try { localStorage.clear(); } catch (e) {}
  try { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => location.reload(); setTimeout(() => location.reload(), 600); } catch (e) { location.reload(); }
}
// Band placement for the demo. The real app puts each comment under the highest grade it fits, so for some years a
// band can be empty (Year 6: B, C and D all take Stage 3). In the demo a band with nothing of its own is given a
// spare comment from a band that has more than one, so every band shows a comment.
function _fillBands(L, out) {   // L: grade -> comments that fit it; out: grade -> comments placed (highest grade first)
  const band = {}; GRADE_ORDER.forEach(g => out[g].forEach(s => { band[s] = g; }));
  const move = (s, to) => { const from = band[s]; out[from].splice(out[from].indexOf(s), 1); out[to].push(s); band[s] = to; };
  const fill = (g, seen) => {
    for (const s of L[g]) { const h = band[s]; if (h !== g && out[h].length >= 2) { move(s, g); return true; } }
    for (const s of L[g]) {
      const h = band[s]; if (h === g || seen.has(h)) continue;
      seen.add(h); move(s, g);
      if (fill(h, seen)) return true;
      move(s, h);
    }
    return false;
  };
  GRADE_ORDER.forEach(g => { if (!out[g].length && L[g].length) fill(g, new Set([g])); });
  GRADE_ORDER.forEach(g => { out[g] = L[g].filter(s => band[s] === g); });
  return out;
}
const _realAllGrades = yearAllGrades;
yearAllGrades = function (cat) {
  const out = _realAllGrades(cat);
  if (!yearGradingActive()) return out;
  const L = {}; GRADE_ORDER.forEach(g => { const r = yearSents(cat, g); L[g] = r.fallback ? [] : r.list; });
  GRADE_ORDER.forEach(g => { if (!out[g]) out[g] = []; });
  return _fillBands(L, out);
};
demoStart();
