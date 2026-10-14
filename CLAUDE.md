# OnMyLead

Group ride app: Expo app in `app/` (also the onmylead.com website), Supabase in `supabase/`.
Expo-specific rules are in `app/AGENTS.md`.

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
4. Add an entry at the top of `help/changelog.json` saying what changed and why.
5. If you can't confirm a detail from the code, set `review:` on the article with the question
   instead of guessing.
6. Run the check again; it must pass. The pull request check runs the same thing.

When a new App Store version is submitted, add it to `help/release.json` `versions`.
How the automation works: `help/README.md`.
