// The app and the demo fit the window from tablet to desktop widths: no sideways scrolling (v3.19.1).
// The school year menu (v3.18.0) had pushed the app's header wider than tablets; the demo's extra buttons did the same at 1280 px.
const { test, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { browser, closeBrowser } = require('./helpers');

after(closeBrowser);
const WIDTHS = [701, 768, 820, 1024, 1180, 1280, 1366, 1440];

for (const file of ['report-comment-builder.html', 'demo.html']) {
  test(file + ' has no sideways scroll at tablet and desktop widths', async () => {
    const ctx = await (await browser()).newContext();
    await ctx.route(/^https?:\/\//, r => r.abort());
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(__dirname, '..', file));
    await page.waitForTimeout(800);
    const over = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(80);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) over.push(w + ' px wide scrolls to ' + sw);
    }
    assert.deepStrictEqual(over, []);
    await ctx.close();
  });
}
