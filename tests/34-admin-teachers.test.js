// Admin panel (v3.19.3): one row per teacher, with each school year's class inside it, and the AI used this month.
// Deleting a teacher deletes every year, the first (2026) class last. A later year can be deleted on its own.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');

after(closeBrowser);

const LIST = {
  total: 4, teachers: 3, aiLimitUsd: 2, accounts: [
    { id: 'a'.repeat(32), acct: 'x1', user: 'jason', year: 2027, username: 'jason (2027)', lastSaved: '2026-11-24T08:45:00Z', students: 1, aiUsd: 0.4123 },
    { id: 'b'.repeat(32), acct: 'x1', user: 'jason', year: 2026, username: 'jason', lastSaved: '2026-11-24T08:44:00Z', students: 24, aiUsd: 0.4123 },
    { id: 'c'.repeat(32), acct: 'x2', user: 'brad', year: 2026, username: 'brad', lastSaved: '2026-11-17T11:07:00Z', students: 29, aiUsd: 0 },
    { id: 'd'.repeat(32), acct: 'x3', user: 'brad', year: 2026, username: 'brad', lastSaved: '2026-11-10T11:07:00Z', students: 2, aiUsd: 1.5 },
  ]
};

test('one row per teacher; same username with a different PIN stays a separate teacher', async () => {
  const page = await openApp();
  const r = await page.evaluate(async (LIST) => {
    const deleted = [];
    window.fetch = async (url, init) => {
      if (init && init.method === 'DELETE') { deleted.push(url.split('/').pop()); return new Response('{"ok":true}', { status: 200 }); }
      return new Response(JSON.stringify(LIST), { status: 200 });
    };
    window.confirm = () => true;
    _adminAuthed = true; _adminKey = 'k';
    document.getElementById('adminOverlay').style.display = 'flex';
    await adminRefresh();
    const rows = [...document.querySelectorAll('#adminTableBody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
    const count = document.getElementById('adminAccountCount').textContent;
    // delete the second "brad" (2 students): only that teacher's class goes
    const bradRow = [...document.querySelectorAll('#adminTableBody tr')].find(tr => /2 students/.test(tr.innerText));
    bradRow.querySelector('[data-admin-del]').click();
    await new Promise(res => setTimeout(res, 50));
    const afterOne = deleted.slice();
    return { rows, count, afterOne };
  }, LIST);
  assert.strictEqual(r.count, '3 teachers · 4 classes');
  assert.strictEqual(r.rows.length, 3);
  assert.match(r.rows[0], /jason/);
  assert.match(r.rows[0], /2026 · 24 students.*2027 · 1 student/);
  assert.match(r.rows[0], /\$0\.41 of \$2/);
  assert.strictEqual(r.rows.filter(x => /^brad/.test(x)).length, 2);
  assert.deepStrictEqual(r.afterOne, ['d'.repeat(32)]);
  await page.context().close();
});

test('deleting a teacher removes later years first, the 2026 class last; one year can go on its own', async () => {
  const page = await openApp();
  const r = await page.evaluate(async (LIST) => {
    const deleted = [];
    window.fetch = async (url, init) => {
      if (init && init.method === 'DELETE') { deleted.push(url.split('/').pop()); return new Response('{"ok":true}', { status: 200 }); }
      return new Response(JSON.stringify(LIST), { status: 200 });
    };
    window.confirm = () => true;
    localStorage.setItem('rcb_cloud_user', 'nobody');
    _adminAuthed = true; _adminKey = 'k';
    await adminRefresh();
    const row = () => [...document.querySelectorAll('#adminTableBody tr')].find(tr => /24 students/.test(tr.innerText));
    row().querySelector('[data-admin-del-year="1"]').click();   // the 2027 class only
    await new Promise(res => setTimeout(res, 50));
    const yearOnly = deleted.splice(0);
    await adminDeleteTeacher({ user: 'jason', classes: [{ id: 'b'.repeat(32), year: 2026, students: 24 }, { id: 'a'.repeat(32), year: 2027, students: 1 }] });
    return { yearOnly, all: deleted };
  }, LIST);
  assert.deepStrictEqual(r.yearOnly, ['a'.repeat(32)]);
  assert.deepStrictEqual(r.all, ['a'.repeat(32), 'b'.repeat(32)]);
  await page.context().close();
});
