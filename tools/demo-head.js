// ══ DEMO MODE (added by tools/build-demo.js; not in the real app) ═══════════════
const DEMO_MODE = true;
(function () {
  // The demo shares a website address with the real app, so keep its saved data apart: every key gets a "demo:" prefix
  // (the light/dark choice is shared on purpose). Nothing the demo does can touch a real session.
  const real = window.localStorage, P = 'demo:', shared = k => k === 'rcb_theme';
  const mk = k => shared(k) ? k : P + k;
  const shim = {
    getItem: k => real.getItem(mk(k)),
    setItem: (k, v) => real.setItem(mk(k), v),
    removeItem: k => real.removeItem(mk(k)),
    clear: () => { Object.keys(real).filter(k => k.indexOf(P) === 0).forEach(k => real.removeItem(k)); },
    key: i => { const ks = Object.keys(real).filter(k => k.indexOf(P) === 0); return ks[i] === undefined ? null : ks[i].slice(P.length); },
    get length() { return Object.keys(real).filter(k => k.indexOf(P) === 0).length; }
  };
  try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch (e) { window.__demoStorageFailed = true; }
  // no sign-in, cloud, AI or feedback calls: nothing leaves the page
  window.fetch = () => Promise.reject(new TypeError('This is the demo: nothing is sent anywhere.'));
})();
