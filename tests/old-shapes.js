// Made-up students saved the way older versions of the app saved them. Each one is a different way a comment's words
// can be stored (see claude/comment-storage-audit-and-design.md). No real names or comments.
// buildOldShapes(page) builds them inside the app, with the app's own functions where a teacher's click does it,
// and by setting the stored fields directly where an older version left them that way.
const SHAPES = [
  ['Alex',   'he',   'built only: sentences ticked, nothing typed'],
  ['Bree',   'she',  'typed in the Build box (draftOverride)'],
  ['Cam',    'he',   'Done pressed in Build, then a sentence ticked after'],
  ['Dana',   'she',  'a Review edit that differs from the built comment'],
  ['Eli',    'he',   'a stale Review copy (its future-direction hash no longer matches)'],
  ['Faye',   'she',  'three stores disagree: typed text, Done text and Review copy'],
  ['Gus',    'he',   'English typed over, with future directions'],
  ['Hana',   'she',  'Maths typed over and a Review edit'],
  ['Ivy',    'she',  'both semesters hold a different comment'],
  ['Jack',   'he',   'typed text glued by the old hidden-box bug'],
  ['Kim',    'she',  'paragraphs split and joined by hand'],
  ['Leo',    'they', 'they/them, typed text and a Review edit'],
];

async function buildOldShapes(page) {
  await page.evaluate(async shapes => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    students = shapes.map((k, i) => _normStudent({ name: k[0], pronoun: k[1], year: '5' }, i));
    currentIdx = 0; totalStudents = students.length; _ensureUids();
    loadCur(); render();
    const gcats = ['Personality', 'Effort & Work Habits', 'Social Skills', 'Independence', 'Closing Statement'];
    const tickGeneral = i => { switchStu(i); setSubject('general'); gcats.forEach((c, j) => { const a = RAW[c].filter(x => typeof PSC_LEVEL === 'undefined' || !PSC_LEVEL[x]); toggleOpt(c, a[(i * 2 + j) % a.length]); }); };
    const tickSubject = (i, subj) => {
      switchStu(i); setSubject(subj); const bank = getBank();
      Object.keys(bank).filter(c => c !== 'Below Expectations').slice(0, 4).forEach((c, j) => { const g = bank[c]; const arr = g.C || g[Object.keys(g)[0]]; toggleSubjOpt(c, arr[(i + j) % arr.length]); });
      const fd = subj === 'english' ? ENGLISH_FD : MATHS_FD, strands = Object.keys(fd);
      toggleFD(fd[strands[i % strands.length]]['Stage 3'][0]);
    };
    const review = async (i, subj) => { switchStu(i); setSubject(subj); setView('publish'); await wait(30); };
    const reviewEdit = async (i, subj, add) => {
      await review(i, subj);
      const span = document.querySelectorAll('#pubContent span[data-pi][data-si]')[1];
      const t = span.textContent.replace(/\s+$/, ''); span.textContent = t.replace(/([.!?])$/, ' ' + add + '$1');   // the app's own Review tools leave no trailing space
      _afterReviewEdit(); await wait(30);
    };
    for (let i = 0; i < shapes.length; i++) { tickGeneral(i); tickSubject(i, 'english'); tickSubject(i, 'maths'); }
    const at = n => students.findIndex(s => s.name === n);
    setView('build');

    // Bree: typed in the Build box
    { const i = at('Bree'); switchStu(i); setSubject('general'); const s = students[i]; s.draftOverride = getBuiltCommentText(s, 'general') + ' Bree typed this extra sentence herself.'; }
    // Cam: Done pressed in Build, then one more sentence ticked
    { const i = at('Cam'); switchStu(i); setSubject('general'); const s = students[i];
      s.custom['__edited__'] = [getBuiltCommentText(s, 'general').replace('.', ' with real pride.')]; s.editedCat = gcats[0]; s.orderedAtDone = s.ordered.slice(); s.orderedAfterEdit = [];
      const a = RAW['Independence'].filter(x => typeof PSC_LEVEL === 'undefined' || !PSC_LEVEL[x]); toggleOpt('Independence', a[(5) % a.length]); }
    // Faye: three stores that disagree (the shape of a comment edited in Review after typing in Build)
    { const i = at('Faye'); switchStu(i); setSubject('general'); const s = students[i]; const b = getBuiltCommentText(s, 'general');
      s.custom['__edited__'] = [b + ' Done text.']; s.editedCat = gcats[0]; s.orderedAtDone = s.ordered.slice(); s.orderedAfterEdit = []; }
    // Gus: English typed over
    { const i = at('Gus'); switchStu(i); setSubject('english'); const s = students[i]; s.engDraft = stripFDLines(getBuiltCommentText(s, 'english')).replace('.', ' and takes real care.'); s.engDraftEdited = true; }
    // Jack: glued paragraphs
    { const i = at('Jack'); switchStu(i); setSubject('general'); const s = students[i]; const b = getBuiltCommentText(s, 'general'); const ps = b.split(/\n\n/); s.draftOverride = ps.length > 1 ? ps[0] + ps.slice(1).join(' ') : b.replace(/\.\s+(?=[A-Z])/, '.'); }
    autoSave(); await wait(100);

    // Review visits and edits (these write the Review copy)
    for (let i = 0; i < shapes.length; i++) for (const subj of ['general', 'english', 'maths']) await review(i, subj);
    // Since v3.17.23 a Review edit writes the one store (draftOverride). These fixtures stand for data saved by OLDER versions, so the
    // General Review edit is rewritten here the way those versions saved it: the words in the Done text, the typed text empty.
    const asOlderVersion = n => { const s = students[at(n)]; s.custom = s.custom || {}; s.custom['__edited__'] = [s.draftOverride]; s.editedCat = gcats[0]; s.orderedAtDone = s.ordered.slice(); s.orderedAfterEdit = []; s.draftOverride = null; };
    await reviewEdit(at('Dana'), 'general', 'really'); asOlderVersion('Dana');
    await reviewEdit(at('Hana'), 'maths', 'really');
    await reviewEdit(at('Leo'), 'general', 'really'); asOlderVersion('Leo');
    await reviewEdit(at('Faye'), 'general', 'again'); asOlderVersion('Faye');
    // Eli: the Review copy goes stale
    { const s = students[at('Eli')]; s.pubEditGeneral = (s.pubEditGeneral || '').replace(/<span /, '<span data-old="1" '); s.pubEditGeneral_fdHash = 'general|["not what it was"]'; }
    // Kim: split and join paragraphs by hand
    { const i = at('Kim'); await review(i, 'general'); const sp = document.querySelectorAll('#pubContent span[data-pi][data-si]')[2]; if (sp) { try { paraSplitOrJoin(sp); } catch (e) {} } await wait(30); }
    // Ivy: a different comment in each semester
    { const i = at('Ivy'); switchStu(i); setSubject('general'); setView('build'); const s = students[i];
      s.draftOverride = getBuiltCommentText(s, 'general') + ' Semester one note.'; setSemester(2); const s2 = students[i];
      s2.draftOverride = 'Ivy had a good semester two. She worked hard.'; s2.ordered = []; s2.selected = {}; render(); await wait(30); setSemester(1); }
    // Faye (last, so moving between students does not tidy it): the typed text still holds the old words after a Review change.
    // This is the shape a real class was found in on 15 Nov 2026 (typed text with the old wording, newer wording in the Done text).
    { const s = students[at('Faye')]; s.draftOverride = String(s.draftOverride || '').replace(' again', '') + ' Typed in Build.'; }
    setView('build'); switchStu(0); setSubject('general'); autoSave(); await wait(150);
  }, SHAPES);
}

// The finished text of every comment in the class, in both semesters.
async function finals(page) {
  return page.evaluate(() => {
    const out = {}; const grab = sem => students.forEach(s => ['general', 'english', 'maths'].forEach(k => { out['S' + sem + '|' + s.name + '|' + k] = getFinalCommentText(s, k); }));
    const was = currentSemester; setSemester(1); grab(1); setSemester(2); grab(2); setSemester(was); return out;
  });
}

module.exports = { SHAPES, buildOldShapes, finals };
