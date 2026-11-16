// Top bar (v3.17.38)
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, seedClass, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

test('Class board is its own button outside the Build and Review group, and opens the board', async () => {
  const page = await openApp(); await seedClass(page);
  assert.strictEqual(await page.$('.view-toggle #vStats'), null);
  assert.ok(await page.$('.hdr-right #vStats'));
  await page.click('#vStats'); await settle(page, 200);
  assert.strictEqual(await page.evaluate(() => currentView), 'stats');
  assert.ok(await page.$eval('#vStats', e => e.classList.contains('active')));
  await page.context().close();
});

test('clicking the progress count opens the Class board, and it names the subject', async () => {
  const page = await ready();
  async function ready() { const p = await openApp(); await seedClass(p); return p; }
  await page.evaluate(() => { setSubject('maths'); updateProgress(); });
  const t = await page.textContent('#progressLabel');
  assert.match(t, /^\d+ of \d+ Maths done$/);
  await page.click('#progressWrap'); await settle(page, 200);
  assert.strictEqual(await page.evaluate(() => currentView), 'stats');
  await page.context().close();
});

test('the semester menu switches semester and shows the current one', async () => {
  const page = await openApp(); await seedClass(page);
  await page.selectOption('#semSel', '2'); await settle(page, 300);
  assert.strictEqual(await page.evaluate(() => currentSemester), 2);
  assert.strictEqual(await page.$eval('#semSel', e => e.value), '2');
  await page.selectOption('#semSel', '1'); await settle(page, 300);
  assert.strictEqual(await page.evaluate(() => currentSemester), 1);
  await page.context().close();
});

test('ADMIN is no longer in the top bar; it is in Settings, and the save word shows on a medium window', async () => {
  const page = await openApp();
  assert.strictEqual(await page.$('header #adminBtn'), null);
  assert.ok(await page.$('#settingsPanel #adminBtn'));
  await page.setViewportSize({ width: 1100, height: 800 });
  assert.ok(await page.isVisible('#saveLabel'));
  await page.context().close();
});
