---
title: Fix Common Problems
summary: What to check when riders don't show on the map, alerts don't arrive, a download stops or sign-in fails.
category: troubleshooting
order: 10
release: "1.0"
updated: 2026-11-05
sources:
  - app/src/components/rider-puck.tsx
  - app/src/core/freshness.ts
  - app/src/components/rider-dot.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/lib/outbox.ts
  - app/src/lib/location.ts
  - app/src/core/precise-location.ts
  - app/src/hooks/use-precise-location.ts
  - app/src/core/notifications.ts
  - app/src/app/notifications.tsx
  - app/src/lib/offline-maps.ts
  - app/src/components/offline-map-ui.tsx
  - app/src/core/offline-maps.ts
  - app/src/hooks/use-trail-map.ts
  - app/src/core/trail-router.ts
  - app/src/app/reset-password.tsx
  - app/src/core/auth-link.ts
  - app/src/lib/starlink.ts
  - app/src/components/fuel-check.tsx
related: [accurate-location, faq, ride-mode, location-sharing, offline-maps, notification-settings, contact-support]
keywords: [not working, problem, broken, bug, help, no signal, no service, alerts, download, password, tablet, wrong location, miles away, approximate, precise location]
---

Start here when something doesn't work the way you expect. If your problem isn't listed, [contact us](/help/contact-support).

## A Rider Shows as a Hollow Dot or "Last Seen"

A rider's dot turns hollow when their last position is more than a minute old, and shows **No Signal** with a dashed grey ring after about 3 minutes. A sharing phone checks in at least every 15 seconds while it has service, so this usually means that rider lost service.

:::release 1.0.3
:::until 2.1
A live rider's dot has a bold white ring (the leader's is solid blue). A last-seen rider's dot is a thin grey ring instead.
:::
:::

:::release 2.1
A live rider's dot is a solid disc with a white rim and an arrow inside it (blue for the leader, violet for the tail gunner, graphite for everyone else). A last-seen rider's dot is a thin grey ring with no arrow instead.
:::

If **everyone** suddenly shows as last seen, it's probably your phone. After about 35 seconds without hearing from the server, Ride Mode shows **No Service. Riders Show Where They Were Last Seen**. It doesn't mark the others as lost because of your own dropout.

See [Share Your Location](/help/location-sharing).

## A Rider Shows Miles From Where They Are

If a rider right beside you shows up a mile or two away, their phone is giving every app a rough location (Google Maps or Apple Maps on that phone shows the same wrong spot). On that phone, turn on **Precise Location** for OnMyLead and, on Android, **Google Location Accuracy**, then calibrate. Step by step: [Make Your Location Accurate](/help/accurate-location).

## My Group Can't See Me With My Phone Locked

1. Open your iPhone's **Settings > OnMyLead > Location**.
2. Choose **Always**.
3. Open Ride Mode again. If your share is still running, it picks back up.

On Android, check that the **Sharing Your Location** notification is showing while you share. If it isn't, open Ride Mode again to restart it. If your phone has a battery saver that closes apps, set OnMyLead's battery use to **Unrestricted** in **Settings > Apps > OnMyLead > Battery**.

:::release 1.0.1
If sharing drains your battery too fast on long days, try [Battery Saver](/help/battery-saver). Your group sees you less often, so switch back to **Best Accuracy** when you can charge.
:::

:::release 1.0.1
If Ride Mode shows **Location Is Off**, location is turned off for OnMyLead, so your group can't see you move. Turn it back on in your phone's **Settings**, then open Ride Mode again.
:::

Closing Ride Mode or locking your phone doesn't stop sharing. Sharing ends when your timer runs out, the ride ends, you leave the ride, or you tap **Stop**.

## I Tapped a Status Button With No Signal

It waits on your phone as **Waiting for Signal** and sends by itself as soon as you have service, stamped with the time you tapped it. You can tap **Retry Now** or **Cancel**. See [Status Buttons](/help/status-buttons).

:::release 2.1
## Nearby Riders Don't Show Up Over Bluetooth

Bluetooth Sharing reaches about 30 to 100 meters between phones. Check that Bluetooth is on in the phone's settings, that OnMyLead is allowed to use Bluetooth (iPhone and iPad: **Settings > OnMyLead > Bluetooth**; Android: **Settings > Apps > OnMyLead > Permissions > Nearby devices**), that **Bluetooth Sharing** is on in the You tab (or the no-service banner in Ride Mode says **Bluetooth On**), and that you opened Ride Mode once with service. On Free, riders' spots and messages over Bluetooth don't show (they're Pro); EMERGENCY, Need Help and Crash Alerts still do. Riders only send their spot while they share with the ride. See [Share With Nearby Riders With No Service](/help/bluetooth-sharing).
:::

## I'm Not Getting Alerts

1. Check that notifications are allowed for OnMyLead in your iPhone's **Settings > Notifications > OnMyLead**.
2. In the app, open **You** and check your [notification settings](/help/notification-settings), including quiet hours.

On Android, check **Settings > Apps > OnMyLead > Notifications**, including the **Rider Alerts**, **Ride Chat** and **Ride Updates** categories.

**Need Help** and **EMERGENCY** alerts from your group always come through, even in quiet hours, as long as iPhone notifications are allowed for OnMyLead.

:::release 2.0
## The Spoken Alerts Sound Robotic

Your phone may only have its small standard voice. Open **You** > **Voice** to hear the voices on your phone, and follow the steps there to download a free Premium or Enhanced voice. See [Choose the Voice for Spoken Alerts](/help/voice).
:::

## Part of My Route Is a Straight Line

The route builder follows mapped trails. It draws a straight line when no mapped trail joins two points, when the points are very far apart, or when you had no signal and that trail data wasn't saved on your phone. Add a point on the trail or zoom in, or use **Straight Line** for unmapped ground. See [Draw a Route](/help/route-builder).

## I Turned On Trails but See No Lines

:::until 1.0.2
Zoom in. Forest Service and BLM lines appear from about zoom level 9 (**Zoom In to See Trails**), and smaller park and local tracks need you to zoom in further (**Zoom In for Park and Local Trails**). The website shows fewer trail layers than the app. See [Map Layers](/help/map-layers).
:::

:::release 1.0.2
Zoom in. Forest Service and BLM lines appear when the map is about 60 miles across a phone screen (**Zoom In to See Trails**), and park and local tracks from OpenStreetMap when it's about 15 miles across (**Zoom In for Park and Local Trails**). The website shows fewer trail layers than the app. See [Map Layers](/help/map-layers).
:::

## My Offline Map Download Stopped

Closing the app pauses a running download. Open **You > Offline Maps** and tap **Resume**, or **Finish** if some pieces are missing. If the area says **Too big for one download**, zoom in so the frame covers less. See [Offline Maps](/help/offline-maps).

:::release 2.1
## The 3D Map Went Flat

With no signal, Ride Mode and Map Mode show 3D Terrain only over an area you saved with **3D Terrain** ticked in Offline Maps. Anywhere else they show the flat downloaded map, so you still have a map. The 3D view comes back with signal. See [3D Terrain](/help/3d-terrain).
:::

## I Don't See a Fuel Check on My Ride

The fuel check needs miles to check against (a saved route or **Route Length (Miles)**) and a machine in your Garage with **Tank (gal)** and **Miles per Gallon** filled in. If you have more than one machine, pick yours under **Bringing** on the ride. See [Fuel Range](/help/fuel-range).

## My Password Reset Link Says It Has Expired

Reset links work once and expire. Tap **Back to Sign In**, ask for a new link, and open it on the same iPhone. See [Sign In](/help/sign-in).

## The Starlink Page Can't Reach My Dish

Your iPhone has to be on the Starlink Wi-Fi, and OnMyLead needs Local Network access (**Settings > OnMyLead**). The page tries again every 10 seconds. It doesn't work on the website. See [Starlink](/help/starlink).
