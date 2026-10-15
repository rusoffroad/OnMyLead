# OnMyLead Feature Inventory

Audit of the code on `main` at 4559b8f (2026-10-14), read from the code, not the spec. The
iPhone app is the source of truth: version 1.0 build 2 (from ad388f4) is in App Store review.
Per-device status for each feature: `docs/feature-parity.md`.

## How the Product Is Built

| Part | What | Where |
|---|---|---|
| App | One Expo SDK 57 + Expo Router codebase (React Native 0.86, TypeScript). Builds the iPhone app, could build Android today, and exports the website. No `ios/` or `android/` in git (prebuild). | `app/` |
| Shared logic | Pure TypeScript rules with vitest tests (bubble, sharing, fuel, joining, entitlements, help...) | `app/src/core/` |
| Platform code | 20 `*.web.ts(x)` files; no `*.ios` / `*.android` files; ~77 `Platform.OS` branches (mostly web vs native) | `app/src/lib/`, `app/src/components/` |
| Native extras | CarPlay Expo module (Swift, Apple only, off); config plugins: Starlink local network (iOS + Android), CarPlay, Sentry, scene lifecycle, push entitlement | `app/modules/`, `app/plugins/` |
| Backend | One Supabase project: 29 migrations, RLS on every table, realtime, pg_net, pg_cron, Vault | `supabase/migrations/` |
| Edge functions | notify-ride-message, appstore-verify, appstore-notifications, admin-api, admin-integrations, store-downloads, contact-form, delete-account | `supabase/functions/` |
| Database tests | 18 SQL test files + a concurrency test on real Postgres | `supabase/tests/` |
| Admin Dashboard | Web-only routes at onmylead.com/admin, Admin + authenticator code (aal2) | `app/src/app/admin/` |
| Website | Showcase home, ride/group link previews, web ride creation, /contact /support /terms /privacy, Help Center | `app/src/components/showcase.web.tsx`, `help/` |
| Help Center | 52 articles, release-gated by the live App Store version, checked on every pull request | `help/` |
| CI | `help.yml` (Help check on PRs, audit on main + nightly), `web.yml` (unit tests + web build to `web-build` on main) | `.github/workflows/` |
| Deploy | Website: server pulls `web-build` (`deploy/deploy.sh`). App: built on Chris's Mac; no EAS, no `eas.json` | `deploy/` |
| Store | App Store listing and screenshots | `store/app-store/` |

Device settings today (`app/app.json`): `orientation: portrait`, `ios.supportsTablet: false`,
bundle and package `com.rusoffroad.onmylead.app`. The Android block has the package and icons
only: no Google Maps API key, no FCM config, no App Links intent filters.

## Features by Area

Tags: **[iOS-only]** uses an Apple-only API today; **[Android gap]** missing or unwired on
Android; **[flag]** behind a remote feature flag (`app_settings.flags`); **[Pro]** gated.

### Accounts and Sign-In
- Email + password sign-up and sign-in, forgot-password email and `/reset-password`, email sign-in
  link (magic link). `app/src/app/sign-in.tsx`, `lib/session.ts`.
- Sign in with Apple: native sheet **[iOS-only]**; not offered on Android.
- Google: native iOS client **[iOS-only]**; Android falls back to browser OAuth through Supabase.
- Facebook: browser OAuth on all platforms.
- Phone code sign-in exists in `lib/session.ts` but has no screen (not a feature).
- `/auth-callback` finishes email links (Open in the App / Continue on the Website).
- Delete Account (in-app, `delete-account` function), Sign Out.

### Profile and Settings (You tab)
- Ride name (`/ride-name`) with live preview; opt-in social profile (name/photo from Apple, Google
  or Facebook) shown on rider info.
- Notifications (`/notifications`): per-topic switches (rider status, announcements, ride chat,
  leader messages, ride changes, new riders, reminders, ride invites, group chat, leaders you
  follow, trial reminders), cancellation emails, message preview, quiet hours.
- Directions app choice (Ask Each Time / Apple Maps / Google Maps; Google only on Android).
- Subscription, Blocked Riders, Contact Us, Help and Support, Terms, Privacy, Admin Dashboard link
  (admins).

### Rides: Create, Manage, Organize
- Create a Ride (`/ride/new`, also on the website): Public / Private, name, day (14 days) and time,
  meeting point (place search, current location, map), state, Mapped or Freeride route, vehicles
  welcome, Anyone Can Join / I Approve Riders, max vehicles, max riders, invite riding groups,
  optional description, departure, finish, destination, route length, difficulty, experience,
  what to bring, required equipment, fuel, instructions, Ride Bubble preset.
- Free plan: 1 ride per UTC month, enforced by a database trigger (`rides_limit_guard`) **[Pro]**.
- Ride Again / Copy This Ride (prefilled copy).
- Ride page (`/r/[code]`, works signed out as a preview with a rounded meeting point): Details,
  Map, Riders, Chat tabs; Ride Day weather and daylight; directions card; fuel check against your
  machine; Plan What to Bring.
- Organizer: Start Ride Mode, End Ride for Everyone, approve / decline requests, hand the ride or
  the lead to another rider, leaders, tail gunner, Cancel Ride (push + email), Delete Ride.
- Not built: editing name, time or meeting point after creation.
- Ride summary after the ride (stats, advanced stats **[Pro]**, Share Ride Card image).
- Past rides list (Free sees the latest 5) **[Pro]**.

### Joining and Inviting
- Join by code, link (`/r/[code]`), QR code (show / share), riding-group invite.
- Approval (I Approve Riders always waits, except group invites), waitlist with automatic
  promotion, check-in (I'm Here and Ready), leave ride.
- Invite card: Share, Text, Email, Copy Link, Show QR Code.
- Find a Ride **[flag]**: Near Me / By State, place search, radius, map with search this area.
- Universal Links for onmylead.com/r/*, /g/* **[iOS-only]**; **[Android gap]** no App Links.

### Ride Mode and Live Tracking
- Full-screen live group map (satellite hybrid), every rider a dot, leader colored, rider names.
- Location sharing per ride with a duration picker or Until I Leave the Ride; background updates
  through a location task (`lib/location.ts`): one point each 25 m or 15 s, offline queue,
  Android foreground-service notification already configured.
- Battery Saver (`/battery`, You tab, 1.0.1): Best Accuracy (default, 25 m / 15 s), Balanced
  (75 m / 30 s) or Max Battery Saver (200 m / 45 s, ~100 m accuracy), set per device in
  `core/battery.ts`; warns before leaving Best Accuracy.
- Personal sharing (`/share`): chosen riders, timer (open-ended capped at 24 h), Add 1 Hour,
  read-only Family Link (`/f/[token]`).
- Freshness: Live / Last Seen / lost, no-service banner; Ride Bubble (Together / N Separated) with
  presets; convoy view.
- Status buttons (OK, Stopped, Need Fuel, Mechanical, Flat Tire, Stuck, Lost, Need Help,
  EMERGENCY), quick replies, broadcast receipts with offline queue and cancel, pinned
  announcement read aloud, Regroup Here, Navigate to a rider, Mechanical Issue spoken to leaders.
- Emergency sheet: Alert My Group (hold), Call 911.
- Keep-awake, speech, haptics, route progress strip, directions sheet, add waypoint.
- CarPlay ride screen **[iOS-only]**, switched off until Apple grants the entitlement. No Android
  Auto.

### Chat and Polls
- Ride chat to everyone or to the leader only, in-app pop-ups, resolve / clear messages.
- Polls in ride chat (create **[Pro]**, vote free) **[flag]**.
- Report and block from chat.

### Routes, Waypoints, Directions
- Route builder (`/ride/[id]/route`): tap points, Follow Trails (snaps to OSM trails and roads) or
  Straight Line, drag, search, undo, clear, save / remove; web wide layout ≥ 900 px.
- Import GPX **[Pro]**. No GPX export.
- Waypoints (shared or only you, press and hold, at my location) and numbered Planned Stops.
- Directions to the meeting point, a rider or a waypoint in Apple Maps or Google Maps.
- Fuel range on the ride (route length vs each rider's machine range).

### Maps
- `react-native-maps`: Apple Maps on iOS; Google Maps on Android **[Android gap]** (no Maps API
  key configured, so maps are blank on Android today).
- Layers: Satellite, Topo, public Trails and roads (OpenFreeMap / OSM tiles, attribution).
- Offline maps (`/maps`, `/maps/area`): download an area or a ride's area, sizes, delete **[Pro]**;
  app only.
- Place search (search a place or address) on create, find and route builder.

### Riding Groups and Social
- Groups tab: New Group, your groups, groups you're in, group chat with unread counts and ride
  "tickets", group links (`/g/[code]`), invite a group to a ride, leave / delete **[Pro]** to
  create.
- Follow leaders and see their upcoming rides.
- Blocked riders list; report rider or ride.

### Garage, Trips and Extras
- Garage: machines with photo, VIN decode, specs, fuel range (full, safe turnaround, safe trip),
  parts and extras with costs, build totals, Build Sheet and CSV export.
- Trip Planner **[flag]**: packing checklist, starter lists **[Pro]**, copy to a new trip (Free: 1
  active trip).
- Starlink **[flag]**: local dish stats and 15-minute history, setup notes, power budget.
- RUS Offroad gear links **[flag]**.

### Notifications
- Push through `expo-notifications` raw device tokens, registered with platform; ride reminders
  scheduled on the device; tapping opens the ride or chat.
- Server sends straight to Apple (APNs) **[Android gap]**: Android tokens are stored but skipped
  (no FCM sender, no `google-services.json`).
- Emails through Resend: ride cancelled / deleted, trial reminders, branded auth emails.

### Pro, Trial and Promo Codes
- Free vs Pro (`feature_plans`): Free has 1 ride a month, 5 past rides, 1 active trip; Pro adds
  unlimited rides, GPX import, offline maps, saved groups, polls, advanced stats and trip lists,
  premium ride cards. Safety features are always free.
- 30-day Pro Trial granted by the server on sign-up (no payment, reminders by push and email).
- Pro $4.99 a month or $29.99 a year through StoreKit 2 (`expo-iap`), verified by
  `appstore-verify`, kept current by App Store Server Notifications **[iOS-only]**.
- Restore Purchases, Redeem Promo Code (Apple offer codes), Manage Subscription **[iOS-only]**.
- Android shows "Subscriptions are managed in the OnMyLead iPhone app" **[Android gap]**: no
  Google Play Billing, no Play verification, no Play promo codes. A Pro entitlement bought on
  iPhone already applies on any device (server side, `my_entitlements`).

### Website (onmylead.com)
- Showcase home (live group-map hero, features, Free vs Pro, promo film), Get the App.
- Ride and group link previews, family link, web ride creation and route setup, sign-in.
- Contact form, Support, Terms, Privacy; Help Center at /help.

### Admin Dashboard (onmylead.com/admin)
- Overview, Signups and Downloads (real riders without test and admin accounts, marking test
  accounts, App Store and Google Play downloads), Users (comp Pro, extend trial, revoke, suspend, delete), Rides (remove), Trials,
  Subscriptions, Promo Codes (App Store Connect offer codes), Reports, Analytics, App Health
  (Sentry, push tokens by iPhone / Android, server checks), Exports, Settings (trial days, feature
  plans, flags, banners), Audit log, Contact messages, Help Center editor.
- Store data is Apple-only today (`app_store_subscriptions`, `app_store_events`, revenue, promo
  codes).

## What Android Needs (Audit Findings)

None of these is a blocker to building Android from the existing codebase; each is a defined
piece of work.

1. Google Maps API key for Android (Maps SDK for Android) in `app.json` via env; otherwise maps
   are blank.
2. FCM: Firebase project, `google-services.json` (from env, not committed), FCM HTTP v1 sender in
   `notify-ride-message`.
3. Google Play Billing: `expo-iap` Android purchase path, a `play-verify` edge function, Real-time
   Developer Notifications endpoint, store-neutral entitlements (`has_paid_pro`,
   `my_entitlements`, admin pages), duplicate-subscription guard across stores.
4. Android App Links (intent filters + `/.well-known/assetlinks.json` on onmylead.com, needs the
   Play signing SHA-256).
5. Google sign-in Android client (SHA-1); Apple sign-in on Android via web OAuth (optional).
6. Background location: ask background permission as a separate step (Android 11+), Play
   background-location declaration.
7. Platform copy: ~37 strings say "iPhone" or "Apple" (Open iPhone Settings, Apple subscriptions).
8. Keyboard Done bar is iOS-only (`components/keyboard.tsx`); Android needs its own dismiss path
   check.
9. Build path: Android Studio / JDK on the Mac or EAS Build; release keystore and Play App Signing.

## What Tablets Need (Audit Findings)

- `orientation: portrait` locks every device; tablets need rotation.
- `supportsTablet: false`: iPad runs the iPhone app in compatibility mode.
- No breakpoints in native screens; only the web route builder and waypoints switch layout at
  900 px. Content is centered at 800 px max width.
- Ride Mode panels are sized from screen height; needs a side-panel layout for wide windows.
- No location-without-GPS handling for Wi-Fi tablets beyond what the OS provides.
