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

Today's device-wide state: iPad runs only the iPhone layout in compatibility mode
(`supportsTablet: false`, portrait lock), and no Android build has been made yet, so every
Android cell is at best 🟡.

## Features

| ID | Feature | iPhone | iPad | Android Phone | Android Tablet | Backend | Admin | Docs | Release | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 | Email sign-up, sign-in, reset, email link | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ sign-in | iOS 1.0 | |
| F02 | Sign in with Apple | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ sign-in | iOS 1.0 | Android needs web OAuth path (optional, E04) |
| F03 | Sign in with Google | ✅ | 🟡 | ⬜ | ⬜ | ✅ | ➖ | ✅ sign-in | iOS 1.0 | Android: browser fallback works in theory; native client needs SHA-1 |
| F04 | Sign in with Facebook | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ sign-in | iOS 1.0 | |
| F05 | Ride name, social profile | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-name-and-profile | iOS 1.0 | |
| F06 | Delete account | ✅ | 🟡 | 🟡 | ⬜ | ✅ | ✅ | ✅ delete-account | iOS 1.0 | Copy mentions Apple subscriptions only |
| F07 | Create a ride (app and website) | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ✅ | ✅ create-a-ride | iOS 1.0 | Tablet: two-column form |
| F08 | Free ride limit (1 a month) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ free-vs-pro | iOS 1.0 | Enforced in the database |
| F09 | Edit ride name, time, meeting point | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ➖ | ⬜ | | Not built anywhere (noted, not started) |
| F10 | Cancel, delete, end ride | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ edit-cancel-or-delete-a-ride | iOS 1.0 | |
| F11 | Organizer controls: approvals, hand-off, leaders, tail gunner | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ organizer-controls | iOS 1.0 | Approval fix needs migration 20261025000000 applied |
| F12 | Ride page, Ride Day weather, fuel check | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ✅ | ✅ ride-day-and-weather | iOS 1.0 | Tablet: details beside map |
| F13 | Join: code, link, QR, waitlist, check-in | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ join-a-ride | iOS 1.0 | |
| F14 | Universal / App Links (onmylead.com/r, /g) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ invite-riders | iOS 1.0 | Android: intent filters + `assetlinks.json` in PR #99; upload key fingerprint added (Play App Signing key's still to add once the Play Console app exists, `docs/android-build.md`); needs a website deploy and a device check (`docs/android-build.md`). Email links (`/auth-callback`) stay in the browser on Android |
| F15 | Invite card: share, text, email, QR | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ invite-riders | iOS 1.0 | |
| F16 | Find a Ride (flag) | ✅ | ⬜ | ⬜ | ⬜ | ✅ | ✅ | ✅ find-a-ride | iOS 1.0 | Android: map needs API key (F27) |
| F17 | Ride Mode live map | ✅ | ⬜ | ⬜ | ⬜ | ✅ | ➖ | ✅ ride-mode | iOS 1.0 | Tablet: sidebar riders + details over full map |
| F18 | Live location sharing (foreground) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ location-sharing | iOS 1.0 | Cross-platform sync test not run yet |
| F19 | Background location during a ride | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ location-sharing | iOS 1.0 | Android (PR #99): foreground service with While Using permission, no `ACCESS_BACKGROUND_LOCATION` and so no Play background-location declaration. Needs a real-device check with the screen off |
| F20 | Wi-Fi-only tablets (no GPS) | ➖ | ⬜ | ➖ | ⬜ | ✅ | ➖ | ⬜ | | Show approximate accuracy; follow without sharing |
| F21 | Personal sharing, family link | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ family-link | iOS 1.0 | |
| F22 | Freshness, Ride Bubble, convoy | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ ride-bubble | iOS 1.0 | |
| F23 | Status buttons, broadcast receipts, regroup, Mechanical Issue, SOS | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ status-buttons | iOS 1.0 | |
| F24 | Ride chat (everyone / leader) | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ✅ | ✅ ride-chat | iOS 1.0 | Tablet: chat beside map |
| F25 | Ride polls (flag) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ ride-polls | iOS 1.0 | |
| F26 | Route builder, trail snapping | ✅ | ⬜ | ⬜ | ⬜ | ✅ | ➖ | ✅ route-builder | iOS 1.0 | Web has a wide layout to reuse |
| F27 | Maps (satellite, topo, trails layers) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ map-layers | iOS 1.0 | Android: Google Maps SDK via react-native-maps, key from `GOOGLE_MAPS_ANDROID_API_KEY` at prebuild (PR #99, D05); blank until the key exists |
| F28 | GPX import | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ import-gpx | iOS 1.0 | No GPX export anywhere |
| F29 | Waypoints, planned stops | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ waypoints-and-planned-stops | iOS 1.0 | |
| F30 | Directions hand-off | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ directions | iOS 1.0 | Android: Google Maps only |
| F31 | Offline maps | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ offline-maps | iOS 1.0 | |
| F32 | Place search | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ place-search | iOS 1.0 | |
| F33 | Riding groups, group chat, follow leaders | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ riding-groups | iOS 1.0 | Tablet: list + chat side by side |
| F34 | Report and block | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ report-and-block | iOS 1.0 | |
| F35 | Garage, fuel range | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ garage | iOS 1.0 | |
| F36 | Trip planner (flag) | ✅ | ⬜ | 🟡 | ⬜ | ✅ | ➖ | ✅ trip-planner | iOS 1.0 | |
| F37 | Starlink (flag) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ starlink | iOS 1.0 | Android network config exists, untested |
| F38 | RUS gear (flag) | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ✅ rus-gear | iOS 1.0 | |
| F39 | Ride summary, share card, ride again | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ ride-summary-and-ride-again | iOS 1.0 | |
| F40 | Push notifications | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ✅ notification-settings | iOS 1.0 | Android (PR #99): FCM v1 sender in `notify-ride-message` + three Android channels; needs Firebase (D06), `FCM_SERVICE_ACCOUNT` secret and a function deploy |
| F41 | Notification settings, quiet hours | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ➖ | ✅ notification-settings | iOS 1.0 | Copy says "Open iPhone Settings" |
| F42 | Pro subscription purchase | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ⬜ | ✅ subscribe-to-pro | iOS 1.0 | Apple only; Play Billing + play-verify + RTDN needed |
| F43 | Restore, manage subscription | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ➖ | ✅ restore-purchases | iOS 1.0 | |
| F44 | 30-day Pro trial | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ pro-trial | iOS 1.0 | Server-granted, store-neutral |
| F45 | Promo codes | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ⬜ | ✅ promo-codes | iOS 1.0 | Apple offer codes; Play promo codes needed |
| F46 | Pro shared across devices | ✅ | 🟡 | 🟡 | 🟡 | ⬜ | ⬜ | ⬜ | | Apple Pro already works on any signed-in device; needs store-neutral entitlements + duplicate guard |
| F47 | Contact form, support | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ contact-support | iOS 1.0 | |
| F48 | CarPlay / Android Auto | ⬜ | ➖ | ⬜ | ➖ | ➖ | ➖ | ➖ | | Exception E01 |
| F49 | Keyboard Done bar / dismiss | ✅ | 🟡 | 🟡 | 🟡 | ➖ | ➖ | ➖ | iOS 1.0 | Done bar is iOS-only; Android closes with Back, a drag on lists or a tap outside. Sheets now lift above the keyboard on Android too (PR #99); device check |
| F50 | Help Center, website, showcase | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | web | Device-specific steps added as each device ships |

## Device Foundations

| ID | Item | State | Notes |
|---|---|---|---|
| D01 | iPad: `supportsTablet`, rotation, multitasking | ⬜ | Needs a new Apple build after 1.0 is approved |
| D02 | Shared breakpoint hook (Compact / Medium / Expanded) | ⬜ | `docs/development-standards.md` section 2 |
| D03 | Tablet layouts: Ride Mode sidebar, ride page split, list + detail | ⬜ | |
| D04 | Android build pipeline (Mac Gradle or EAS) and release keystore | 🔨 | Gradle on the Mac, upload-key signing from `~/.gradle/gradle.properties`, Play App Signing: `docs/android-build.md` (PR #99). Keystore is Chris's |
| D05 | Google Maps API key (Android) | 🔨 | Plugin reads `GOOGLE_MAPS_ANDROID_API_KEY` from `app/.env` (PR #99). Maps SDK for Android has no usage charge; needs a Google Cloud billing account. Key is Chris's |
| D06 | Firebase project + FCM | 🔨 | Code done (PR #99); Chris creates the Firebase project, `app/google-services.json` and the `FCM_SERVICE_ACCOUNT` secret |
| D07 | Google Play Developer account | ⬜ | Chris: `docs/google-play-account.md` |
| D08 | Platform-neutral copy (no "iPhone" in shared screens) | 🔨 | PR #99 fixed the Android app's support answers, notification settings button and directions labels; website, legal and billing copy remain |
| D09 | CI: typecheck, lint, unit tests, database tests on pull requests | ⬜ | Today only the Help check runs on PRs |
| D10 | CI: Android build check, tablet screenshot check, parity check | ⬜ | |
| D11 | Play listing, phone + tablet screenshots, data safety form | 🔨 | `store/google-play/`: listing, data safety, declarations, phone screenshots and Play Console checklist done; tablet screenshots wait for D03 |
| D12 | iPad screenshots for the App Store | ⬜ | Plan in `store/app-store/ipad-and-next-apple-release.md`; rendered after D03 |

## Exceptions

| ID | Feature | Devices | Why |
|---|---|---|---|
| E01 | CarPlay | iPhone only | Needs Apple's CarPlay entitlement (requested); off unless `ONMYLEAD_CARPLAY=1`. Android Auto is not planned; iPad and Android tablets have no car mode. |
| E02 | Admin Dashboard | Website only | Owner tool at onmylead.com/admin; phone apps link to it. |
| E03 | Offline maps | Apps only | The website can't store map tiles. |
| E04 | Sign in with Apple on Android | Optional | Apple doesn't ship a native sheet on Android; web OAuth works if wanted. |
| E05 | Purchases | Per store | Apple devices buy through the App Store, Android through Google Play, the website sells nothing; one Pro state on the server for all. |
