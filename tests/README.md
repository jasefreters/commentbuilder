# Safety-net tests

These tests open the real app in a hidden browser, build a made-up class of six students, and check that the app
keeps every comment where it belongs. Nothing is sent anywhere: web requests are blocked, and the cloud is a pretend one.

The main rule they protect: **a change to one comment changes that comment and nothing else.**

- `01-fixture` checks the made-up class builds and each comment names only its own student.
- `02-overwrite` makes one change at a time (in Review, in Build, a future direction, Done, a semester switch,
  closing and reopening) and then looks at all 18 comments to confirm only the expected one changed.
- `03-sync-history` runs two pretend devices on one account, and History restore.

Run them with `npm install`, `npx playwright install chromium`, then `npm test`.
They also run on GitHub for every pull request.

When a bug is fixed, add a test here that fails on the old version and passes on the fix.
