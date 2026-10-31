# The Help Center and How It Keeps Itself Up to Date

The guides at **onmylead.com/help** are built from `help/articles/*.md` on every change to `main`.
They describe the app as riders can actually get it, and three layers keep them in step with the
code without anyone having to remember:

1. **Every pull request is checked** (`.github/workflows/help.yml`, job `check`). Each article lists
   the code it describes under `sources:`. If a pull request changes any of that code and doesn't
   touch the article and `help/changelog.json`, the check fails and names the article. It also
   fails on a new screen no article covers (`help/coverage.json`), a broken help link, a removed
   article without a redirect, or an unreleased feature written up as available. Screenshots whose
   screen changed are flagged as warnings.
2. **Every change to main and every night, a full audit runs** (job `audit`). It compares git
   history (code changed after its article?), screenshot ages, the App Store's live version and the
   dashboard edits, and publishes `report.json` to the `help-audit` branch. The Admin Dashboard
   (onmylead.com/admin/help) shows that report.
3. **A scheduled Claude routine acts on the audit**: it reads the report, updates the flagged
   articles from the code in a pull request (which the check above verifies), logs why in
   `help/changelog.json`, and marks anything it can't confirm with `review:` instead of publishing.

Feature work itself follows `CLAUDE.md` at the repo root: update the affected articles in the same
pull request as the code.

## Release awareness

`help/release.json` lists every App Store version and its status. The build asks Apple's free App
Store lookup which version is actually live and publishes only:

- articles whose `release:` is that version or older (or `web`), and
- `:::release X` blocks for live versions, `:::until X` blocks for versions not yet live.

Before the first approval, the guides for the submitted version (`prelaunch.version`) are shown with
a "waiting for App Store review" notice. If Apple rejects or delays a version, nothing about it
appears, because Apple still reports the older version. If Apple can't be reached, the build uses
`live` from `release.json` and never guesses a newer version.

Write guides for an upcoming version ahead of time with `release: "1.1"` or release blocks. They
publish by themselves on the first website build after Apple releases 1.1 (the website builds
nightly as well as on every change; the server picks it up at the next website deploy).

When a new version is submitted, add it to `versions` in `release.json` in the same pull request
that bumps the build number.

## Release notes

`help/release-notes.json` holds the release notes for every app version, newest first, and the
build turns it into **onmylead.com/help/release-notes** (linked from the Help Center menu, its home
page and both footers). Each version has a Title Case `title`, an `intro`, `notes` (each `new`,
`improved` or `fixed`, with optional `devices`: `iphone-ipad`, `android`, `phones`, `tablets`), the
store text `whatsNew` (at most 500 characters, Google Play's limit; paste it into both stores), and
the store release days `apple` and `google` (or null).

A version shows on the page only once a store has it: the build asks Apple's lookup and reads the
version on the public Google Play page, so a version appears by itself on the first website build
after a store releases it. Fill in `apple` / `google` with the release day once known; a version
skipped on one store says "Included in" the next version that store got. Rules and tests:
`app/src/core/release-notes.ts`.

The check fails when the file is malformed, mentions an unreleased feature, or has no notes for
the version in `app/app.json`, so the pull request that bumps the version writes its notes.

## Manual edits (Admin Dashboard)

The dashboard's Help page can edit any article, restore any earlier version (from git history or
from earlier edits) and switch back to the automatic version. Edits are stored in the database
(`help_article_edits`, migration `20261024000000_help_center.sql`), shown on the website at once
(the help pages check for a newer edit when they load), and baked into the pages at the next build.

The automation never overwrites them: the live edit stays on top of the repository version. When
the repository version changes after an edit, the audit and the dashboard flag it so Chris can keep
his edit, change it, or go back to the automatic version.

## When the check fails

- **"This change edits X, which Y describes"**: open the article, check it against your change, and
  update it. If riders see no difference, bump its `updated:` date anyway and add a
  `help/changelog.json` entry saying so (`kind: "review"`).
- **"Article changed without a help/changelog.json entry"**: add one at the top of the file.
- **"The screen X isn't in any article's sources"**: document the new screen, or add it to
  `help/coverage.json` `ignore` with the reason.
- **"Mentions X as if it's available"**: the feature is in `release.json` `unreleased`. Describe it
  in a release block or leave it out.

Run the same checks locally from `app/`:

```bash
node scripts/help/check.mjs --base origin/main     # what CI runs on a pull request
node scripts/help/check.mjs --audit /tmp/report.json
HELP_OFFLINE=1 node scripts/help/build.mjs dist     # after expo export; preview dist/help
```

## Files

| Path | What it is |
|---|---|
| `help/articles/*.md` | The articles (format: `help/AUTHORING.md`) |
| `help/img/` | Screenshots used by articles |
| `help/categories.json` | Topics, in order |
| `help/release.json` | App Store versions, statuses and unreleased features |
| `help/release-notes.json` | Rider-facing release notes for every app version (onmylead.com/help/release-notes) and the store "What's New" text |
| `help/changelog.json` | Every change to the articles and why, newest first |
| `help/coverage.json` | Which screens must be documented |
| `help/redirects.json` | Old slug to new slug, for removed articles |
| `app/src/core/help.ts` | Front matter, release rules, Markdown, search (shared by build, pages and dashboard) |
| `app/scripts/help/` | Build, checks and the pages' CSS and script |
| `app/src/app/admin/help/` | The dashboard pages |
