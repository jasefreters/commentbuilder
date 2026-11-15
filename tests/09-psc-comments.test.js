// Personal and Social Capability comments, two new categories, report order (v3.17.28).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeBrowser } = require('./helpers');
after(closeBrowser);

test('the General tabs and the report paragraph use the same order', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => ({ tabs: CATS.slice(0, 10), para: PARA_GROUPS[0] }));
  const order = ['Personality', 'Emotional Wellbeing', 'Effort & Work Habits', 'Reflection & Goal Setting', 'Communication & Collaboration', 'Social Skills', 'Independence', 'Leadership', 'Roles & Responsibilities', 'Attendance'];
  assert.deepEqual(r.tabs, order);
  assert.deepEqual(r.para, order);
  await page.context().close();
});

test('148 new comments are in the bank, each with a level, in the right tier', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const out = { n: 0, noLevel: [], badTier: [], dup: 0, wrongHeads: [] };
    const seen = new Set();
    CATS.forEach(c => RAW[c].forEach(sn => { if (seen.has(sn)) out.dup++; seen.add(sn); }));
    Object.keys(PSC_LEVEL).forEach(sn => {
      out.n++;
      const cat = SENT_CAT[sn];
      if (!cat) { out.noLevel.push(sn); return; }
      if (!/^\{\{[NS]\}\}/.test(sn)) out.wrongHeads.push(sn);
      const reworded = Object.values(SENTENCE_REWORDS).includes(sn);   // v3.17.30: "beginning to" removed, still developing-tier
      const developing = reworded || /^\{\{[NS]\}\} is (beginning|learning|developing|building)\b|^\{\{N\}\} contributes to group tasks and is encouraged/.test(sn) || /benefits from|is beginning to|is learning|is developing|is building/.test(sn);
      const t = _tierOfRaw(cat, sn);
      if (developing && t !== 'developing') out.badTier.push(sn);
      if (!developing && t === 'developing') out.badTier.push(sn);
    });
    return out;
  });
  assert.equal(r.n, 148); assert.equal(r.dup, 0);
  assert.deepEqual(r.noLevel, []); assert.deepEqual(r.wrongHeads, []);
  assert.deepEqual(r.badTier, []);
  await page.context().close();
});

test('the moved emotional-regulation line is in Emotional Wellbeing and still counts as picked for older comments', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const line = RAW['Emotional Wellbeing'].find(x => /emotional regulation/.test(x));
    const before = SENT_CAT[line];
    // a comment saved by an older version holds it under Social Skills
    cur().selected = { 'Social Skills': [line] }; cur().ordered = [line];
    setSubject('general'); currentTab = 'Emotional Wellbeing';
    return { line: !!line, before, picked: genCatPicks(cur().selected, 'Emotional Wellbeing').includes(line), socialHas: genCatPicks(cur().selected, 'Social Skills').includes(line), inSocialBank: RAW['Social Skills'].includes(line) };
  });
  assert.ok(r.line); assert.equal(r.before, 'Emotional Wellbeing');
  assert.ok(r.picked); assert.ok(!r.socialHas); assert.ok(!r.inSocialBank);
  await page.context().close();
});

test('a picked new comment reads with the student name and pronouns', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const sn = RAW['Reflection & Goal Setting'].find(x => /reflects on what \{\{s\}\} has learnt about \{\{r\}\}/.test(x));
    cur().name = 'Sam'; cur().pronoun = 'she';
    toggleOpt('Reflection & Goal Setting', sn);
    return getFinalCommentText(cur());
  });
  assert.match(r, /Sam reflects on what she has learnt about herself/);
  await page.context().close();
});

test('the level tag shows on a new comment in the Build list and not on an old one', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    setSubject('general'); currentTab = 'Emotional Wellbeing'; render();
    const tags = [...document.querySelectorAll('.psc-tag')].map(x => x.textContent);
    currentTab = 'Attendance'; render();
    return { tags, attendance: document.querySelectorAll('.psc-tag').length };
  });
  assert.ok(r.tags.length >= 20);
  assert.ok(r.tags.includes('Level 1a · Early Kindergarten') && r.tags.includes('Level 4 · End of Year 6'));
  assert.equal(r.attendance, 0);
  await page.context().close();
});
