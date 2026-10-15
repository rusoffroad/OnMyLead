# OnMyLead Feature-Parity Tracker

The one place that says where every feature stands on every device. Every pull request that adds,
changes or removes a feature updates its row here (`CLAUDE.md` Rule 8). Never mark a cell ✅ that
wasn't checked; "the code is shared" is 🟡 until it runs on that device.

Last full audit: 2026-10-14 against `main` 4559b8f (`docs/feature-inventory.md`).

## Legend

| Mark | Meaning |
|---|---|
| ✅ | Built and verified on that device / layer |
| 🟡 | Shared code that should work there, but not built or tested on that device yet |
| 🔨 | In progress (link the pull request in Notes) |
| ⬜ | Missing: needs work before that device can ship it |
| ➖ | Not applicable (see Exceptions) |

Columns: **iPhone**, **iPad**, **Android Phone**, **Android Tablet** = the app on that device
(iPad and Android tablet also mean a tablet layout, not a stretched phone screen). **Backend** =
database, RPCs and edge functions support it for every store and device. **Admin** = the Admin
Dashboard shows or manages it where relevant. **Docs** = Help Center article(s) cover it.
**Release** = the store version that carries it.

Today's device-wide state (2026-10-15): OnMyLead 1.0 build 3 (from `22c7a3f`) is submitted to the
App Store for iPhone and iPad, and the same code is submitted to Google Play for Android phones and
tablets. The Help Center and onmylead.com treat iPad and Android as released. Cells stay 🟡 until a
feature is checked on that device: iPhone is device-tested, tablets and Android mostly only on the
web build and the Android emulator.

## Features

| ID | Feature | iPhone | iPad | Android Phone | Android Tablet | Backend | Admin | Docs | Release | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 | Email sign-up, sign-in, reset, email link | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ sign-in | iOS 1.0 | |
| F02 | Sign in with Apple | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ sign-in | iOS 1.0 | Android needs web OAuth path (optional, E04) |
| F03 | Sign in with Google | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ sign-in | iOS 1.0 | Android: browser fallback works in theory; native client needs SHA-1 |
| F04 | Sign in with Facebook | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ sign-in | iOS 1.0 | |
| F05 | Ride name, social profile | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-name-and-profile | iOS 1.0 | |
| F06 | Delete account | ✅ | 🟡 | 🟡 | ⬜ | ✅ | ✅ | ✅ delete-account | iOS 1.0 | Copy mentions Apple subscriptions only; Pro screen and Help now name Google Play on Android |
| F07 | Create a ride (app and website) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ create-a-ride | iOS 1.0 | Tablet: form capped at 640 wide; two-column form not built (issue #101). 1.0.1: ride day from a month calendar, today up to a year out (core/calendar.ts, unit tested; `ride-date-picker.tsx`, pure JS, same on every device); web-checked at phone and tablet sizes, no device check yet. Website gets it on its next deploy |
| F08 | Free ride limit (1 a month) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ free-vs-pro | iOS 1.0 | Enforced in the database |
| F09 | Edit ride name, time, meeting point | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ➖ | ⬜ | | Not built anywhere (noted, not started) |
| F10 | Cancel, delete, end ride | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ edit-cancel-or-delete-a-ride | iOS 1.0 | |
| F11 | Organizer controls: approvals, hand-off, leaders, tail gunner | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ organizer-controls | iOS 1.0 | Approval fix needs migration 20261025000000 applied |
| F12 | Ride page, Ride Day weather, fuel check | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-day-and-weather | iOS 1.0 | Tablet: ride and details on the left, Map / Riders / Chat beside them; web-checked, no device check yet |
| F13 | Join: code, link, QR, waitlist, check-in | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ join-a-ride | iOS 1.0 | |
| F14 | Universal / App Links (onmylead.com/r, /g) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ invite-riders | iOS 1.0 | Android: intent filters + `assetlinks.json` in PR #99; upload key fingerprint added (Play App Signing key's still to add once the Play Console app exists, `docs/android-build.md`); needs a website deploy and a device check (`docs/android-build.md`). Email links (`/auth-callback`) stay in the browser on Android |
| F15 | Invite card: share, text, email, QR | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ invite-riders | iOS 1.0 | |
| F16 | Find a Ride (flag) | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ✅ | ✅ find-a-ride | iOS 1.0 | Android: map needs API key (F27). Tablet: search and list beside a full-height map; web-checked |
| F17 | Ride Mode live map | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ ride-mode | iOS 1.0 | Tablet: full-screen map, riders sidebar (swipe left to fold), controls panel on the right; web-checked, no device check yet. Riders who join mid-ride appear live (ride_members + positions realtime, core/live-roster.ts) |
| F18 | Live location sharing (foreground) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ location-sharing | iOS 1.0 | Cross-platform sync test not run yet. 1.0.1: one-time Location Is Off notice when location is turned off mid-share (reproduced on Android emulator; fix not device-checked yet) |
| F19 | Background location during a ride | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ location-sharing | iOS 1.0 | Android (PR #99): foreground service with While Using permission, no `ACCESS_BACKGROUND_LOCATION` and so no Play background-location declaration. Needs a real-device check with the screen off |
| F20 | Wi-Fi-only tablets (no GPS) | ➖ | ⬜ | ➖ | ⬜ | ✅ | ➖ | ⬜ | | Show approximate accuracy; follow without sharing. Tracked in issue #101 |
| F21 | Personal sharing, family link | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ family-link | iOS 1.0 | |
| F22 | Freshness, Ride Bubble, convoy | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ ride-bubble | iOS 1.0 | |
| F23 | Status buttons, broadcast receipts, regroup, Mechanical Issue, SOS | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ status-buttons | iOS 1.0 | |
| F24 | Ride chat (everyone / leader) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-chat | iOS 1.0 | Tablet: chat beside the ride details |
| F25 | Ride polls (flag) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-polls | iOS 1.0 | |
| F26 | Route builder, trail snapping | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ route-builder | iOS 1.0 | Tablet: tools panel beside the map (Expanded) or floating card (Medium); web-checked |
| F27 | Maps (satellite, topo, trails layers) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ map-layers | iOS 1.0 | Android: Google Maps SDK via react-native-maps, key from `GOOGLE_MAPS_ANDROID_API_KEY` at prebuild (PR #99, D05); blank until the key exists |
| F28 | GPX import | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ import-gpx | iOS 1.0 | No GPX export anywhere |
| F29 | Waypoints, planned stops | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ waypoints-and-planned-stops | iOS 1.0 | Tablet: waypoint panel beside the map; web-checked |
| F30 | Directions hand-off | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ directions | iOS 1.0 | Android: Google Maps only |
| F31 | Offline maps | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ offline-maps | iOS 1.0 | |
| F32 | Place search | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ place-search | iOS 1.0 | |
| F33 | Riding groups, group chat, follow leaders | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ riding-groups | iOS 1.0 | Tablet: list + chat side by side not built yet (issue #101) |
| F34 | Report and block | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ report-and-block | iOS 1.0 | |
| F35 | Garage, fuel range | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ garage | iOS 1.0 | Tablet: forms capped at 640 wide; list + detail not built (issue #101) |
| F36 | Trip planner (flag) | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ trip-planner | iOS 1.0 | Tablet: forms capped at 640 wide; list + detail not built (issue #101) |
| F37 | Starlink (flag) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ starlink | iOS 1.0 | Android network config exists, untested |
| F38 | RUS gear (flag) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ rus-gear | iOS 1.0 | |
| F39 | Ride summary, share card, ride again | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ ride-summary-and-ride-again | iOS 1.0 | |
| F40 | Push notifications | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ✅ notification-settings | iOS 1.0 | Android (PR #99): FCM v1 sender in `notify-ride-message` + three Android channels; needs Firebase (D06), `FCM_SERVICE_ACCOUNT` secret and a function deploy. Tap routing (core/push-tap.ts, unit tested): FCM now sends notification messages so a tap from the background opens the ride, and cold-start taps wait for navigation on every device; needs a notify-ride-message redeploy and an Android + iPhone device check. Back from a screen opened by a tap returns Home on the phone apps (initialRouteName (tabs), #109) |
| F41 | Notification settings, quiet hours | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ notification-settings | iOS 1.0 | Copy says "Open iPhone Settings" |
| F42 | Pro subscription purchase | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ subscribe-to-pro | iOS 1.0 | Google Play Billing, play-verify and play-notifications written and DB-tested in the Play Billing PR; not deployed, no Play products yet, no device test (#102) |
| F43 | Restore, manage subscription | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ➖ | ✅ restore-purchases, manage-subscription | iOS 1.0 | Android restore and Google Play manage link written, not device-tested (#102) |
| F44 | 30-day Pro trial | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ pro-trial | iOS 1.0 | Server-granted, store-neutral |
| F45 | Promo codes | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ promo-codes | iOS 1.0 | Apple offer codes plus Play promo codes (made in Play Console; Admin shows both); not device-tested (#102) |
| F46 | Pro shared across devices | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ manage-subscription | | store_subscriptions view + my_entitlements store fields + duplicate-purchase guard, DB-tested; not deployed (#102) |
| F47 | Contact form, support, Report a Bug | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ✅ contact-support | iOS 1.0 | 1.0.1: You > Report a Bug adds a screenshot, device line, screen before and the in-memory app activity log (core/app-log.ts, unit tested; no locations or typed text). Migration 20261031000000 (DB-tested) + contact-form redeploy needed before reports carry details; admin Contact page shows device, screenshot and log. Web-checked at phone and tablet sizes, no device check yet |
| F48 | CarPlay / Android Auto | ⬜ | ➖ | ⬜ | ➖ | ➖ | ➖ | ➖ | | Exception E01 |
| F49 | Keyboard Done bar / dismiss | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ➖ | iOS 1.0 | Done bar is iOS-only; Android closes with Back, a drag on lists or a tap outside. Sheets now lift above the keyboard on Android too (PR #99); device check |
| F50 | Help Center, website, showcase | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | web | Device-specific steps added as each device ships. Privacy Policy names Google services for Android (FCM, Google Play, Google Maps) since PR #107 |
| F51 | Admin: signups and downloads | ➖ | ➖ | ➖ | ➖ | 🟡 | 🟡 | ➖ | web | Owner-only page onmylead.com/admin/growth (Exception E02): real riders without test/admin accounts, over time, by sign-in method; App Store and Google Play downloads from the stores' daily reports. Migration 20261030000000 DB-tested, store-downloads function written; not deployed, store report keys not set (PR #126) |
| F52 | Battery Saver (location update rate) | 🟡 | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ battery-saver | 1.0.1 (queued) | Device-local setting, 3 choices (Best Accuracy default, Balanced, Max Battery Saver) in `core/battery.ts`, warns before leaving Best Accuracy. Changes send distance/heartbeat (all under freshness LIVE_SEC, so no server change and old builds read it right), GPS accuracy, Android fix interval, Ride Mode backup poll and blue-dot step; also the web watch. Unit tested; web screenshots at phone and tablet. Needs a real-device battery and parked-rider check on iPhone and Android (iOS Max Battery Saver uses ~100 m accuracy). onmylead.com showcase line waits for 1.0.1 to be live (the showcase has no release gate). PR #129, follow-up #130 |

## Device Foundations

| ID | Item | State | Notes |
|---|---|---|---|
| D01 | iPad: `supportsTablet`, rotation, multitasking | ✅ | In `app/app.json`: iPhone portrait only, iPad all four orientations and Split View / Slide Over; Android rotation via `src/lib/orientation.ts` (phones locked upright). Ships in 1.0 build 3 (submitted 2026-10-15) |
| D02 | Shared breakpoint hook (Compact / Medium / Expanded) | ✅ | `src/core/layout.ts` (unit tested) + `src/hooks/use-layout.ts`; `TwoPane` and the tab rail use it |
| D03 | Tablet layouts: Ride Mode sidebar, ride page split, list + detail | 🔨 | Ride Mode, ride page, Find, route builder, waypoints, Rides home and tab rail done; groups / garage / trips list + detail and keyboard shortcuts in issue #101 |
| D04 | Android build pipeline (Mac Gradle or EAS) and release keystore | ✅ | Gradle on the Mac, upload-key signing from `~/.gradle/gradle.properties`, Play App Signing: `docs/android-build.md` (PR #99). AABs built and uploaded to Play Console |
| D05 | Google Maps API key (Android) | ✅ | Plugin reads `GOOGLE_MAPS_ANDROID_API_KEY` from `app/.env` (PR #99); key restricted to the upload and Play-signing certificates |
| D06 | Firebase project + FCM | ✅ | Firebase project, `app/google-services.json` on the Mac and the `FCM_SERVICE_ACCOUNT` secret are set; pushes verified on the emulator |
| D07 | Google Play Developer account | ✅ | RUS Offroad LLC organization account; app listing, data safety and subscriptions set up (`docs/google-play-account.md`) |
| D08 | Platform-neutral copy (no "iPhone" in shared screens) | 🔨 | PR #99 fixed the Android app's support answers, notification settings button and directions labels; the website showcase and Help Center now say iPhone, iPad and Android (iPad and Android release PR); legal and some billing copy remain |
| D09 | CI: typecheck, lint, unit tests, database tests on pull requests | ✅ | `.github/workflows/ci.yml`, PR #98 |
| D10 | CI: Android build check, tablet screenshot check, parity check | ✅ | PR #98: `ci.yml` (Android debug APK, website screenshots at phone and tablet sizes), `parity.yml` (tracker check, nightly gap report on the `parity-report` branch) |
| D11 | Play listing, phone + tablet screenshots, data safety form | ✅ | `store/google-play/`: listing, data safety, declarations, phone and 7/10-inch tablet screenshots, Play Console checklist. Ready to paste once the Play account exists (D07) |
| D12 | iPad screenshots for the App Store | ✅ | `store/app-store/screenshots/ipad/` (2732 × 2048); upload with the first iPad build |

## Exceptions

| ID | Feature | Devices | Why |
|---|---|---|---|
| E01 | CarPlay | iPhone only | Needs Apple's CarPlay entitlement (requested); off unless `ONMYLEAD_CARPLAY=1`. Android Auto is not planned; iPad and Android tablets have no car mode. |
| E02 | Admin Dashboard | Website only | Owner tool at onmylead.com/admin; phone apps link to it. |
| E03 | Offline maps | Apps only | The website can't store map tiles. |
| E04 | Sign in with Apple on Android | Optional | Apple doesn't ship a native sheet on Android; web OAuth works if wanted. |
| E05 | Purchases | Per store | Apple devices buy through the App Store, Android through Google Play, the website sells nothing; one Pro state on the server for all. |
