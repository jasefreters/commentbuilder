// v3.17.43: bank changes from Semester 2 report feedback (eight English and Maths sentences, one Maths future direction,
// the one-carnival Zone sentence) and a Final check flag for "enquiring mind" + "growth mindset".
const { test, after } = require('node:test');
const assert = require('node:assert');
const { openApp, closeBrowser } = require('./helpers');

after(closeBrowser);

const OLD = ['understands simple inferences and explains how authors use evidence to support ideas.', 'draw on other texts to add meaning',
  'applies some spelling patterns', 'in line with Year [Y] outcomes', 'is achieving at a Year [Y] level', 'writes one amount',
  'duration of events in minutes', 'each symbol or bar stands for more than one', 'Applying known strategies'];

test('old wording is gone from the banks; old picks still show as picked and stay tagged', async () => {
  const page = await openApp();
  const r = await page.evaluate(old => {
    const all = JSON.stringify([ENGLISH_BANK, MATHS_BANK, ENGLISH_FD, MATHS_FD]);
    const left = old.filter(x => all.includes(x));
    const pairs = [
      ['{{S}} writes one amount as a fraction, decimal or percentage of another.', '{{S}} writes a given amount as a fraction, decimal or percentage of another.'],
      ['{{S}} measures and compares the duration of events in minutes.', '{{S}} calculates the length of time an event takes in minutes.'],
      ['{{S}} identifies main ideas, understands simple inferences and explains how authors use evidence to support ideas.', '{{S}} identifies main ideas and explains how authors use evidence to support ideas.'],
      // two steps: many-to-one scales -> each symbol or bar stands for more than one -> picture and column graphs
      ['{{S}} constructs and interprets data displays using many-to-one scales.', '{{S}} can construct and interpret picture and column graphs that use a scale, where each symbol represents a group of items, such as 2 or 5.'],
    ];
    const linked = pairs.filter(([o, n]) => !(subjHas([o], n) && !subjHas([n], o))).map(p => p[1]);
    const fd = fdHas(['Applying known strategies to solve addition and subtraction problems.'], 'Applying the most efficient strategies to solve addition and subtraction problems.');
    const tagged = !!_skTag('Data', pairs[3][1]) && SENT_TAG[pairs[1][1]] === 'S2A';
    return { left, linked, fd, tagged };
  }, OLD);
  assert.deepStrictEqual(r.left, []);
  assert.deepStrictEqual(r.linked, []);
  assert.ok(r.fd, 'future direction linked');
  assert.ok(r.tagged, 'new wording keeps its tags');
  await page.context().close();
});

test('one Zone carnival reads "at Zone Athletics"; two keep "the zone ... carnivals"', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const f = sportTplFind('zc1');
    _tplPick.zc1 = ['athletics', '']; const one = sportTplFill(f.g, f.t);
    _tplPick.zc1 = ['athletics', 'swimming']; const two = sportTplFill(f.g, f.t);
    return { one, two };
  });
  assert.strictEqual(r.one, '{{N}} represented the school at Zone Athletics, showing commitment and school pride.');
  assert.strictEqual(r.two, '{{N}} represented the school at the zone athletics and swimming carnivals, showing school pride.');
  await page.context().close();
});

test('Final check flags "enquiring mind" with "growth mindset" in General only', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const t = 'Hunter is an enthusiastic and curious student whose enquiring mind results in active classroom participation. He displays a growth mindset, showing determination when facing challenging tasks or learning new concepts.';
    return { both: fcOverlaps('general', t), one: fcOverlaps('general', t.split('. ')[0] + '.'), eng: fcOverlaps('english', t) };
  });
  assert.strictEqual(r.both.length, 1);
  assert.ok(/growth mindset/.test(r.both[0].sentence) && r.both[0].fixed === null);
  assert.strictEqual(r.one.length, 0);
  assert.strictEqual(r.eng.length, 0);
  await page.context().close();
});
