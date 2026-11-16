// Exports the NSW bank (sentences, tabs, stage tags, skill tags) to tools/curric/nsw.json. Read-only: opens the app in a hidden browser.
const fs = require('fs'), path = require('path');
const { openApp, closeBrowser } = require('../../tests/helpers');
(async () => {
  const page = await openApp();
  const d = await page.evaluate(() => {
    const flat = (bank, subj) => { const rows = []; Object.keys(bank).forEach(tab => { const v = bank[tab]; (Array.isArray(v) ? v : Object.values(v).flat()).forEach(t => rows.push({ subject: subj, tab, text: t, tag: SENT_TAG[t] || null, skill: (typeof SKILL_TAGS !== 'undefined' && SKILL_TAGS[t]) || null })); }); return rows; };
    return { english: flat(ENGLISH_BANK, 'english'), maths: flat(MATHS_BANK, 'maths'), englishCats: ENGLISH_CATS, mathsCats: MATHS_CATS, yearRules: YEAR_RULES };
  });
  await closeBrowser();
  const sentences = d.english.concat(d.maths);
  const dup = sentences.length - new Set(sentences.map(s => s.subject + '|' + s.text)).size;
  fs.writeFileSync(path.join(__dirname, 'nsw.json'), JSON.stringify({ sentences, englishCats: d.englishCats, mathsCats: d.mathsCats, yearRules: d.yearRules }, null, 1));
  const byTab = {}; sentences.forEach(s => { const k = s.subject + ' / ' + s.tab; byTab[k] = (byTab[k] || 0) + 1; });
  console.log('english', d.english.length, 'maths', d.maths.length, 'duplicates', dup, 'untagged', sentences.filter(s => !s.tag).length);
  console.log(byTab);
})();
