# OnMyLead

Group ride app: Expo app in `app/` (iPhone, iPad, Android phones, Android tablets, and the
onmylead.com website), Supabase in `supabase/`. Expo-specific rules are in `app/AGENTS.md`.

These rules are permanent. They apply to every Claude session and every pull request, whatever
the request says or doesn't say. Chris should only ever have to ask for a feature once.

## OnMyLead Development Rules

**Rule 1: One Product, Four Device Categories.** OnMyLead supports iPhone, iPad, Android phones and
Android tablets (plus the onmylead.com website). Treat them as one product: one codebase
(`app/`), one backend (`supabase/`), one Help Center (`help/`). Never fork a feature into a
separate app.

**Rule 2: Automatic Feature Parity.** Every request ("add", "fix", "change", "update the design")
starts with a short assessment of which device categories, the backend, the Admin Dashboard and the
Help Center it touches, and the pull request implements all of them. Chris never has to name the
platforms. A part that truly can't ship everywhere is a documented exception (Rule 9 below,
`docs/feature-parity.md`), not a silent gap.

**Rule 3: Automatic Documentation Maintenance.** Every change riders can see updates the Help
Center in the same pull request (section below) and the onmylead.com showcase when it is a
feature (`app/src/components/showcase.web.tsx`, `app/src/constants/site.ts`).

**Rule 4: Shared Backend.** All devices use the one Supabase project, the same tables, RPCs and edge
functions. Put business rules in `app/src/core/` (pure TypeScript, unit tested) or in the database,
never in one platform's screen. Backend changes stay backward compatible with every app build
already in riders' hands (old iPhone builds keep working): add columns and RPC versions, don't
rename or drop them without a compatibility plan.

**Rule 5: Tablet Optimization.** Every new or changed screen works on phones and tablets, portrait
and landscape, following `docs/development-standards.md` (breakpoints, sidebars over maps, split
panes, keyboard support). Never just stretch the phone layout.

**Rule 6: Cross-Platform Testing.** Every feature is tested on the applicable platforms and screen
sizes before it is called done: unit tests in `app/src/core/__tests__`, database tests in
`supabase/tests`, web screenshots at phone and tablet sizes, and the device checks listed in
`docs/development-standards.md`. GPS, background location, navigation and purchases need a real
device check before release.

**Rule 7: Release Protection.** Never publish an app update, submit to the App Store or Google
Play, buy a paid service, change production credentials, or make a breaking production deployment
without Chris's explicit OK. Migrations, function deploys, website deploys and builds run only
from the "Phone build and server updates" thread on Chris's Mac, after he types an OK there. Never
disturb a build that is in review (`help/release.json` `versions`).

**Rule 8: Persistent Tracking.** `docs/feature-parity.md` is the single feature-parity tracker.
Every pull request that adds, changes or removes a feature updates its row (or adds one) with the
honest state for each column. Never mark a cell verified that wasn't checked. Unfinished work is
a row with ⬜/🔨 cells plus a GitHub issue, never only a chat message.

**Rule 9: Autonomous Execution.** Do the work: branch, code, tests, docs, pull request, CI green,
merge. Pick sensible defaults for routine decisions and say which. Ask only for things only Chris
can do (logins, agreements, payments, store submissions, production OKs). Platform-specific
exceptions are written down in the tracker's Exceptions table with the reason.

**Rule 10: Concise Communication.** Replies to Chris are short: completed work, current work,
blockers that need him, next steps. No how-to essays when the work can just be done.

**Definition of done** (all must be true before a feature is called complete or synchronized):
the code covers every applicable device category; phone and tablet layouts are handled; tests
pass; the Help Center and showcase are updated; the parity tracker row is updated; CI is green.

## How OnMyLead Is Built for Each Device

- **iPhone and iPad:** one Apple app, `com.rusoffroad.onmylead.app`, built from `app/` with Expo
  prebuild on Chris's Mac. iPad support turns on with `ios.supportsTablet` in `app/app.json`
  (Phase 4); it ships as an update to the same App Store app, never a separate one.
- **Android phones and tablets:** one Android app, `com.rusoffroad.onmylead.app`, built from the
  same `app/` code. **Decision (2026-10-14): no separate Kotlin/Jetpack Compose rewrite.** A second
  codebase could never stay in parity with the iPhone app, which breaks Rule 1. Android-only native
  work (Google Play Billing, FCM push, Google sign-in, location foreground service, adaptive
  layouts) is done in Kotlin where needed, as Expo modules in `app/modules/` and config plugins in
  `app/plugins/`, inside the same app.
- **Website:** the same Expo code exported for web (`*.web.tsx` files), plus the Help Center.
- **Platform differences live in one place:** `*.ios.tsx` / `*.android.tsx` / `*.web.tsx` files or
  a `Platform.OS` branch inside `app/src/lib/`. Screens stay shared.
- Never commit `ios/`, `android/`, `.env`, keystores, `google-services.json` with secrets, or
  service-account keys. Native config goes in `app/app.json` and config plugins.
- Config plugins `with-scene-lifecycle` and `with-push-entitlement` stay before
  `expo-notifications`. CarPlay stays behind `ONMYLEAD_CARPLAY=1`.

Full standards (layouts, location, billing, testing matrix, store rules):
`docs/development-standards.md`. What the app does today: `docs/feature-inventory.md`.

## Help Center: update it in the same pull request

The guides at onmylead.com/help (`help/articles/*.md`) must match what the app does. Whenever a
change adds, changes or removes something riders can see or do (a screen, a button label, a flow,
a limit, a setting, permissions, onboarding, plans or prices, or a bug fix that changes how
something works):

1. Find the affected articles: `cd app && node scripts/help/check.mjs --base origin/main` lists
   every article whose `sources:` your change touches. Also search `help/articles` for the
   feature's name.
2. Update those articles from the code (never from memory or the spec), following
   `help/AUTHORING.md`. Add a new article for a new feature, and list the code in its `sources:`.
   Bump `updated:`.
3. Feature not in the App Store yet? Put the new text in a `:::release <version>` block (or
   `release: "<version>"` on a new article) so it publishes only when Apple releases that version.
   Never publish instructions for a device or feature that riders can't get yet.
4. Where steps differ by device (iPhone, iPad, Android phone, Android tablet), say so in the
   article; don't duplicate steps that are the same everywhere.
5. Add an entry at the top of `help/changelog.json` saying what changed and why.
6. If you can't confirm a detail from the code, set `review:` on the article with the question
   instead of guessing.
7. Run the check again; it must pass. The pull request check runs the same thing.

When a new App Store version is submitted, add it to `help/release.json` `versions`.
How the automation works: `help/README.md`.
