# OnMyLead: Google Play Listing, Data Safety, Content Rating and Declarations

Written 2026-10-14 by the "Google Play and iPad Store Prep" thread. Everything below is ready to
paste into Play Console once the developer account exists (`docs/google-play-account.md`). It
mirrors the App Store listing (`store/app-store/listing.md`) and the in-app Pro screen prices
(`app/src/constants/site.ts`); when either changes, change this file in the same pull request.

Nothing here is submitted anywhere. Creating the app, every testing track and every release waits
for Chris's typed OK (`CLAUDE.md` Rule 7). What Chris clicks, in order: `play-console-checklist.md`.

**Before the first Play release, these must be true** (owned by the Android thread, tracked in
`docs/feature-parity.md`): Play Billing works and the server verifies it (F42, F43), push works
through FCM (F40), Google Maps shows on Android (F27, D05), the privacy policy names Google (Play
Billing, Firebase Cloud Messaging, Google Maps) next to Apple, and shared screens no longer say
"iPhone" or "Apple" where Android riders read them (D08). Until then, only internal testing.

## Store Listing (Main Store Listing)

| Field | Value |
|---|---|
| App name (30) | OnMyLead |
| Package name | com.rusoffroad.onmylead.app (same as iOS) |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | Free (Pro is an in-app subscription) |
| App category | Maps & Navigation |
| Tags (up to 5) | Navigation, GPS, Off-road, Group travel, Outdoor (pick the closest tags Play offers) |
| Contact email | support@rusoffroad.com |
| Website | https://onmylead.com |
| Phone | Optional; leave blank unless Chris wants one public |
| Privacy policy | https://onmylead.com/privacy |
| Developer name | RUS Offroad |

### Short description (80)

Group rides on one live map, plus Map Mode, Crash Alert, Events and Social.

(75 characters. Updated for 2.0.)

### Full description (4000)

Paste as is (updated for 2.0, 3375 characters). It is the App Store description with the Apple-only wording changed for Google Play
(subscription paragraph, terms link, "phone" instead of "iPhone").

```text
OnMyLead keeps a group ride together. Side-by-sides, Jeeps, dirt bikes, ATVs or trucks: the leader creates the ride, riders join with a code, a link or a QR code, and everyone sees each other on one live map until the ride ends.

NEW IN 2.0
• A new Home: Join a Ride up front, public rides near you, your group and a Feed of your friends' rides
• Map Mode: your offroad map for solo rides, with custom trails, Track Line and named spots
• Tilt Meter and Crash Alert: roll and pitch on the map, and a hard hit or rollover starts an I'm OK countdown before your group is alerted
• Events: rallies, poker runs and ride weekends with an agenda and group rides to join
• Social: like and comment on friends' rides, badges and trails, and post ride reports
• Badges and ranks from Rookie to Legend, plus the Founder and Brand Ambassador badges
• Light mode, four themes and Color Blind Mode
• 12 languages, and your trails and settings sync across your devices
• Invite Friends: when a new rider finishes their first ride, you both save on Pro Annual

PLAN THE RIDE
• Create a ride in seconds with a meeting point, a time and an optional route
• Draw a route that follows the trail, add waypoints and planned stops, or import a GPX file
• Trail width limits tell you if your machine fits
• Check every rider's fuel range against the route before you leave
• Ride Day card with the weather, sunrise and sunset for the meeting area

ON THE TRAIL
• Ride Mode puts the live group map and big status buttons on one screen
• The leader line shows the leader on the left, the tail gunner on the right and everyone in between
• Regroup Here, Need Help, Mechanical Issue and EMERGENCY reach the whole group with one tap
• Ride Bubble tells the leader when someone falls behind
• Spoken alerts, ride chat, quick polls, Follow Me, Full Map and Music Controls
• Offline maps keep the map and route on screen when you lose service, and every rider's dot shows how fresh it is

RIDING GROUPS AND FRIENDS
• Keep your regular crew in a group with its own chat, and invite them all in one tap
• Add friends, message them and see who's out riding nearby, without sharing where you are

YOUR PRIVACY
• Your location is shared only with the ride you join, only while you are sharing, and sharing always ends
• Public rides show a rounded meeting area, never your exact spot
• Report or block any rider

OnMyLead is free to ride: join as many rides as you like, follow the leader, use Ride Mode and every safety feature, create one ride a month and use Map Mode 8 hours a month. Every new account gets 30 days of OnMyLead Pro with no payment and no automatic charge.

OnMyLead Pro adds unlimited rides and Map Mode, Android tablets and the website, routes, waypoints, map layers, trail recording and sharing, offline maps, GPX import, events, themes, sync and more: $4.99 a month or $29.99 a year (US prices). Payment is charged to your Google Play account. Subscriptions renew automatically until you cancel, and you can manage or cancel them any time in Google Play > Payments & subscriptions. Pro bought on one store works on every device you sign in to.

Terms of Use: https://onmylead.com/terms
Privacy Policy: https://onmylead.com/privacy

OnMyLead is not an emergency service, and Crash Alert never calls 911. In an emergency, call 911 or your local emergency number first.

Made by RUS Offroad.
```

Check before pasting: "Pro bought on one store works on every device" is true only once F46
ships. If it has not at the first Play release, delete that sentence (the rest is true today on
Android builds that pass the conditions above).

### What's new (500), version 2.0

The same text as `whatsNew` for 2.0 in `help/release-notes.json` (498 characters):

```text
What's new in 2.0:

• New Home with a Feed of your friends' rides.
• Social: like, comment and post.
• Events: rallies and ride weekends.
• Map Mode: custom trails, Track Line.
• Tilt Meter and Crash Alert.
• Smoother Ride Mode, Full Map, Follow Me.
• Light mode, 4 themes, Color Blind Mode.
• 12 languages. Sync across devices.
• Invite Friends: both save 50%.
• Founder and Ambassador badges.
• Trail width limits, waypoint symbols.
• Notifications bell, Music Controls.
• New Free and Pro plans.
```

### Graphics

| Asset | Spec | File |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit, no transparency needed | Export from `app/assets/images/icon.png` (1024) at 512 |
| Feature graphic | 1024 × 500 PNG or JPEG | `store/google-play/feature-graphic.png` |
| Phone screenshots | 2 to 8, 9:16, at least 1080 px wide | `store/google-play/screenshots/phone/` 01 to 08, 1080 × 1920 |
| 7-inch tablet screenshots | up to 8, 9:16 or 16:9 | `store/google-play/screenshots/tablet-7/` 01 to 08, 1920 × 1200 |
| 10-inch tablet screenshots | up to 8, 9:16 or 16:9 | `store/google-play/screenshots/tablet-10/` 01 to 08, 2560 × 1600 |
| Promo video | YouTube URL, optional | Chris's promo film if he puts it on YouTube; otherwise leave blank |

Upload each set in file order, replacing the 2.1 set. Each shows the real app screen, rendered
from the shared code with mock data, inside a plain Android-style frame with the same captions as
the App Store set (3.0: the first 8 of the 10, Ride Mode, Home, Map Mode, Ride Mode buttons,
Bluetooth, Emergency Siren, Rides, Events). Remake them with `bash store/tools/web-shots/shots.sh OUT_DIR`.

## App Content (Policy > App content)

### Privacy policy
https://onmylead.com/privacy

### Ads
Does the app contain ads? **No.**

### App access
**All or some functionality is restricted** (sign-in required). Add instructions:

- Name: App Review demo account
- Username: appreview@rusoffroad.com
- Password: the same one App Review uses (only on the Mac at
  `~/Developer/OnMyLead-private/app-review-login.txt`; type it in Play Console, never in GitHub)
- Other information (paste):

> Sign in with email and password. The account has Pro and one upcoming ride, "App Review Test
> Ride". Open it from Home, tap Start Ride, then Enter Ride Mode to see the live map and status
> buttons. EMERGENCY only alerts riders on the ride; it does not contact emergency services.

### Content rating (IARC questionnaire)

- Email for the rating certificate: support@rusoffroad.com
- Category: **All Other App Types** (not a game, not social networking or communication as the main purpose)
- Violence, fear, sexuality, language, controlled substances, gambling, crude humor: **No** to all
- Does the app allow users to interact or exchange content? **Yes** (ride chat, group chat, ride details, Garage photos)
- Does the app share the user's current physical location with other users? **Yes**
- Does the app allow users to purchase digital goods? **Yes** (Pro subscription)
- Is the app a web browser or search engine? **No**
- Does the app contain news? **No**
- Expected result: Everyone / PEGI 3 with the interactive elements "Users Interact", "Shares
  Location", "In-App Purchases" (some regions may show Teen / 12+). Matches Apple's 13+ in spirit;
  the Terms still say 13 and older.

### Target audience and content
- Target age groups: **18 and over** only. Riders drive their own vehicles and the app shares live
  location with other riders, so OnMyLead is designed for adults; the Terms still allow 13 and
  older to use it, as on the App Store. (Picking 13–17 adds Google's teen-audience review and
  isn't needed for riders who ride with a parent.)
- Could the app unintentionally appeal to children? **No.**
- This keeps OnMyLead out of the Families program, which it doesn't need.

### News app
**No.**

### COVID-19 contact tracing and status app
**No.**

### Data safety

Derived from the App Store privacy answers (`store/app-store/listing.md`), the iOS privacy
manifest (`app/app.json` `ios.privacyManifests`) and the Privacy Policy (`app/src/app/privacy.tsx`).
Under Google's definitions, data sent to service providers that run the app (Supabase, Sentry,
Resend, Google Firebase Cloud Messaging) and data a rider chooses to show other riders is
**collected, not shared**.

Overview questions:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS/TLS only) |
| Which account creation methods does your app support? | Username and password; OAuth (Google, Apple, Facebook); email link (other) |
| Do you provide a way for users to request that their data is deleted? | Yes |
| Delete account URL | https://onmylead.com/support (the "Deleting Your Account" section; riders can also email support@rusoffroad.com) |
| Can users request some data be deleted without deleting their account? | Yes (delete rides, messages, Garage machines and photos, groups, trips; stop sharing location) |
| Has your app completed an independent security review (MASA)? | No |
| Is your app designed for families? | No |

Data types (every row: **Collected: Yes, Shared: No, Processed ephemerally: No**):

| Data type | Required or optional | Purposes |
|---|---|---|
| Location > Precise location | Optional (riders can join and chat without sharing) | App functionality |
| Personal info > Name (the ride name, and the social profile name if the rider turns on Show My Profile) | Required | App functionality, Account management |
| Personal info > Email address | Required | App functionality, Account management, Developer communications |
| Personal info > User IDs | Required | App functionality, Account management |
| Financial info > Purchase history | Optional (only riders who buy Pro) | App functionality, Account management |
| Messages > Other in-app messages (ride chat, group chat, polls, Contact Us) | Optional | App functionality |
| Photos and videos > Photos (Garage photos the rider picks) | Optional | App functionality |
| App activity > App interactions (basic usage events, such as a ride being created) | Required | Analytics |
| App activity > Other user-generated content (rides, routes, waypoints, Garage, trips) | Optional | App functionality |
| App info and performance > Crash logs (Sentry) | Required | App functionality (fixing crashes) |
| App info and performance > Diagnostics (Sentry performance data) | Required | App functionality |
| Device or other IDs (push token) | Optional (only with notifications on) | App functionality |

Not collected: approximate-only location (the app asks for precise), phone number, physical
address, race, political or religious beliefs, sexual orientation, other personal info, payment
card info (Google handles payment), credit score, other financial info, health, fitness, emails,
SMS, audio, music, video, files and docs, calendar, contacts, web browsing history, installed
apps, search history (place searches go to Photon without who the rider is and aren't stored),
advertising ID.

Notes:
- Location is collected only while the rider is sharing with a ride (or a family link they made),
  including with the phone locked through the location foreground service and its notification.
  The app never asks for background location ("Allow all the time"), so there is no background
  location declaration.
- Music Controls (1.0.4): reading what is playing (song, artist, app) and changing the media
  volume happen only on the phone and nothing is sent anywhere, so it is not "collected" and the
  answers above don't change. The optional Notification Access (a `NotificationListenerService`
  that ignores every notification) is used only to read media sessions; Play has no declaration
  form for it. If review asks: "Used only for in-app music controls (MediaSessionManager); no
  notification content is read, stored or transmitted."
- Social sign-in: only the email, name and profile photo the rider allows reach OnMyLead, covered
  by the rows above (profile photo falls under Photos only if Play asks; it's shown only when Show
  My Profile is on).

### Government apps
**No.**

### Financial features
**My app doesn't provide any financial features.**

### Health apps
**My app does not have any health features.**

### Advertising ID
Does the app use the advertising ID? **No.** Make sure the Android build doesn't declare
`com.google.android.gms.permission.AD_ID` (the Android thread checks the merged manifest).

## Sensitive Permission Declarations

### Location permissions
No background location declaration is needed: the Android build blocks
`ACCESS_BACKGROUND_LOCATION` (`app/app.json` `android.blockedPermissions`, PR #99) and asks only
for location "While using the app". Live sharing keeps running with the phone locked through the
location foreground service below, which Android counts as foreground use because the rider
starts it from the app. If a later build ever adds background location back, this section needs
Google's background location declaration, an in-app disclosure screen and a demo video first.

### Foreground service (location)

Android 14 requires a foreground service type, and Play Console asks for each type the build
declares.

- **Foreground service type:** `location` (`FOREGROUND_SERVICE_LOCATION`), from `expo-location`'s
  `isAndroidForegroundServiceEnabled: true`.
- **Task (paste):** Keeps sharing the rider's live position with their group ride while the phone
  is locked or the rider switches apps. Starts when the rider turns on sharing for a ride, shows a
  persistent "Sharing Your Location" notification (tap it to see who can see you or stop), and stops when the sharing timer
  ends, the rider stops sharing, leaves, or the ride ends.
- **User impact if deferred or interrupted:** The group would lose sight of the rider mid-ride; the
  leader couldn't tell a rider fell behind and an emergency message wouldn't carry a current
  position.
- **Video (YouTube unlisted link, if Play Console asks):** recorded on an Android phone from the
  internal test build: open a ride, tap Start Ride, turn on sharing, show the "Sharing Your
  Location" notification, lock the phone, and show the rider's dot still moving on a second phone.
  Claude scripts it; Chris approves before it is sent.
- If the build declares any other type (for example `remoteMessaging` from a push library), the
  Android thread removes it or this file adds its declaration.

### Photo and video permissions
OnMyLead only lets riders pick one Garage photo. The Android build must use the Android photo
picker (no `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`), so no declaration is needed. If the merged
manifest still lists those permissions, the Android thread strips them; Play rejects one-time
photo use with broad media access.

### Other permissions the build will show
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`: location sharing and the map (covered above).
- `POST_NOTIFICATIONS`: ride messages and status alerts.
- `INTERNET`, `ACCESS_NETWORK_STATE`: normal, no declaration. The Starlink page talks to the dish
  at 192.168.100.1 on its own Wi-Fi; Android needs no extra permission for that.
- No `CAMERA`, `RECORD_AUDIO`, `READ_CONTACTS`, `SMS`, `CALL_LOG`, `QUERY_ALL_PACKAGES`,
  `SCHEDULE_EXACT_ALARM` or accessibility service. If a library adds one, remove it rather than
  declaring it.

## Subscriptions (Monetize > Products > Subscriptions)

Same product IDs as Apple so the server maps both stores to one Pro. Base plan IDs use letters,
numbers and hyphens only.

| Product ID | Name | Base plan ID | Billing period | Price (US) | Renewal | Offers |
|---|---|---|---|---|---|---|
| `com.rusoffroad.onmylead.pro.monthly` | Pro Monthly | `monthly` | 1 month | $4.99 | Auto-renewing | None |
| `com.rusoffroad.onmylead.pro.annual` | Pro Annual | `annual` | 1 year | $29.99 | Auto-renewing | None |

- Benefits (up to 4 lines, shown in Play's subscription screens): Unlimited rides; Offline maps
  and GPX import; Saved riding groups and polls; Full ride history and premium ride cards.
- Prices in other countries: let Play convert from the US price ("Set prices" > use the US price
  for all countries), the same as Apple's automatic pricing.
- No free trial or introductory offer in Play: OnMyLead's own 30-day Pro Trial is granted by the
  server and never charges, the same as on the App Store.
- Grace period: 7 days (Play default for monthly is 3; set 7 for both so a failed card doesn't drop
  Pro mid-trip). Account hold: on (default).
- Resubscribe: on. Proration when switching monthly ↔ annual: Play default (charge the full price
  of the new plan at the next renewal date for a downgrade, immediately with prorated credit for an
  upgrade).
- Promo codes: Play Console > Monetize > Promo codes, with a subscription "free trial" type
  promotion. Same names as the Apple offer codes so Chris can hand out either.
- Real-time developer notifications: Monetize > Monetization setup > Google Play Real-time
  developer notifications topic = the Pub/Sub topic the Android thread creates for its Play
  verify function. Until that function is deployed, keep the subscriptions **inactive**.
