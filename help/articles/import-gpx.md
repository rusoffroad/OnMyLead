---
title: Import a GPX Route
summary: Bring in a track from Gaia, onX or any GPX file and use it as your ride's route. A Pro feature.
category: routes-maps
order: 20
release: "1.0"
updated: 2026-10-18
sources:
  - app/src/app/ride/[id]/route.tsx
  - app/src/core/route.ts
  - app/src/lib/read-text.ts
  - app/src/lib/read-text.web.ts
  - app/src/lib/api.ts
  - app/src/lib/pro.ts
  - app/src/core/pro.ts
  - app/src/core/entitlements.ts
  - supabase/migrations/20261018000000_pro_entitlements.sql
related: [route-builder, free-vs-pro, map-layers, offline-maps]
keywords: [gpx, import, track, gaia, onx, file, upload route, gpx file, tablet]
---

Already have the trail you want to ride as a track in another app? Export it as a GPX file and import it as your ride's route. Riders see it in Ride Mode just like a route drawn in OnMyLead.

This is a Pro feature. See [Free and Pro](/help/free-vs-pro). Drawing a route on the map stays free: see [Draw a Route](/help/route-builder).

## Import a File

You need to be the ride's organizer or a co-organizer.

1. Open the ride, tap the **Map** tab, and tap **Build the Route** (or **Edit Route**).
2. Tap **Import GPX**.
3. Pick the GPX file. On iPhone it opens your Files, so save the file there first.
4. Check the track on the map. The panel shows its miles and how many track points it has.
5. Tap **Save Route**.

If you're on the Free plan, tapping **Import GPX** shows what Pro includes instead of opening the file picker.

## What Gets Imported

- If the file has a track, the track is used.
- If it has no track, its route is used.
- If it has neither, its waypoints are joined in order.

The track's name from the file is kept with the route. Very long tracks are simplified a little so they load and draw quickly on every rider's phone.

:::note
Waypoints inside a GPX file aren't added as OnMyLead waypoints. To mark camp, fuel or a planned stop, see [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
:::

## Change an Imported Route

An imported track is shown as it is, so you can't drag or add points to it.

- To use a different file, tap **Clear**, then **Import GPX** again.
- To draw your own instead, tap **Clear** and start tapping the map.

Tapping a line on an imported route's map shows that trail's name and who can ride it. See [Map Layers and Trails](/help/map-layers).

GPX import works with Pro from either store: the App Store on iPhone and iPad, or Google Play on Android.

## If Your Pro Plan Ends

A route you already imported stays on the ride. Importing a new GPX file needs Pro.

## On the Website

**Import GPX** works the same way in the website's route builder. Pick the file from your computer.

## Troubleshooting

- **"That file is not a GPX file."** Go back to the other app, export the track as GPX (not KML or another format) and try again.
- **"That GPX file has no track in it."** The file doesn't have at least two points to draw. Export the track itself, not just a single waypoint.
