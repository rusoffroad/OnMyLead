# Play Console Checklist

What happens in Play Console after Chris's developer account exists
(`docs/google-play-account.md` steps 1 to 3). Claude does every step it can through the service
account Chris invites; the steps marked **Chris** are clicks only he can make. Nothing goes beyond
**internal testing** without Chris's typed OK, and nothing is sent to Google review without it
(`CLAUDE.md` Rule 7). Paste-ready text for every form is in `listing.md`.

Status marks: ⬜ not done, ✅ done. Update this file as steps are done.

## 0. Ready Before Play Console (repo and Mac)

| | Step | Who |
|---|---|---|
| ⬜ | Android build pipeline: `npx expo prebuild --platform android` + Gradle release build on the Mac (or EAS), producing an `.aab` (tracker D04) | Android thread + Mac |
| ⬜ | Upload key: generate `onmylead-upload.keystore` on the Mac, keep it and its passwords in `~/Developer/OnMyLead-private/` and the Mac keychain, never in the repo or chat | Mac, with Chris's OK |
| ⬜ | Google Maps API key restricted to the package name and the upload + Play signing SHA-1s (D05) | Android thread; Chris accepts Google Cloud terms if asked |
| ⬜ | Firebase project for FCM; `google-services.json` stays out of the repo (D06) | Android thread |
| ⬜ | Merged manifest check: no `AD_ID`, no `READ_MEDIA_*`, no `ACCESS_BACKGROUND_LOCATION`, only the `location` foreground service type (`listing.md` "Sensitive Permission Declarations") | Android thread |

## 1. Create the App

| | Step | Who |
|---|---|---|
| ⬜ | Home → Create app: name **OnMyLead**, default language **English (United States)**, **App**, **Free** | Claude fills in |
| ⬜ | Tick the Developer Program Policies and US export laws declarations and press **Create app** | **Chris** |

Free can't be changed to paid later, which is fine: Pro is a subscription.

## 2. Set Up the App (Dashboard → "Set up your app")

| | Step | Source |
|---|---|---|
| ⬜ | App access: demo account instructions (password typed on the Mac) | `listing.md` App access |
| ⬜ | Ads: No | `listing.md` |
| ⬜ | Content rating questionnaire, then **Submit** the rating (free, instant, not an app review) | `listing.md` Content rating |
| ⬜ | Target audience: 18 and over; not appealing to children | `listing.md` |
| ⬜ | News app: No. COVID-19 app: No. Government app: No. Financial features: none. Health: none | `listing.md` |
| ⬜ | Data safety form, then preview it and save | `listing.md` Data safety |
| ⬜ | Advertising ID: No | `listing.md` |
| ⬜ | Privacy policy URL: https://onmylead.com/privacy (after it names Google services, see `listing.md` top) | Android thread updates the page |
| ⬜ | App category: Maps & Navigation; contact details (support@rusoffroad.com, https://onmylead.com) | `listing.md` |
| ⬜ | Main store listing: name, short and full description, icon 512, feature graphic, phone screenshots | `listing.md`, `feature-graphic.png`, `screenshots/phone/` |
| ⬜ | Tablet screenshots (7-inch and 10-inch) | `screenshots/tablet-7/`, `screenshots/tablet-10/` |

## 3. App Signing and Internal Testing

| | Step | Who |
|---|---|---|
| ⬜ | Testing → Internal testing → Create new release. Accept **Play App Signing** (Google keeps the app signing key; we keep only the upload key). Play shows the app signing SHA-1: add it to the Maps API key and Firebase | Claude; Chris confirms the Play App Signing terms if asked |
| ⬜ | Upload the first `.aab` built from `main` with `versionCode` 1 (app.json `android.versionCode`, Android thread) | Mac |
| ⬜ | Testers: create an email list "OnMyLead team" with Chris's Google account (and anyone he names); copy the opt-in link to Chris | Claude |
| ⬜ | Release notes: "First internal test of OnMyLead for Android." | Claude |
| ⬜ | **Roll out to internal testing** (internal testing has no Google review and only testers can install) | Chris's typed OK |
| ⬜ | Chris opens the opt-in link on an Android phone and installs from Play | **Chris** |
| ⬜ | Check the pre-launch report (Play's free robot test on real devices) and fix crashes or accessibility issues it finds | Claude |

## 4. Subscriptions (needs the payments profile from `docs/google-play-account.md` step 2)

| | Step | Who |
|---|---|---|
| ⬜ | Monetize → Subscriptions: create `com.rusoffroad.onmylead.pro.monthly` (base plan `monthly`, $4.99) and `com.rusoffroad.onmylead.pro.annual` (base plan `annual`, $29.99), benefits, grace period 7 days | Claude, from `listing.md` |
| ⬜ | Keep both base plans **inactive** until the server's Play verify function and Real-time developer notifications are deployed (F42) | Claude |
| ⬜ | Monetization setup: Real-time developer notifications topic (Pub/Sub topic from the Android thread) and send a test notification | Claude; the deploy itself runs from the Mac thread with Chris's OK |
| ⬜ | Setup → License testing: add Chris's Google account so his test purchases are free | Claude |
| ⬜ | Activate the base plans and buy Pro once from the internal test build as a license tester; confirm the Admin Dashboard shows the Google purchase | Claude + Chris's tap on the phone |

## 5. Before Any Wider Release (closed, open or production)

| | Step | Who |
|---|---|---|
| ⬜ | Every Android column in `docs/feature-parity.md` that the release claims is ✅ on a real Android phone (GPS, sharing with the phone locked, push, purchases) | Android thread |
| ⬜ | Foreground service (location) declaration, with the demo video if Play asks (`listing.md`) | Claude records; Chris approves the video |
| ⬜ | Help Center: Android steps published behind the Android release gate (`help/release.json`) | Android thread |
| ⬜ | Countries: United States only, matching the App Store | Claude |
| ⬜ | **Send for review / roll out** to production | **Chris's typed OK only** |

An organization account can go straight from internal testing to production; the 12-tester,
14-day closed test only applies to new personal accounts.
