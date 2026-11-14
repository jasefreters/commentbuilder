// Two devices signed in to the same account, sharing a pretend cloud. And History.
// The rule is the same: a change on one device or a restore for one student must not overwrite anything else.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, seedClass, snapshot, settle, openReview, changeInReview, changedKeys, fakeCloud, closeBrowser } = require('./helpers');
after(closeBrowser);

const signIn = page => page.evaluate(() => { setCloudUser('tester'); setCloudPin('abcd12'); });
const save = page => page.evaluate(() => cloudSave(true));
// What a second device does when it opens the app already signed in: read the cloud copy.
async function openSignedIn(cloud) {
  const page = await openApp({ cloud });
  await signIn(page);
  await page.evaluate(() => cloudLoad(false, false));
  await settle(page, 500);
  return page;
}
async function edit(page, name, subj, mark) {
  await openReview(page, name, subj);
  await changeInReview(page, 0, ' ' + mark);
  await page.evaluate(() => { switchStu(0); setView('build'); });
  await settle(page);
}

async function twoDevices() {
  const cloud = fakeCloud();
  const a = await openApp({ cloud }); await seedClass(a); await signIn(a); await save(a); await settle(a, 400);
  assert.equal(cloud.store.size, 1, 'device A saved the class to the cloud');
  const b = await openSignedIn(cloud);
  return { cloud, a, b };
}

test('a second device gets the same class from the cloud', async () => {
  const { a, b } = await twoDevices();
  assert.deepEqual(changedKeys(await snapshot(a), await snapshot(b)), []);
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.context().close(); await b.context().close();
});

test('two devices change different students: both changes are kept, nothing else moves', async () => {
  const { a, b } = await twoDevices();
  const before = await snapshot(a);
  await edit(a, 'Sam', 'english', 'FromA');
  await edit(b, 'Mia', 'maths', 'FromB');
  await save(a); await settle(a, 300);
  await save(b); await settle(b, 300);   // B folds in A's change before it saves
  await save(a); await settle(a, 300);   // A folds in B's
  const sa = await snapshot(a), sb = await snapshot(b);
  assert.deepEqual(changedKeys(sa, sb), [], 'both devices now show the same class');
  assert.deepEqual(changedKeys(before, sa), ['Mia|maths', 'Sam|english']);
  assert.ok(sa['Sam|english'].includes('FromA') && sa['Mia|maths'].includes('FromB'));
  await a.context().close(); await b.context().close();
});

test('two devices change the same student: nothing is thrown away without a trace', async () => {
  // The app merges student by student. When both devices changed one student it keeps this device's version
  // and puts the other device's version aside for the teacher to look at.
  const { a, b } = await twoDevices();
  await edit(a, 'Ava', 'general', 'FromA');
  await edit(b, 'Ava', 'maths', 'FromB');
  await save(a); await settle(a, 300);
  await save(b); await settle(b, 300);
  const sb = await snapshot(b);
  assert.ok(sb['Ava|maths'].includes('FromB'), 'device B keeps what it changed');
  const aside = await b.evaluate(() => JSON.stringify(lsGet('rcb_conflict_copies', null)) + JSON.stringify(_conflicts));
  assert.ok(aside.includes('FromA'), 'device A\'s version is put aside, not lost');
  await a.context().close(); await b.context().close();
});

test('a device that only looks never overwrites another device\'s change', async () => {
  const { a, b } = await twoDevices();
  await edit(a, 'Tom', 'general', 'FromA');
  await save(a); await settle(a, 300);
  // B has made no changes. It browses, then saves.
  await page_tour(b);
  await save(b); await settle(b, 300);
  await save(a); await settle(a, 300);
  const sa = await snapshot(a), sb = await snapshot(b);
  assert.ok(sa['Tom|general'].includes('FromA'), 'A still has its change');
  assert.ok(sb['Tom|general'].includes('FromA'), 'B received it');
  await a.context().close(); await b.context().close();
});
async function page_tour(page) {
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < students.length; i++) { switchStu(i); for (const s of ['general', 'english', 'maths']) { setSubject(s); setView('publish'); await wait(30); setView('build'); } }
    switchStu(0); setSubject('general');
  });
  await settle(page);
}

test('the first sync after updating from an older version of the app still merges', async () => {
  const { a, b } = await twoDevices();
  // Device B's record of the last sync is in the older form (no version mark, older fingerprints).
  await b.evaluate(() => {
    const st = {}; students.forEach(s => { st[s.uid] = _hsLegacy(s); });
    const old = Object.assign({}, _syncBase, { st }); delete old.v;
    _setSyncBase(old);
  });
  await edit(a, 'Sam', 'english', 'FromA');
  await save(a); await settle(a, 300);
  await save(b); await settle(b, 300);
  assert.ok((await snapshot(b))['Sam|english'].includes('FromA'), 'device B received the change');
  assert.equal(await b.evaluate(() => _syncBase.v), 2, 'and now keeps its record in the new form');
  await a.context().close(); await b.context().close();
});

test('a save that fails (no internet) loses nothing, and goes through later', async () => {
  const { cloud, a, b } = await twoDevices();
  cloud.offline = true;
  await edit(a, 'Jordan', 'english', 'Offline');
  await save(a); await settle(a, 300);
  const local = await snapshot(a);
  assert.ok(local['Jordan|english'].includes('Offline'), 'the change is still on the device');
  cloud.offline = false;
  await save(a); await settle(a, 300);
  await b.evaluate(() => cloudSave(true)); await settle(b, 300);
  assert.ok((await snapshot(b))['Jordan|english'].includes('Offline'), 'the other device gets it once the internet is back');
  await a.context().close(); await b.context().close();
});

test('restoring one student from History leaves every other student alone', async () => {
  const page = await openApp(); await seedClass(page);
  await page.evaluate(() => snapshotAll('Test point'));
  const original = await snapshot(page);
  await edit(page, 'Ava', 'english', 'Later');
  await edit(page, 'Tom', 'maths', 'Later');
  const edited = await snapshot(page);
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    const i = students.findIndex(s => s.name === 'Ava');
    const h = _hist[students[i].uid].find(x => x.why === 'Test point');
    restoreHistory(i, h.at);
  });
  await settle(page);
  const after = await snapshot(page);
  assert.equal(after['Ava|english'], original['Ava|english'], 'Ava is back to the earlier version');
  assert.deepEqual(changedKeys(edited, after), ['Ava|english'], 'only Ava changed; Tom keeps his later edit');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
