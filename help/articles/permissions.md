---
title: Check and Fix App Permissions
summary: See every permission OnMyLead uses in one place, which ones are off, and turn them back on with one tap.
category: troubleshooting
order: 15
release: "3.1"
updated: 2026-11-19
sources:
  - app/src/app/permissions.tsx
  - app/src/core/permissions.ts
  - app/src/lib/permissions.ts
  - app/src/lib/permissions.web.ts
  - app/src/hooks/use-permissions.ts
related: [troubleshooting, accurate-location, bluetooth-sharing, notification-settings, location-sharing, tilt-and-crash-alert]
keywords: [permissions, privacy, allow, denied, settings, bluetooth permission, location permission, always, notifications off, camera, motion, nearby devices, troubleshoot]
---

When something doesn't work, like riders not showing over Bluetooth or alerts not arriving, the cause is often a permission that was turned down. **You > Settings > Permissions** lists every permission OnMyLead uses on this device, what your phone says about each one right now, and fixes it with one tap.

## Open Permissions

1. Tap **You**.
2. Under **Settings**, tap **Permissions**. The row says whether everything a group ride needs is allowed, or how many permissions need your OK.

The top of the page shows a light for each permission, green when it's allowed and amber when a group ride needs it and it's off, with **Ready to Ride** when nothing is missing.

## What Each Permission Is For

**Needed for Group Rides**

- **Location**: shows you on the map and shares your spot with your ride.
- **Location While Locked** (iPhone and iPad): keeps sharing with your phone locked on the mount. Needs Location set to **Always**.
- **Precise Location**: without it, your dot can show a mile or more from where you are. See [Make Your Location Accurate](/help/accurate-location).
- **Google Location Accuracy** (Android): without it, some Android phones place you miles off.
- **Notifications**: status taps, EMERGENCY alerts, chat and ride changes.
- **Bluetooth**: passes spots, taps and EMERGENCY between riders when there is no service. See [Share With Nearby Riders With No Service](/help/bluetooth-sharing).
:::release 4.0
  It also connects to your own Meshtastic radio if you pair one. See [Share Over a Meshtastic Radio](/help/radio-sharing).
:::

**Optional**

- **Motion and Fitness** (iPhone and iPad): the tilt meter and Crash Alert.
- **Camera**: taking a profile, garage, event or group photo. Choosing a saved photo never needs Photos access: you pick each photo, and only that one is shared.
- **Apple Music** (iPhone and iPad) or **Notification Access** (Android): song names and controls in [Music Controls](/help/music-controls).
- **Local Network** (iPhone and iPad): lets the [Starlink](/help/starlink) page reach your dish.
- **Ad Measurement** (iPhone and iPad): Apple's Allow Tracking. See [Ad Measurement](/help/ad-measurement).

Bluetooth, Music and Local Network only show when those features are on in the app.

## Turn One Back On

Tap the row. What happens depends on your device:

- **Allow** shows the phone's own question again, when the phone can still ask.
- **Open Settings** opens OnMyLead's page in your phone's Settings app. Turn the permission on there, then come back: the list updates by itself.

**iPhone and iPad:** Apple shows each question only once. After you tap **Don't Allow**, only the Settings app can turn it back on, so those rows open OnMyLead in Settings. Apple doesn't let apps read the Local Network permission, so that row always says **Check in Settings**.

**Android phones and tablets:** Android asks again until you turn a permission down twice. After that, the row opens OnMyLead in Settings. Notification Access for Music Controls is always a Settings page.

If location is off for the whole phone, the page says so at the top: turn on **Location Services** (iPhone and iPad: **Settings > Privacy & Security > Location Services**) or **Use Location** (Android: **Settings > Location**).

**Open OnMyLead in Settings** at the bottom of the page goes straight to OnMyLead's page in Settings.

## On the Website

The website only uses your browser's location. Permissions shows it, and tapping **Allow** shows the browser's question. If your browser blocked it, allow location from the lock or settings icon next to onmylead.com in the address bar, then reload the page.

## On a Tablet

On an iPad or Android tablet held sideways or a wide window, the needed and optional permissions sit side by side.
