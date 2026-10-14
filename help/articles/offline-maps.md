---
title: Offline Maps
summary: Download a ride's map or any area before you leave, so the map and route are still there when the signal drops. A Pro feature.
category: routes-maps
order: 60
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/maps/index.tsx
  - app/src/app/maps/area.tsx
  - app/src/components/offline-map-ui.tsx
  - app/src/components/area-picker-map.tsx
  - app/src/components/area-picker-map.web.tsx
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/trail-tiles.tsx
  - app/src/core/offline-maps.ts
  - app/src/core/trails.ts
  - app/src/lib/offline-maps.ts
  - app/src/lib/offline-maps.web.ts
  - app/src/lib/trail-tiles.ts
  - app/src/lib/map-signal.ts
  - app/src/app/(tabs)/profile.tsx
  - app/src/core/pro.ts
  - app/src/lib/pro.ts
related: [map-layers, free-vs-pro, ride-mode, route-builder, troubleshooting]
keywords: [offline, no signal, no service, download map, save map, dead zone, backcountry, storage, delete map, topo offline, satellite offline]
---

Out on the trail the signal often drops. Download a map before you leave and the map keeps working with no signal: satellite photos, topo and trail lines for the area you saved.

This is a Pro feature. See [Free and Pro](/help/free-vs-pro). Maps already on your phone keep working on the Free plan.

:::warning
Offline maps keep the map, not the tracking. With no signal, your phone can't send or receive positions. Riders show where they were last seen, and positions update again when phones get a connection.
:::

Offline maps are in the iPhone app only.

## Open Offline Maps

- On the **You** tab, tap **Offline Maps**.
- Or, on any map with the layers button, open the layers panel and tap **Offline Maps**.

The screen shows how much space your maps use, how much is free on your phone, your downloads under **On This Phone**, and your upcoming rides under **Your Rides**.

## Download a Ride's Map

The quickest way. It saves satellite, topo and trails around the ride's route.

From Offline Maps:

1. Under **Your Rides**, find the ride. Each one shows about how much space it needs.
2. Tap **Download**.

From the ride's map:

1. Open Ride Mode or the ride's waypoints map.
2. Tap the layers button.
3. Tap **Download This Ride's Map**.

**Your Rides** lists upcoming rides you've joined that have a mapped route. Downloading a ride again replaces its earlier download, which is handy if the route changed.

## Download Any Area

1. On Offline Maps, tap **Download a Map Area**.
2. Move and zoom the map until the frame holds the area you'll ride. The frame's size in miles shows in its corner.
3. Pick the maps to save: **Satellite**, **Topo** and **Trails**. All three are on to start.
4. Check the estimate under the choices.
5. Tap **Download This Area**.

The download is named after the nearest town when your phone can find one.

If you see **Too big for one download. Zoom in a little.**, the area is too large to save with enough detail to ride by. Zoom in, or save it as two downloads.

## Watch and Manage Downloads

Each download on **On This Phone** shows its maps, its size and how it's going.

- **Pause** stops a download for now.
- **Resume** carries on from where it stopped.
- **Finish** appears when some pieces didn't download. The download shows how many are missing; tap **Finish** to try them again.
- **Delete** takes it off your phone. Tap **Delete** again to confirm, or **Keep**.

One download runs at a time. If you close the app during a download, it's paused; open Offline Maps and tap **Resume**.

Deleting a download only removes pieces that no other download also uses, so overlapping maps keep working.

## When the Signal Drops

You don't need to do anything. The app checks for a connection while a map is open. When it can't reach the internet:

- A **No Signal** tag with **Downloaded Map** appears under the layers button.
- The map shows what's saved on your phone. Zoomed in past what you saved, it stretches the closest saved detail.
- The satellite view switches to USGS aerial photos from your download, since Apple's satellite view can't be saved ahead of time.

The ride's route and waypoints are saved on your phone once you've opened the ride, so they're still on the map too.

:::tip
Download before you leave, while you have good signal. Then open the ride once so its route is on your phone.
:::

## What Gets Saved

- **Satellite**: USGS aerial photos.
- **Topo**: the USGS topo map.
- **Trails**: Forest Service and BLM lines, plus OpenStreetMap tracks (map data © OpenStreetMap contributors).

Trail and topo areas you've already looked at with signal are also kept on your phone for a while, but only a download makes sure the whole area is there.

## If Your Pro Plan Ends

Maps you already downloaded stay on your phone and keep working. Starting a new download needs Pro.
