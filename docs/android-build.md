# Building the Android App

One Android app, `com.rusoffroad.onmylead.app`, for Android phones and tablets, built from the
same `app/` code as the iPhone app (see `CLAUDE.md`). It is built with Expo prebuild and Gradle on
Chris's Mac, like the iPhone app is built with Xcode there. Never commit `app/android/`,
`app/google-services.json`, keystores or keys.

## What Chris sets up once

Each of these is a login or a secret only Chris can create. None of them goes in the repo.

| # | What | Where it goes | Unlocks |
|---|---|---|---|
| 1 | Google Play Developer account (`docs/google-play-account.md`) | Play Console | Uploads, Play App Signing |
| 2 | Google Cloud project with **Maps SDK for Android** enabled and an API key restricted to Android apps, package `com.rusoffroad.onmylead.app` plus the SHA-1 of the upload key and the Play signing key. The Android Maps SDK has no usage charge, but Google requires a billing account on the project | `GOOGLE_MAPS_ANDROID_API_KEY=...` in `app/.env` on the Mac | Maps (blank without it) |
| 3 | Firebase project (it can be the same Google Cloud project), Android app `com.rusoffroad.onmylead.app` added, `google-services.json` downloaded | `app/google-services.json` on the Mac (git ignores it) | Push token on Android |
| 4 | Firebase service account key: Firebase console > Project settings > Service accounts > Generate new private key | `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat key.json)"` from the Mac thread, then delete the file | Server sends Android pushes |
| 5 | Upload keystore (`keytool -genkeypair -v -storetype PKCS12 -keystore ~/keys/onmylead-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), kept outside the repo and backed up | `~/.gradle/gradle.properties` (below) | Signed release bundles for Play |
| 6 | The SHA-256 fingerprints of the upload key and of the Play App Signing key (Play Console > Setup > App signing). They are public values | `app/public/.well-known/assetlinks.json` in a pull request, then a website deploy | Ride and group links open the app |

`~/.gradle/gradle.properties` on the Mac:

```properties
ONMYLEAD_UPLOAD_STORE_FILE=/Users/chris/keys/onmylead-upload.jks
ONMYLEAD_UPLOAD_STORE_PASSWORD=...
ONMYLEAD_UPLOAD_KEY_ALIAS=upload
ONMYLEAD_UPLOAD_KEY_PASSWORD=...
```

Without these properties release builds are signed with the debug key, which is fine for testing
on a phone but can't be uploaded to Play.

## Build

Needs Android Studio (for the SDK and an emulator) and JDK 17 on the Mac.

```sh
cd ~/Developer/OnMyLead/app
git pull && npm ci
npx expo prebuild --platform android --clean   # writes app/android (ignored by git)
cd android
./gradlew assembleRelease     # APK to install on a test phone: app/build/outputs/apk/release/
./gradlew bundleRelease       # AAB for Google Play: app/build/outputs/bundle/release/
```

`app/plugins/with-android-setup.js` reads the Maps key, the Firebase file and the signing
properties at prebuild; re-run prebuild after changing any of them. Install on a phone with USB
debugging on: `adb install -r app/build/outputs/apk/release/app-release.apk`.

Every Play upload needs a higher `android.versionCode` in `app/app.json` (a pull request first,
like `ios.buildNumber`). Bumping it never touches the iPhone build.

## What the first Mac build must check

The cloud can't compile Kotlin, so these were set up but not yet built:

1. `npx expo prebuild --platform android --clean` and `./gradlew assembleRelease` succeed.
2. `AndroidManifest.xml` has no `ACCESS_BACKGROUND_LOCATION`, `RECORD_AUDIO` or
   `SYSTEM_ALERT_WINDOW`, and has the `https://onmylead.com/r/` and `/g/` intent filter with
   `autoVerify`.
3. Maps: satellite, topo and trails show on the Find map and in Ride Mode.
4. Location: start sharing on a ride, allow **While Using the App**, see the **Sharing Your
   Location** notification, lock the phone for five minutes and check the dot keeps moving on
   another phone. Stop sharing and check the notification goes away.
5. Push: sign in, allow notifications, then from another phone send ride chat and a **Need Help**
   tap. Both arrive with the app closed; tapping opens the ride. Check the Rider Alerts, Ride Chat
   and Ride Updates categories in Settings > Apps > OnMyLead > Notifications.
6. App Links (after step 6 above and a website deploy): `adb shell pm get-app-links
   com.rusoffroad.onmylead.app` shows `onmylead.com: verified`, and a ride link from a text
   message opens the app.
7. Keyboard: in a sheet with a text box (ride chat, Add Waypoint), the box stays above the
   keyboard; Back closes the keyboard.
8. Cross-platform: one ride with an iPhone and an Android phone, each sees the other live.

## How the pieces fit

- **Maps:** react-native-maps uses Apple Maps on iPhone and the Google Maps SDK on Android, so
  every map screen stays shared. The topo base map, trails and offline maps are our own tile
  layers on top and work the same on both.
- **Push:** the app registers its FCM token with `register_push_token(token, 'android')`
  (`app/src/lib/push.ts`); `notify-ride-message` sends iPhone tokens to APNs and Android tokens to
  FCM (`supabase/functions/_shared/fcm.ts`) as data messages that expo-notifications shows in the
  Rider Alerts, Ride Chat or Ride Updates channel. No database change was needed.
- **Location:** a foreground service with While Using permission (`app/src/lib/location.ts`); see
  `docs/development-standards.md` section 5.
- **App Links:** `android.intentFilters` in `app/app.json` plus
  `app/public/.well-known/assetlinks.json`, served as JSON by `deploy/nginx.conf`. Email links
  (`/auth-callback`) stay in the browser on Android: Android's link filters can't tell our email
  links from the website's Google and Facebook sign-in returns, which must stay in the browser.
