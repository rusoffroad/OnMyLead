---
title: Import Waypoints From Another App
summary: Bring your pins over from another map app with a GPX, KML or KMZ file. A Pro feature.
category: routes-maps
order: 32
release: "4.0"
updated: 2026-11-19
sources:
  - app/src/core/waypoint-import.ts
  - app/src/core/open-file.ts
  - app/src/lib/waypoint-import.ts
  - app/src/components/import-waypoints.tsx
  - app/src/hooks/use-waypoint-import.ts
  - app/src/app/+native-intent.ts
  - app/plugins/with-open-files.js
  - app/src/lib/map-waypoints.ts
  - app/src/lib/waypoints.ts
related: [waypoints-and-planned-stops, import-gpx, navigation-mode, free-vs-pro, sync-across-devices]
keywords: [import, waypoints, pins, markups, gpx, kml, kmz, geojson, onx, gaia, google earth, caltopo, garmin, switch apps, move, transfer, share sheet, open in]
review: "Opening a file from the share sheet (iPhone, iPad) and from Files or another app's Share (Android) is written from the code and has not been checked on a phone yet. Confirm the exact share sheet wording on each before 4.0 is released."
---

Already have camps, fuel stops and trailheads saved in another map app? Export them as a file and OnMyLead puts them on your map as waypoints. It reads GPX, KML and KMZ files from apps like onX, Gaia GPS and Google Earth, and GeoJSON files too.

This is a Pro feature, like adding waypoints by hand. See [Free and Pro](/help/free-vs-pro).

You export the file yourself from the other app. OnMyLead never signs in to your other accounts, and the file stays on your device: only the waypoints you choose are saved.

## Step 1: Export From the Other App

Every app words this a little differently. Look for **Export** or **Share** on your saved waypoints (some apps call them markups, pins or placemarks), and choose **GPX** if it's offered, or **KML** or **KMZ**.

## Step 2: Bring the File Into OnMyLead

There are two ways. Use whichever is easier.

**From the other app.** When the other app shows the share sheet, pick **OnMyLead**. You can also open the file later from Files, Mail or Drive the same way. OnMyLead opens Map Mode with the file ready.

**From inside OnMyLead.**

1. Open **Map Mode**.
2. On the **Explore** tab, tap **Import Waypoints** (under **My Trails**).
3. Pick the file.

To put them on a group ride instead, open the ride, open **Waypoints**, and tap **Import Waypoints** there.

## Step 3: Check and Import

A sheet lists every waypoint in the file with the symbol OnMyLead picked for it.

- **Add To** shows when you're on a ride. **My Map** keeps them private to you in Map Mode. **This Ride** puts them on the ride.
- Untick any you don't want. Waypoints you already have (same name, same spot) start unticked and are marked **Already Have**.
- Tap **Show All** to see the whole list.
- Tap **Import Waypoints**.

The map moves to show them. **Undo** shows for a few seconds in case it was the wrong file.

On iPad, Android tablets and the website, the sheet opens as a panel beside the map.

## What Comes Over

- Each waypoint's name, location and notes.
- A symbol, picked from the waypoint's name or the other app's icon: "Upper Camp" becomes Camp, "Washout" becomes Hazard. Anything else becomes Spot. Change any of them afterward: tap the waypoint, then **Edit**.

What doesn't: the other app's colors, photos and folders. Tracks and lines in the file are left out, and the sheet tells you how many. To ride a track, see [Import a GPX Route](/help/import-gpx).

## On a Group Ride

- The leader's (or an organizer's) imported waypoints show to everyone on the ride when they're imported before the ride starts.
- Once the ride is under way, imported waypoints come in as yours only, so the group doesn't get an alert for every one. Share any of them from the map: tap it, tap **Edit** and choose **Everyone on the Ride**.
- Other riders' imported waypoints are always theirs only.
- A ride holds 100 of your waypoints. If the file has more, untick some or add them to **My Map**.

## On the Website

**Import Waypoints** is in Map Mode and on a ride's Waypoints page at onmylead.com. In Map Mode you can also drag the file from your computer onto the map.

## Limits

- Up to 2,000 waypoints from one file, and 2,000 in **My Map** in all.
- Files up to 25 MB.

## Troubleshooting

- **"That file is not a GPX, KML or KMZ file."** Export again from the other app and choose GPX or KML.
- **"That file has tracks but no waypoints."** The export only had lines in it. Export the waypoints themselves, or bring the track in with [Import a GPX Route](/help/import-gpx).
- **OnMyLead isn't in the share sheet.** Scroll to the end of the row of apps and tap **More**. Or save the file, then use **Import Waypoints** inside OnMyLead.
- **A waypoint got the wrong symbol.** Tap it on the map, tap **Edit** and pick another.
