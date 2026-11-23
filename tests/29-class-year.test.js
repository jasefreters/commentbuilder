// v3.18.0: a school year menu. 2026 is the existing class, untouched; 2027 is a new class with the settings and My bank.
const { test, after } = require('node:test');
const assert = require('node:assert');
const { APP, browser, openApp, seedClass, fakeCloud, closeBrowser } = require('./helpers');
after(closeBrowser);

// Opens the app again in the same browser profile (same storage), optionally on a given date.
async function reopen(ctx, at) {
  const page = await ctx.newPage();
  if (at) await page.clock.setFixedTime(new Date(at));
  await page.goto(APP);
  await page.waitForFunction(() => typeof _stateLoaded !== 'undefined' && _stateLoaded, null, { timeout: 15000 });
  await page.evaluate(() => { _rcShownThisLoad = true; const o = document.getElementById('rcOverlay'); if (o) o.style.display = 'none'; });
  await page.waitForTimeout(400);
  return page;
}
const state = page => page.evaluate(() => ({ year: classYear, menu: [...document.querySelectorAll('#yearSel option')].map(o => o.textContent), shown: document.getElementById('yearSel').value, names: students.map(s => s.name), bank: JSON.stringify(myBank) }));
async function switchTo(page, ctx, y, at) {
  await page.evaluate(y => { window.location.reload = () => {}; return setClassYear(y); }, y);
  await page.close();
  return reopen(ctx, at);
}
async function freshCtx(cloud) {
  const ctx = await (await browser()).newContext();
  await ctx.route(/^https?:\/\//, route => (cloud ? cloud.handle(route) : route.abort()));
  return ctx;
}

test('2026 opens by default with the class as it is, and the menu shows 2026 and 2027', async () => {
  const ctx = await freshCtx();
  let page = await reopen(ctx, '2026-11-24T09:00:00+11:00');
  await seedClass(page);
  await page.evaluate(() => { myBank['Personality'] = [{ text: '{{N}} is a joy to teach.' }]; autoSave(); });
  await page.waitForTimeout(400); await page.close();
  page = await reopen(ctx, '2026-11-24T09:05:00+11:00');
  const r = await state(page);
  assert.strictEqual(r.year, 2026); assert.deepStrictEqual(r.menu, ['2026', '2027']); assert.strictEqual(r.shown, '2026');
  assert.deepStrictEqual(r.names, ['Sam', 'Ava', 'Jordan', 'Mia', 'Ruby-Lee', 'Tom']);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => /rcb_session/.test(k)));
  assert.deepStrictEqual(keys, ['rcb_session'], 'the 2026 class stays under its original key');
  await ctx.close();
});

test('2027 is a new class with the settings and My bank; 2026 is untouched; the app stays on the year it was left on', async () => {
  const ctx = await freshCtx();
  let page = await reopen(ctx, '2026-11-24T09:00:00+11:00');
  await seedClass(page);
  await page.evaluate(() => { myBank['Personality'] = [{ text: '{{N}} is a joy to teach.' }]; lsSet('rcb_wordlimit', 120); autoSave(); });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => localStorage.getItem('rcb_session'));
  page = await switchTo(page, ctx, 2027, '2026-11-24T09:10:00+11:00');
  let r = await state(page);
  assert.strictEqual(r.year, 2027); assert.strictEqual(r.shown, '2027');
  assert.ok(r.names.every(n => !n), 'no students copied: ' + r.names.join(','));
  assert.ok(/joy to teach/.test(r.bank), 'My bank kept');
  await page.evaluate(() => { students[0].name = 'Noah'; autoSave(); });
  await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('rcb_session')), before, '2026 is not touched by working in 2027');
  page = await reopen(ctx, '2026-11-25T09:00:00+11:00');
  r = await state(page); assert.strictEqual(r.year, 2027, 'stays on the year it was left on'); assert.strictEqual(r.names[0], 'Noah');
  page = await switchTo(page, ctx, 2026, '2026-11-25T09:05:00+11:00');
  r = await state(page);
  assert.strictEqual(r.year, 2026); assert.deepStrictEqual(r.names, ['Sam', 'Ava', 'Jordan', 'Mia', 'Ruby-Lee', 'Tom']);
  await ctx.close();
});

test('the first open in a new calendar year moves to it once; choosing 2026 after that sticks', async () => {
  const ctx = await freshCtx();
  let page = await reopen(ctx, '2026-12-20T09:00:00+11:00');
  await seedClass(page); await page.evaluate(() => autoSave()); await page.waitForTimeout(400); await page.close();
  page = await reopen(ctx, '2027-01-01T08:00:00+11:00');
  let r = await state(page); assert.strictEqual(r.year, 2027, 'new year opens by default');
  page = await switchTo(page, ctx, 2026, '2027-01-02T09:00:00+11:00');
  r = await state(page); assert.strictEqual(r.year, 2026);
  await page.close();
  page = await reopen(ctx, '2027-01-03T09:00:00+11:00');
  r = await state(page); assert.strictEqual(r.year, 2026, 'kept on the year it was left on');
  await ctx.close();
});

test('the cloud keeps each year apart: 2026 sends no year, 2027 saves to its own copy', async () => {
  const cloud = fakeCloud();
  const ctx = await freshCtx(cloud);
  let page = await reopen(ctx, '2026-11-24T09:00:00+11:00');
  await seedClass(page);
  await page.evaluate(async () => { setCloudUser('testteacher'); setCloudPin('1234'); await cloudSave(true); });
  const s2026 = cloud.store.get('testteacher:1234');
  assert.ok(s2026 && /Ruby-Lee/.test(s2026));
  page = await switchTo(page, ctx, 2027, '2026-11-24T09:10:00+11:00');
  await page.evaluate(async () => { students[0].name = 'Noah'; saveCur(); await cloudSave(true); });
  const s2027 = cloud.store.get('testteacher:1234:2027');
  assert.ok(s2027 && /Noah/.test(s2027) && !/Ruby-Lee/.test(s2027));
  assert.strictEqual(cloud.store.get('testteacher:1234'), s2026, 'the 2026 cloud copy is not touched');
  assert.ok(cloud.years.includes('2027') && cloud.years.includes('2026'));
  await ctx.close();
});
