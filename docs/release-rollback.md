# When an App Update Breaks: Rolling Back

What to do when a new OnMyLead version in the App Store or Google Play turns out to be broken.
Chris does all of it from the Admin Dashboard (onmylead.com/admin/releases) on any phone or
computer, except the rebuild, which runs on his Mac from the Mac thread after his typed OK.

## The honest limits

Neither store can put an older version back on riders' phones:

| | Google Play | App Store |
|---|---|---|
| Stop new riders getting the bad version | **Halt** the release. New installs and updates get the release before it again. | **Pause** the 7-day phased release (only automatic updates stop; anyone can still download it by hand). Up to 30 days of pauses in total. Without phased release, nothing can be paused. |
| Riders who already have it | Keep it until a newer version arrives. | Same. |
| Upload the old build again | No: every upload needs a higher versionCode. | No: every upload needs a higher version or build number. |
| Remove the app from sale | Possible, but removes it for everyone. Never a rollback. | Same. |

There is no over-the-air update in the app (no `expo-updates`), so every code fix is a store
build. The real "rollback" is therefore: stop the spread, switch off or explain the problem from
the server, and ship the last good code again as a new, higher version.

## The playbook

1. **Stop it spreading.** Admin > Releases: **Halt Release** on Google Play, **Pause Phased
   Release** on the App Store.
2. **Switch off the broken part**, if it is an extra with a switch (Find a Ride, Trip Planner,
   Starlink, RUS Gear, Ride Polls): Admin > Settings > Feature Flags. Phones pick it up within
   minutes. Safety features never get a switch.
3. **Tell riders on that version.** Admin > Releases > Version Notice: an amber "About This
   Version" card on the home screen, shown only on the versions listed (1.0.3 and newer builds read
   it).
4. **Ship the fix.** Either fix forward (revert the bad pull request on main and release as the next
   version) or rebuild the last good code. In the Mac thread, Chris says for example "roll back to
   1.0.2"; the Mac runs:

   ```bash
   scripts/release/rebuild-good-version.sh 1.0.2 1.0.4
   ```

   It finds the commit that was built for 1.0.2 (the `commit` in `help/release.json` `versions`,
   then a tag `app-v1.0.2`, then the version bump commit after asking), checks it out in a separate
   folder (`~/Developer/OnMyLead-rollback-1.0.4`), gives it version 1.0.4 with the next iOS build
   number and Android versionCode, copies `app/.env` and `google-services.json`, and installs
   packages. Building, testing, uploading and submitting are the normal release steps and need
   Chris's typed OK. Ask Apple for an expedited review when riders are stuck. Afterwards a cloud
   thread merges the same numbers into `app/app.json` on main (with `help/release.json` and
   `help/release-notes.json` entries), so main never reuses them.

   The rebuilt code talks to today's server. That is safe because backend changes are always
   backward compatible with every build riders have (CLAUDE.md Rule 4).
5. **Ask everyone to update.** Once the fixed version is live in a store, Admin > Releases >
   Minimum Version for that store. Riders below it see "Please Update OnMyLead" with Update Now and
   Not Now. Not Now is always there: a rider on a trail with no signal can't download anything and
   must keep Ride Mode and Help and SOS.

## Defaults that make a bad release small

- **Google Play:** every production release goes out as a staged rollout starting at 10%, widened
  from Admin > Releases (20%, 50%, then Release to Everyone) once crash numbers on App Health look
  normal.
- **App Store:** every submission has phased release on (set in App Store Connect when submitting,
  or Admin > Releases > Turn On Phased Release before the version goes live). Apple releases
  automatic updates over 7 days (1%, 2%, 5%, 10%, 20%, 50%, 100%).
- **Record the build commit:** when a version is submitted, its `help/release.json` `versions`
  entry gets the exact commit that was built, so the rebuild script never has to guess.

## How it works

| Part | Where |
|---|---|
| Rider-side rules (minimum, latest, version notice) | `app/src/core/app-versions.ts` (unit tested) |
| Update Required screen, Update Available and About This Version cards | `app/src/components/update-required.tsx`, `app/src/components/app-notices.tsx`, `app/src/lib/app-update.ts` |
| Server setting `app_versions`, its checks and the Audit Log function | `supabase/migrations/20261101300000_release_controls.sql` (tested in `supabase/tests/release_controls_test.sql`) |
| Store buttons | `supabase/functions/store-releases` (Play Developer API edits, App Store Connect phased releases); rules in `supabase/functions/_shared/store-releases.ts` (tested) |
| Admin page | `app/src/app/admin/releases.tsx` |
| Rebuild script | `scripts/release/rebuild-good-version.sh` |

Every store button and every saved setting needs an Admin signed in with the authenticator code,
asks for confirmation (Release to Everyone also asks Chris to type the version), and is written to
the Audit Log before the store is asked, then again with the store's answer. Nothing runs on a
schedule.

### Setup still needed (one time)

1. Mac thread, with Chris's typed OK: apply migration `20261101300000_release_controls.sql` and
   deploy `store-releases` (`supabase functions deploy store-releases`). No new secrets.
2. Play Console > Users and permissions > the `onmylead-play@...` service account > OnMyLead:
   add **Release to production, exclude devices, and use Play App Signing** (and **Release apps to
   testing tracks**). Until then the Google Play panel shows the track but the buttons are refused.
3. App Store Connect API key (`ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`, the same key as
   Store Reviews and Signups and Downloads) with the App Manager or Admin role.
