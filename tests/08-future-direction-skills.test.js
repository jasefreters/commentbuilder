// Future directions that repeat a skill the comment already praises (v3.17.26).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { openApp, settle, closeBrowser } = require('./helpers');
after(closeBrowser);

const RC = 'Reading Comprehension';
const MONITOR = '{{S}} monitors {{pos}} understanding and recognises when meaning breaks down.';             // monitoring-meaning, Stage 3
const MONITOR_S2 = '{{S}} uses strategies to fix {{pos}} understanding when meaning breaks down.';              // monitoring-meaning, Stage 2
const FD_MONITOR_S3 = 'Identifying where meaning breaks down when reading.';                                      // monitoring-meaning, Stage 3
const FD_MONITOR_S1 = 'Recognising when meaning is interrupted during reading.';                                  // monitoring-meaning, Stage 1
const FD_EVIDENCE_S3 = 'Using evidence from a text to support reading comprehension.';                           // evidence-and-inference, Stage 3
const LANG_S2 = '{{S}} can interpret language features, explain how authors use evidence to support ideas and understands simple inferences when reading moderately complex texts.';   // language-features, Stage 2
const LANG_BEGINNING = '{{S}} is beginning to explain how language features, such as word choices and text clues, contribute to meaning.';   // language-features, Stage 2, "beginning"
const FD_LANG_S2 = 'Linking the meanings of key words across a text to help make connections.';                  // language-features, Stage 2

async function student(page, ticks = []) {
  await page.evaluate(([rc, ticks]) => {
    setSubject('english');
    cur().engGrades = { 'Reading Comprehension': ['E'], 'Creating Written Texts': ['E'] };   // the two neediest strands
    ticks.forEach(t => toggleSubjOpt(rc, t));
    cur().fdStage = 'Stage 3';
  }, [RC, ticks]);
}
const suggest = page => page.evaluate(() => { const s = autoSuggestFD(); return { texts: s.map(x => x.text), strands: s.map(x => x.strand), skipped: s.skipped.map(x => x.text) }; });

test('the tag data in the app is the data in tools/skill-tags/tags.json', () => {
  execFileSync('node', ['tools/skill-tags/build-data.js', '--check'], { cwd: require('path').join(__dirname, '..'), stdio: 'pipe' });
});

test('every future direction and every skill sentence in the tagged groups has a tag in the app', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    let fd = 0, fdTagged = 0, se = 0, seTagged = 0;
    [['english', ENGLISH_FD, ENGLISH_BANK], ['maths', MATHS_FD, MATHS_BANK]].forEach(([subj, F, B]) => {
      Object.keys(F).forEach(st => Object.keys(F[st]).forEach(sg => F[st][sg].forEach(t => { fd++; if (_skTag(st, t)) fdTagged++; })));
      Object.keys(FD_SECTION_STRAND[subj]).forEach(cat => Object.keys(B[cat]).forEach(k => B[cat][k].forEach(t => { se++; if (_skTag(FD_SECTION_STRAND[subj][cat], t)) seTagged++; })));
    });
    return { fd, fdTagged, se, seTagged };
  });
  assert.equal(r.fd, 356); assert.equal(r.fdTagged, 356);
  assert.equal(r.se, 447); assert.equal(r.seTagged, 447);
  await page.context().close();
});

test('with nothing ticked, auto-suggest picks what it always did and skips nothing', async () => {
  const page = await openApp(); await student(page);
  const r = await suggest(page);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.texts.length, 2);
  assert.equal(r.texts[0], await page.evaluate(() => ENGLISH_FD['Reading Comprehension']['Stage 3'][0]));
  assert.equal(r.texts[0], FD_MONITOR_S3);
  await page.context().close();
});

test('auto-suggest skips a future direction that repeats a ticked sentence, and says so', async () => {
  const page = await openApp(); await student(page, [MONITOR]);
  const r = await suggest(page);
  assert.ok(!r.texts.includes(FD_MONITOR_S3), 'the repeated future direction is not suggested');
  assert.deepEqual(r.skipped, [FD_MONITOR_S3]);
  assert.equal(r.texts[0], FD_EVIDENCE_S3, 'the next one in the same strand is suggested instead');
  await page.evaluate(() => { currentTab = 'Future Directions'; renderOpts(); });
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(text.includes('Skipped “' + FD_MONITOR_S3 + '”: it repeats a skill the comment already praises.'));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

const repeats = (page, stage, fd) => page.evaluate(([st, f, rc]) => { const r = fdRepeats(rc, st, f); return r ? r.text : null; }, [stage, fd, RC]);

test('a sentence at a lower stage is a next step, not a repeat; one at the same or a higher stage is a repeat', async () => {
  const lower = await openApp(); await student(lower, [MONITOR_S2]);
  assert.equal(await repeats(lower, 'Stage 3', FD_MONITOR_S3), null, 'Stage 2 sentence, Stage 3 future direction: allowed');
  assert.equal(await repeats(lower, 'Stage 2', FD_MONITOR_S3), MONITOR_S2, 'same stage: repeat');
  await lower.context().close();
  const higher = await openApp(); await student(higher, [MONITOR]);
  assert.equal(await repeats(higher, 'Stage 1', FD_MONITOR_S1), MONITOR, 'Stage 3 sentence, Stage 1 future direction: repeat');
  await higher.context().close();
});

test('a sentence that says the student needs support does not count as praise', async () => {
  const page = await openApp(); await student(page, [LANG_BEGINNING]);
  assert.equal(await repeats(page, 'Stage 2', FD_LANG_S2), null);
  await page.evaluate(([rc, s]) => toggleSubjOpt(rc, s), [RC, LANG_S2]);
  assert.equal(await repeats(page, 'Stage 2', FD_LANG_S2), LANG_S2, 'the same skill with no support wording is a repeat');
  await page.context().close();
});

test('a sentence is only compared with future directions in its own group', async () => {
  const page = await openApp(); await student(page, [MONITOR]);
  const other = await page.evaluate(() => { const f = ENGLISH_FD['Creating Written Texts']['Stage 3']; return f.map(t => fdRepeats('Creating Written Texts', 'Stage 3', t)).filter(Boolean).length; });
  assert.equal(other, 0);
  await page.context().close();
});

test('the by-hand list shows a note under a repeat, and the teacher can still pick it', async () => {
  const page = await openApp(); await student(page, [MONITOR]);
  await page.evaluate(() => { currentTab = 'Future Directions'; renderOpts(); });
  const notes = await page.evaluate(() => [...document.querySelectorAll('.fd-repeat-note')].map(n => n.previousElementSibling.textContent + ' => ' + n.textContent));
  assert.ok(notes.some(n => n.startsWith(FD_MONITOR_S3 + ' => Repeats a skill the comment already praises.')), 'note under the repeated future direction');
  await page.evaluate(t => toggleFD(t), FD_MONITOR_S3);
  assert.deepEqual(await page.evaluate(() => cur().engFD), [FD_MONITOR_S3], 'still allowed by hand');
  await page.evaluate(() => { currentTab = 'Future Directions'; renderOpts(); });
  const sel = await page.evaluate(() => [...document.querySelectorAll('.fd-repeat-note')].map(n => n.textContent).filter(t => t.includes('You may want a different one')).length);
  assert.equal(sel, 1, 'a picked one that repeats is marked');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('items the teacher added (no tag) are compared by their words: at least two, and at least half', async () => {
  const page = await openApp(); await student(page, [MONITOR]);
  const r = await page.evaluate(([rc, s]) => {
    const praised = _skPraised(cur(), 'english');
    return {
      customFD: !!_skClash(praised, rc, 'Stage 3', 'Identifying where meaning breaks down when reading carefully.'),
      unrelatedFD: !!_skClash(praised, rc, 'Stage 3', 'Writing letters of the alphabet with correct formation.'),
      oneWord: !!_skClash(praised, rc, 'Stage 3', 'Understanding poems and rhymes.'),
      customSentence: !!_skClash({ [rc]: [{ text: 'Sam stops and rereads when a sentence does not make sense.', tag: null, rank: 99, support: false }] }, rc, 'Stage 3', 'Rereading when a sentence does not make sense.'),
    };
  }, [RC]);
  assert.deepEqual(r, { customFD: true, unrelatedFD: false, oneWord: false, customSentence: true });
  await page.context().close();
});

test('an older wording of a ticked sentence still counts as ticked', async () => {
  const page = await openApp(); await student(page, []);
  const r = await page.evaluate(() => {
    // a sentence that was reworded: SUBJ_ALIASES maps the new wording (in the bank) to the old wording a student may have ticked
    const cat = 'Creating Written Texts', pair = Object.keys(SUBJ_ALIASES).map(n => [n, SUBJ_ALIASES[n]]).find(([n]) => Object.values(ENGLISH_BANK[cat]).some(l => l.includes(n)));
    if (!pair) return { skipped: true };
    setSubject('english'); cur().engSelected = { [cat]: [pair[1]] };
    const praised = (_skPraised(cur(), 'english')[cat] || []);
    return { n: praised.length, tagged: praised.filter(x => x.tag).length, text: praised[0] && praised[0].text === pair[0] };
  });
  assert.ok(r.skipped || (r.n === 1 && r.tagged === 1 && r.text === true), JSON.stringify(r));
  await page.context().close();
});

test('auto-suggest finds the grade of every strand, whatever the bank section is called (v3.17.27)', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    setSubject('english');
    // Spelling & Grammar is E and Handwriting is A; the others are left at C, so Spelling is the neediest
    cur().engGrades = { 'Spelling & Grammar': ['E'], 'Handwriting & Digital Transcription': ['A'], 'Oral Language & Communication': ['D', 'B'] };
    cur().fdStage = 'Stage 3';
    const first = autoSuggestFD().map(x => x.strand);
    setSubject('maths');
    cur().mathGrades = { 'Represents Numbers': ['E'] };
    cur().fdStage = 'Stage 3';
    return { english: first, maths: autoSuggestFD().map(x => x.strand) };
  });
  assert.equal(r.english[0], 'Spelling');                          // E, found through "Spelling & Grammar"
  assert.equal(r.english[1], 'Oral Language and Communication');   // lowest of D and B is D, below the C strands
  assert.equal(r.maths[0], 'Representing Whole Numbers');          // E, found through "Represents Numbers"
  await page.context().close();
});

test('the done count total follows the class when a student is added or deleted (v3.17.27)', async () => {
  const page = await openApp();
  const r = await page.evaluate(() => {
    const t = () => document.getElementById('classTotal').textContent;
    updateProgress();
    const n0 = students.length, a = t();
    _addStuNow(5); const b = t();
    window.confirm = () => true; removeStu(students.length - 1); const c = t();
    return { n0, a, b, c, n1: students.length };
  });
  assert.equal(r.a, String(r.n0)); assert.equal(r.b, String(r.n0 + 1)); assert.equal(r.c, String(r.n0)); assert.equal(r.n1, r.n0);
  await page.context().close();
});

test('there is no limit on future directions: a third can be picked by hand', async () => {
  const page = await openApp(); await student(page, [MONITOR]);
  const n = await page.evaluate(() => { currentTab = 'Future Directions'; renderOpts(); setCurFD([]); const all = Object.values(ENGLISH_FD).flatMap(st => st['Stage 3']).slice(0, 4); all.forEach(t => toggleFD(t)); return { n: getCurFD().length, locked: document.querySelectorAll('.opts-locked').length }; });
  assert.strictEqual(n.n, 4); assert.strictEqual(n.locked, 0);
  await page.context().close();
});
