---
title: Make Your Location Accurate
summary: If a rider shows up a mile or more from where they really are, turn on Precise Location and, on Android, Google Location Accuracy, then calibrate.
category: troubleshooting
order: 15
release: "1.0"
updated: 2026-11-04
sources:
  - app/src/core/precise-location.ts
  - app/src/hooks/use-precise-location.ts
  - app/src/lib/location.ts
  - app/src/core/bubble.ts
related: [troubleshooting, location-sharing, ride-mode, ride-bubble]
keywords: [wrong location, miles away, approximate, precise location, google location accuracy, calibrate, compass, gps, accuracy, android, dot in wrong place]
---

OnMyLead shows each rider where their phone says they are. If a rider sitting right next to you shows up a mile or two away, their phone is giving every app a rough location, not just OnMyLead. Open Google Maps or Apple Maps on that phone: if its blue dot is in the same wrong spot, follow the steps below on that phone.

## On Android

1. **Turn on precise location for OnMyLead.** Open **Settings > Apps > OnMyLead > Permissions > Location** and turn on **Use precise location**.
2. **Turn on Google Location Accuracy.** Open **Settings > Location > Location Services > Google Location Accuracy** and turn on **Improve Location Accuracy**. With it off, the phone has only GPS, and indoors or under trees the dot can land miles away.
3. **Calibrate.** Open Google Maps, tap your blue dot and choose **Calibrate**, then follow the steps (it may ask you to point the phone at buildings, or move it in a figure 8).

Menu names differ a little between phone makers. Search Settings for "precise" or "location accuracy" if you can't find them.

## On iPhone and iPad

1. Open **Settings > Privacy & Security > Location Services > OnMyLead** and turn on **Precise Location**.
2. If the dot still wanders, open **Settings > Privacy & Security > Location Services > System Services** and turn on **Compass Calibration**.

## Everywhere

Go outside or near a window with a clear view of the sky for a minute. Then open Ride Mode again: the dot moves to where the rider really is with the next update.

:::release 2.0
## What OnMyLead Does for You

- **When you start sharing on Android**, OnMyLead asks once to change to a precise location if you allowed only an approximate one, and shows Android's prompt to turn on Google Location Accuracy if it's off.
- **Ride Mode shows a yellow banner** when your own location isn't sharp: **Precise Location Is Off**, **Google Location Accuracy Is Off**, or **Your Phone Has a Rough Location Right Now**. Tap it to fix it: Android asks or opens Location settings, iPhone and iPad open Settings, and a rough location shows the steps above.
- **Other riders see Approximate Location** in the riders list under a rider whose phone shares only a rough spot, so nobody goes looking for them a mile away.
- **[Ride Bubble](/help/ride-bubble)** leaves out the distance a rough location could be off by, so a rider beside you isn't called separated.
:::
