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
demoStart();
