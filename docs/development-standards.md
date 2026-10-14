# OnMyLead Development Standards

The rules in `CLAUDE.md` say *what* must happen on every change. This file says *how*. Read it
before building any feature, screen or backend change.

## 1. The Change Workflow (Every Request)

Feature change → cross-platform implementation → testing → documentation → release preparation.

1. **Assess.** Write a short impact list in the pull request: iPhone, iPad, Android phone, Android
   tablet, website, backend, Admin Dashboard, Help Center, showcase. Mark each "changes", "no
   change" or "exception (why)".
2. **Backend first** when data changes: a new migration (one version per thread, never reuse one),
   RLS policies, a privacy test in `supabase/tests/`. Keep it compatible with app builds already
   released (section 5).
3. **Logic in `app/src/core/`** with vitest tests, so every platform runs the same rules.
4. **Screens** in `app/src/app/` and `app/src/components/`, shared by all devices, laid out for
   phone and tablet (section 2). Platform-specific code only in `app/src/lib/` or `*.ios.tsx` /
   `*.android.tsx` / `*.web.tsx` files (section 3).
5. **Admin Dashboard** (`app/src/app/admin/`) when the feature has data the owner needs to see or
   manage (counts, moderation, subscriptions, settings).
6. **Help Center + showcase** in the same pull request (`CLAUDE.md`).
7. **Parity tracker**: update the row in `docs/feature-parity.md`.
8. **Tests and CI** (section 6) pass; then merge. Builds and deploys wait for Chris's OK in the Mac
   thread.

## 2. Layouts: Phones and Tablets

Use `useWindowDimensions()` (never `Dimensions.get` at module load, which breaks on rotation, iPad
Split View, Slide Over, Stage Manager, Android split screen, freeform windows and foldables).
Layout follows the **window** size, not the device model.

| Width class | Window width | Typical device | Layout |
|---|---|---|---|
| Compact | < 600 dp | phones, iPad Slide Over, narrow split screen | Today's phone layout: one column, bottom tabs, swipe sheets over maps |
| Medium | 600 to 839 dp | small tablets portrait, unfolded foldables, iPad split view | Two panes where useful; list + detail; sheets become side panels |
| Expanded | ≥ 840 dp | tablets landscape, large iPads | Navigation rail or sidebar; map full screen with a collapsible side panel; list + detail side by side |

These are the Android window size classes; iPad uses the same breakpoints so the two tablets
behave alike. Put the breakpoint helper in one shared hook and use it everywhere.

The shared pieces: `useLayout()` (`app/src/hooks/use-layout.ts`, breakpoints and panel widths in
`app/src/core/layout.ts`) says `wide` (Medium and up) and `expanded`; `TwoPane`
(`app/src/components/two-pane.tsx`) puts a side column beside a main pane; `Screen width="readable"`
caps forms at 640; `usePanelFold(key, swipe, direction)` folds a map panel down (phone sheet), up
(panel hanging beside the map) or left (sidebar); the tab bar becomes a rail on the left when
`wide`. Rotation: iPhone portrait only and iPad all four ways in `app/app.json`; Android phones
are locked upright at runtime by `app/src/lib/orientation.ts`.

Tablet rules:

- **Maps fill the screen.** On Medium and Expanded, the riders list, ride details and controls sit
  in a collapsible side panel over the map (still collapsible by swipe, per the design rules), so
  an organizer sees the map, live riders and route at once.
- **List + detail.** Rides, groups, garage and trips show the list and the selected item side by
  side on Expanded.
- **Readable widths.** Forms and text never stretch past about 640 dp; center them or use two
  columns.
- **Both orientations.** Tablets support portrait and landscape; phones stay portrait unless a
  screen needs otherwise. `app.json` `orientation` must allow rotation on tablets before Phase 4
  ships.
- **Touch targets** at least 44 pt (iOS) / 48 dp (Android).
- **Keyboards.** Every keyboard stays dismissable (Done bar, drag, tap outside). On tablets with a
  hardware keyboard, Return submits single-line forms, Escape closes sheets, and Tab order follows
  the visual order.
- **Densities.** Use vector icons and `@2x/@3x` (iOS) / density-independent assets (Android); never
  hard-code pixel sizes for images.
- **Same branding everywhere:** dark theme from `app/src/constants/theme.ts`, logo red/blue,
  Barlow, Title Case UI text, "Create a Ride" the loud home button.

## 3. Platform Differences

Keep screens shared. When a device needs different native behavior, put it behind one function in
`app/src/lib/` and choose the implementation with a platform file or `Platform.OS`:

| Need | iPhone / iPad | Android phone / tablet |
|---|---|---|
| Subscriptions | StoreKit 2 via `expo-iap`, server check in `appstore-verify` | Google Play Billing via `expo-iap`, server check in a Play verify function |
| Server purchase updates | App Store Server Notifications (`appstore-notifications`) | Google Play Real-time Developer Notifications |
| Promo codes | Apple offer codes | Google Play promo codes |
| Push | APNs direct (`notify-ride-message`) | FCM HTTP v1 from the same function |
| Sign in with Apple | Native sheet | Web OAuth (Supabase) |
| Google sign-in | Native iOS client | Android OAuth client (needs the app signing SHA-1) |
| Background location | "Always" permission + background mode, blue pill | Foreground service (type location) with the visible Sharing Your Location notification, started by the rider; While Using permission is enough, so the app never requests `ACCESS_BACKGROUND_LOCATION` |
| Maps | Apple Maps (react-native-maps) | Google Maps SDK (react-native-maps; key from `GOOGLE_MAPS_ANDROID_API_KEY` at prebuild, see `docs/android-build.md`) |
| CarPlay / Android Auto | CarPlay behind `ONMYLEAD_CARPLAY=1` | Not built (exception) |
| Starlink local status | Local network permission | Cleartext network security config for the dish |

Every row that isn't built yet on one side is a ⬜ in the parity tracker, not an assumption.

## 4. Location, GPS and Background Sharing

Live rider tracking is the most important feature. On every device:

- Sharing is per ride, temporary, revocable and enforced by database policies. Never widen who can
  read a location without a privacy test proving the rule.
- Send efficiently: the current rule (one point each 25 m or 15 s, `app/src/lib/location.ts`) is
  shared by all platforms; change it in one place.
- Queue points while offline and flush when back online; show freshness ("last seen") so riders
  know a dot is stale. Never imply live tracking works without a connection.
- Stop automatically when the timer ends, the rider leaves, or the organizer ends the ride, on
  every platform, including after the app was killed.
- **Android:** sharing runs in a foreground service the rider starts from the app, with the
  Sharing Your Location notification showing the whole time. Android lets such a service use
  While Using permission with the screen off, so the app asks only for While Using, never sends
  riders to Settings for "Allow all the time", and blocks `ACCESS_BACKGROUND_LOCATION` in
  `app.json`. That also means no Play background-location declaration. Keep it that way: start
  sharing only from a foreground screen (`startLocationUpdatesAsync` with `foregroundService`
  refuses otherwise). The foreground service also keeps Doze from stopping updates.
- **iOS / iPadOS:** "Always" permission with the blue indicator; `pausesUpdatesAutomatically`
  stays off during a ride.
- **Tablets may have no GPS.** Wi-Fi-only iPads and Android tablets get coarse, Wi-Fi-based
  locations or none. Show accuracy honestly (a larger dot or "approximate"), let the rider follow
  the ride without sharing, and never block viewing the map on location permission.

## 5. Backend Compatibility

- Additive changes only for anything a released build calls: new columns nullable or defaulted,
  new RPCs or new parameters with defaults, never a renamed or dropped column, RPC or return field
  until every build that uses it is gone.
- Entitlements are decided on the server only (`entitlement_grants`, store subscription tables).
  One person has one Pro state no matter which store they paid in; a second store purchase while
  one is active must be blocked or flagged, never stacked.
- Schema-qualify extension calls (`extensions.gen_random_bytes`).
- Edge functions can't be type-checked in the cloud; keep them small and tested where possible.

## 6. Testing Matrix

| Check | Where | When |
|---|---|---|
| Unit tests (`npm test` in `app/`) | CI | Every pull request |
| Typecheck (`npx tsc --noEmit`) and lint (`npx eslint src`) | CI | Every pull request |
| Database privacy tests (`supabase/tests/run_local.sh`) | CI with Postgres | Every pull request touching `supabase/` |
| Help Center check | CI (`help.yml`) | Every pull request |
| Web screenshots at 393×852 (phone), 820×1180 and 1180×820 (iPad), 412×915 (Android phone), 1280×800 (Android tablet) | Playwright in the cloud | UI changes |
| iOS build (prebuild + compile) | Chris's Mac | Before a phone install or store upload |
| Android build (prebuild + Gradle) | Chris's Mac or CI | Before an install or Play upload |
| Real device: GPS, background location, navigation, purchases, push | iPhone (+ iPad, Android when available) | Before each store release |

CI runs on every pull request: `.github/workflows/ci.yml` (typecheck, lint, unit tests, native
setup rules, database tests, iOS and Android prebuild, Android debug build, web export and
screenshots at the five sizes above, downloadable from the run), `parity.yml` (this tracker:
feature code changed without a tracker row fails; a pull request with no feature change says
"Parity: no feature change (reason)" in its description) and `help.yml`. The nightly parity gap
report is on the `parity-report` branch. The iOS compile stays on Chris's Mac.

Simulators and emulators cover layouts; real devices cover GPS, background location and billing.
Cross-platform sync test before each release: one ride with an iPhone, an iPad, an Android phone
and an Android tablet (or emulators with mock locations), every rider seeing every other rider.

## 7. Releases and Stores

- **Apple:** version 1.0 build 2 is in review. The next upload bumps `ios.buildNumber` (or the
  version) in a pull request first and adds the version to `help/release.json`. iPad ships as an
  update of the same app.
- **Google Play:** one app for phones and tablets, package `com.rusoffroad.onmylead.app`, Play App
  Signing, Android App Bundle, internal testing track first. Chris's account steps:
  `docs/google-play-account.md`.
- Nothing is submitted, released or deployed to production without Chris's typed OK.
- Store listings and screenshots live in `store/` (`store/app-store/`, `store/google-play/`).
