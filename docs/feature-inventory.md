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
| Native extras | CarPlay Expo module (Swift, Apple only, on from 2.1); config plugins: Starlink local network (iOS + Android), CarPlay, Sentry, scene lifecycle, push entitlement | `app/modules/`, `app/plugins/` |
| Backend | One Supabase project: 29 migrations, RLS on every table, realtime, pg_net, pg_cron, Vault | `supabase/migrations/` |
| Edge functions | notify-ride-message, appstore-verify, appstore-notifications, admin-api, admin-integrations, store-downloads, store-reviews, store-releases, contact-form, delete-account | `supabase/functions/` |
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
- Subscription, Blocked Riders, Report a Bug (1.0.1: screenshot + app activity log), Contact Us, Help and Support, Terms, Safety Agreement (2.0), Privacy, Admin Dashboard link
  (admins only; since 2.1 it is the first row of the You tab, right under the name card).

### Rides: Create, Manage, Organize
- Create a Ride (`/ride/new`, also on the website): Public / Private, name, day (quick picks plus a month calendar, today up to a year out, 1.0.1) and time,
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
- Scout, Places to Ride (2.1) **[flag scout]**: Find tab switch; off-road parks, OHV areas, trail systems, trailheads and motocross tracks within 10-1,000 mi (250 default), kind filters, place pages with Create a Ride Here, directions and nearby public rides; Suggest a Place reviewed in Admin > Places to Ride. Data: USFS, BLM, OpenStreetMap (riding_spots).
- Universal Links for onmylead.com/r/*, /g/* **[iOS-only]**; **[Android gap]** no App Links.

### Ride Mode and Live Tracking
- Full-screen live group map (satellite hybrid), every rider a white-ringed dot on their exact position, leader a bigger blue dot, rider names in dark pills.
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
  EMERGENCY), quick replies, ✎ Message (type your own one-line message to the group, sent like a
  quick reply; up to 6 saved My Quick Replies per device, 2.0), broadcast receipts with offline queue and cancel, pinned
  announcement read aloud, Regroup Here, Navigate to a rider, Mechanical Issue spoken to leaders.
- Emergency sheet: Alert My Group (hold), Call 911.
- Emergency Siren (2.1 build 10): another rider's EMERGENCY (or a Crash Alert that went out) sounds a
  looping siren on a full-screen card over any screen until Silence Siren / Show Me Where; the
  push plays the siren with the app closed (iOS sound, Android `ride-emergency` channel); Bluetooth
  calls in the background get a local notification. Switch + Play Siren in Notification Settings.
  `core/siren.ts`, `lib/siren.ts`, `components/emergency-siren.tsx`, migration
  `20261105070000_emergency_siren.sql`.
- Keep-awake, speech, haptics, route progress strip, directions sheet, add waypoint.
- CarPlay ride screen **[iOS-only]** (2.1; Apple granted the Driving Task entitlement 2026-11-04):
  status buttons, Group list, Regroup Here or Running Late, EMERGENCY with confirm, help-call and
  separation alerts, in the app's language. No Android Auto.

- Bluetooth Sharing mesh (2.1): with no service, Ride Mode passes spots (sharing riders), status
  taps incl. EMERGENCY, quick replies and typed messages (in parts) between riders on the ride over
  Bluetooth LE, relayed up to 6 hops; a phone with service bridges the server's view to riders with
  none; delivered/seen receipts feed the tap card (Reached over Bluetooth, Seen by) and chat shows
  Via Bluetooth; the first phone with signal uploads spots, taps, messages and receipts; the radio
  idles with service and no peers or on Max Battery Saver. `core/nearby.ts`, `lib/nearby.ts`,
  `modules/onmylead-nearby` (Swift + Kotlin), migrations `20261104060000_bluetooth_sharing.sql`,
  `20261104100000_bluetooth_mesh.sql`. You > Bluetooth Sharing switch; **[flag]**
  `bluetooth_sharing`. Apps only (not the website).

### Chat and Polls
- Ride chat to everyone or to the leader only, in-app pop-ups, resolve / clear messages.
- Polls in ride chat (create **[Pro]**, vote free) **[flag]**.
- Report and block from chat.

### Routes, Waypoints, Directions
- Route builder (`/ride/[id]/route`): tap points, Follow Trails (snaps to OSM trails and roads) or
  Straight Line, drag, search, undo, clear, save / remove; web wide layout ≥ 900 px.
- Import GPX **[Pro]**. No GPX export.
- Waypoints (shared or only you, press and hold, at my location) and numbered Planned Stops. 15 waypoint symbols, color-blind friendly, shown on planned stops too (2.0).
- 2.1: press and hold in Map Mode too (private Map Mode waypoints on the device, backed up with Sync; the live ride's when sharing location with one), and New Waypoint Alerts: riders' phones ding when the leader shares a waypoint or planned stop during a live ride.
- Directions to the meeting point, a rider or a waypoint in Apple Maps or Google Maps.
- Fuel range on the ride (route length vs each rider's machine range).

### Maps
- `react-native-maps`: Apple Maps on iOS; Google Maps on Android **[Android gap]** (no Maps API
  key configured, so maps are blank on Android today).
- Every map on Mapbox (2.1; needs the Mapbox token, Admin flag mapbox_maps): Ride Mode, Map Mode, route builder, waypoints, Find a Ride, area picker, website meeting point and a live website Ride Mode map; Standard (Free) / Satellite / Topo / 3D Terrain looks; the 2.0 Apple, Google and Leaflet maps stay as the fallback.
- 3D Terrain (2.1, Mapbox; needs the Mapbox token): Ride Mode and Map Mode on all devices and the website's Map Mode, contours and peaks in feet, Offline Maps 3D downloads, Admin flag terrain_3d.
- Park Trails (2.1): the trails of 55 offroad parks and OHV areas from OpenStreetMap (`core/park-trails.ts`, table `park_trails`, import `scripts/parks/import.mjs`), on every map for everyone, colored by the park's level, park names from far out, tap card, Park Trails switch; Admin > Park Trails.
- Layers: Satellite, Topo, public Trails and roads (OpenFreeMap / OSM tiles, attribution). Trail name tags, Forest Service names and numbers, and closed trails and roads in red (FS closed roads, BLM OHV-closed routes, OSM access=no, today's FS seasonal closures); same layers and panel on the website's route builder, waypoints and Find maps (1.0.1 / next website deploy).
- Map Features (2.1): the layers panel's Roads (highways, paved public roads, dirt roads, street-legal only), Trails (off-road, width-limited, hiking, closures, rider trails, park trails) and Land (national forests, BLM land, national and state parks from PAD-US; Texas property lines) switches, synced across devices; tap the map with land on for a land card (core/map-features.ts).
- Offline maps (`/maps`, `/maps/area`): download an area or a ride's area, sizes, delete **[Pro]**;
  app only.
- Place search (search a place or address) on create, find and route builder.

### Navigation Mode (Navigate)
- Offroad map for solo riding, `app/src/app/nav/` **[flag nav_mode]**: Explore (speed, elevation,
  follow a trail with distance left), Record (foreground GPS with keep-awake, pause, crash-safe
  in-progress store; apps only), Measure (distance finder along trails or straight, save as a trail).
- My Trails on the device (`lib/nav-trails.ts`, photos in `lib/trail-photo-files.ts`); trail details
  (difficulty, vehicles, surface, season, width, one way, notes, up to 6 photos).
- Share with Everyone (`shared_trails`, trail-photos bucket, ends trimmed 200 m), rider trails as mint
  dotted lines on every map (switch in layers and on the You tab), ratings (quality, line accuracy),
  auto-hide with a push to the mapper, Admin > Rider Trails. Migration 20261101600000_nav_trails.sql.
- Plan a Group Ride on This Trail and Use One of My Trails (route source `trail`, free).
- 2.0: renamed **Map Mode**; Measure is the **Draw** tab (Map a Custom Trail, `?draw=1`, with the How
  Custom Trails Work sheet); **Track Line** (`core/track-line.ts`, `lib/track-line.ts`: per-day
  colours, 7 days, phone only); named spots (`core/obstacles.ts`, `shared_trails.obstacles`); shared
  trails full length, **Hide My Start** trims 200 m on recordings. Migration 20261102300000_home_feed.sql.

### Home Screen (Rides Tab, 2.0)
- `app/(tabs)/index.tsx` + `components/home/*`: Join a Ride hero with the code box, Create a Ride
  with rides left this month, Find a Ride with the count near you, Map Mode card, Your Next Ride,
  Ride Invites, Your Group, Public Rides Near You (remembered radius, never prompts for location),
  Feed with Customize (`home_feed`, `rider_feed_settings`) **[flag home_feed]**, Your Badges, Your
  Toolkit, Help & Support. Two columns at Expanded width.

### Badge Leaderboard (2.1)
- `app/leaderboard.tsx` (your place, Everywhere / country / state filters, the board, Show Me on the
  Leaderboard; TwoPane on tablets) and `app/leaderboard-area.tsx` (Where You Ride: country search,
  state or province for US / CA / MX / AU, Use My Location on the apps). Rules in
  `core/leaderboard.ts` and `core/areas.ts`; server `badge_leaderboard`, `badge_leaderboard_areas`,
  `my_leaderboard_settings`, `set_leaderboard_settings` (migration 20261104050000). Opened from
  Badges and Home's Your Badges.

### Social (2.0)
- `app/social/index.tsx` (Activity / Friends / My Posts; TwoPane on tablets), `social/item.tsx` (one
  item with likers and every comment), `social/rider/[id].tsx` (profile, PRO tag, stats, timeline),
  `social/new.tsx` (post with one photo). Likes free; comment, post and share **[Pro: social_posts]**.
  Share to other apps via a generated card (`lib/share-activity*.ts`). Tap any profile picture for
  full size (`components/photo-viewer.tsx`). Migration 20261102900000_social_hub.sql.
- 2.1: like (free) and reply (Pro) on every comment, replies one level deep under their comment
  (`components/social/comment-thread.tsx`, migration 20261104220000_comment_likes_replies.sql);
  Home Feed posts show their photo.

### Riding Groups and Social
- Groups tab: New Group, your groups, groups you're in, group chat with unread counts and ride
  "tickets", group links (`/g/[code]`), invite a group to a ride, leave / delete **[Pro]** to
  create.
- Group Photos (2.1): the group's maker adds, changes or removes a 16:9 group photo (group page);
  shown on the group page, Riding Groups, Home Your Group, Invite a Group and the `/g/[code]` link.
  Admin removes one from the rider's page.
- Follow leaders and see their upcoming rides.
- Blocked riders list; report rider or ride; You > Report a Rider (2.0) for anyone you messaged, friended, rode with or blocked.

### Events (2.0)
- Events card on Home opens Events: public events coming up near you and Yours (hosting, co-hosting, going or interested).
- Event page (onmylead.com/e/CODE, works signed out): dates, public place with Directions, photos, details, website, Going / Interested, Share, an Agenda by day (group rides, poker runs, concerts, raffles, shows, contests, food, vendors, meetups), and the event's Group Rides with labels and a Ride Manager each.
- Pro creates events (Public or Link Only); the owner adds up to 10 co-hosts; hosts add photos, agenda items and the rides they organize; a Ride Manager becomes the ride's Co-Organizer. Cancel or delete; Report This Event; Admin > Events hides events and takes down photos.
- Invite a Group (3.0): hosts tap Invite All next to a saved riding group on the event page; everyone gets a notification that opens the event.

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
- Refer a friend (2.1): Invite Friends; a new rider who joins with your friend link and finishes a first ride earns you both Pro Annual at 50% off year one (Apple offer code, Google Play offer, or a 6-month Play bill deferral). Admin > Referrals.
- Android shows "Subscriptions are managed in the OnMyLead iPhone app" **[Android gap]**: no
  Google Play Billing, no Play verification, no Play promo codes. A Pro entitlement bought on
  iPhone already applies on any device (server side, `my_entitlements`).

### Website (onmylead.com)
- Showcase home (live group-map hero, features, Free vs Pro, promo film), Get the App.
- Ride and group link previews, family link, web ride creation and route setup, sign-in.
- Contact form, Support, Terms, Rider Safety Agreement (/rider-agreement, asked after sign-in from 2.0), Privacy; Help Center at /help.
- Before You Ride (2.0): every rider agrees to the Rider Safety and Liability Agreement on first launch (all devices) and again when it changes; Admin > Rider Agreements lists and exports the permanent records.

### Admin Dashboard (onmylead.com/admin)
- Overview, Signups and Downloads (real riders without test and admin accounts, marking test
  accounts, App Store and Google Play downloads), Store Reviews (both stores' ratings and reviews,
  replies posted to the store), Users (comp Pro, extend trial, revoke, suspend, delete), Rides (remove), Trials,
  Subscriptions, Promo Codes (App Store Connect offer codes), Reports (2.0: report page with the saved conversation, suspend 1/7/30/90 days or ban), Analytics, App Health
  (Sentry, push tokens by iPhone / Android, server checks), Exports, Settings (trial days, feature
  plans, flags, banners), Releases (halt / resume / widen the Google Play rollout, pause / resume
  the App Store phased release, minimum and latest app version, a notice for chosen versions;
  `docs/release-rollback.md`), Audit log, Contact messages, Help Center editor.
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
