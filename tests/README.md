# Safety-net tests

These tests open the real app in a hidden browser, build a made-up class of six students, and check that the app
keeps every comment where it belongs. Nothing is sent anywhere: web requests are blocked, and the cloud is a pretend one.

The main rule they protect: **a change to one comment changes that comment and nothing else.**

- `01-fixture` checks the made-up class builds and each comment names only its own student.
- `02-overwrite` makes one change at a time (in Review, in Build, a future direction, Done, a semester switch,
  closing and reopening) and then looks at all 18 comments to confirm only the expected one changed.
- `03-sync-history` runs two pretend devices on one account, and History restore.
- `05-old-data` builds twelve made-up students stored the ways older versions stored a comment (typed text, Done text,
  Review copies, disagreeing copies, English and Maths typed over, two semesters, glued text, paragraph layout), then checks
  every finished comment reads the same after loading, saving, looking in Review and switching semester. The finished text
  is also kept in `golden/old-shapes-finals.json`; if a change to the wording logic is meant, rebuild it with `UPDATE_GOLDEN=1 npm test`.
  Three tests there are marked as known problems; they are the bugs the "one source of truth" work fixes.
  Your own class can be checked on your own computer only (nothing from it is saved in the repo):
  `RCB_REAL_BACKUP=backup.json RCB_REAL_BEFORE=before.json npm test`, where `before.json` is the finished text recorded from the old version.
- `08-future-direction-skills` checks future directions that repeat a skill the comment already praises: the tag data in the app
  matches `tools/skill-tags/tags.json`, auto-suggest skips a repeat and says so, a lower stage is a next step, "needs support"
  wording does not count, the by-hand list shows a note but still allows the pick, and items you added are compared by their words.
  If you change `tools/skill-tags/tags.json`, run `node tools/skill-tags/build-data.js` to put the change into the app.

Run them with `npm install`, `npx playwright install chromium`, then `npm test`.
They also run on GitHub for every pull request.

When a bug is fixed, add a test here that fails on the old version and passes on the fix.
