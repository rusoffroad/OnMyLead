---
title: Share Your Location
summary: Choose who sees your location and for how long. Sharing always ends on its own, and you can stop it any time.
category: safety-privacy
order: 10
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/share.tsx
  - app/src/components/share-picker.tsx
  - app/src/core/sharing.ts
  - app/src/core/freshness.ts
  - app/src/lib/location.ts
  - app/src/lib/api.ts
  - supabase/migrations/20261007000000_init.sql
related: [ride-mode, family-link, privacy, ride-summary-and-ride-again, troubleshooting]
keywords: [share location, location, gps, tracking, stop sharing, background location, always allow, timer, battery, who can see me]
---

OnMyLead only shares your location when you turn it on, only with the people you choose, and only for as long as you pick. Every share ends on its own. These rules are enforced by OnMyLead's server, not just the app.

There are two ways to share:

- **With a ride:** everyone on the ride sees you on the Ride Mode map.
- **With chosen people:** riders you pick, a family link, or both, from **Share My Location**.

## Share with Your Ride

When you open Ride Mode on a live ride and aren't sharing yet, the app asks **Share Your Location with This Ride?**

1. Open Ride Mode. See [Use Ride Mode](/help/ride-mode).
2. Pick how long to share: **2 Hours**, **4 Hours**, **8 Hours** or **Until I Leave the Ride**.
3. Or type your own length in **Hours** and tap **Share**. The longest you can pick is 24 hours.
4. If your iPhone asks for location access, allow it. Choose **Always** so the group keeps seeing you with the phone locked.

Only riders on this ride see you. Tap **Not Now** to skip. You can start sharing later by tapping the **Off** pill at the top of Ride Mode.

### Check or Stop Ride Sharing

The pill at the top of Ride Mode shows the time left, such as **1h 20m**, or **On** when you picked **Until I Leave the Ride**.

1. Tap the pill. A banner shows **Sharing** and the time left.
2. Tap **Stop** to stop sharing now, or **Hide** to fold the banner back into the pill.

### When Ride Sharing Ends

Sharing with a ride stops on its own at the first of these:

- Your timer runs out.
- The organizer ends or cancels the ride.
- You leave the ride.
- You tap **Stop**.

Closing Ride Mode, or locking your phone, doesn't stop sharing. If the app was closed or your phone restarted, opening Ride Mode picks your share back up.

## Share with Chosen Riders or Family

1. Tap the **You** tab.
2. Under **On the Trail**, tap **Share My Location**.
3. Under **Who Can See You**, tap the riders you want. Only people you've been on a ride with are listed.
4. To share with someone who doesn't have the app, turn on **Family Link**. See [Share a Family Link](/help/family-link).
5. Under **For How Long**, pick **15 Min**, **1 Hour**, **4 Hours**, **8 Hours** or **Until I Turn It Off (Max 24 Hours)**, or type your own length in **Hours** and tap **Share**.

**Until I Turn It Off** still stops by itself after 24 hours, so a forgotten share always ends.

While you share, **Share My Location** shows a card for each share with **Sharing Now** and the time left.

- Tap **Add 1 Hour** to keep going longer. In the last 10 minutes, the button says **Ending Soon · Add 1 Hr**.
- Tap **Stop** to end it now.

## Location in the Background

To keep your group updated while your phone is locked or in your pocket, OnMyLead needs location access set to **Always**. You can change it any time in your iPhone's **Settings > OnMyLead > Location**. While OnMyLead is using your location in the background, iPhone shows its location indicator.

:::release android
On Android, allow location **While Using the App**. OnMyLead doesn't need **Allow All the Time**. While you share, Android shows a **Sharing Your Location** notification, and that is what keeps your group updated with the phone locked. Tap it to see who can see you or to stop sharing. On Android 13 and later, also allow notifications when asked, or that notification stays hidden.
:::

Your phone sends a new position each time you move about 25 meters (80 feet), and at least every 15 seconds while you're stopped, so the group can tell you're still there.

## With No Service

Live tracking needs a connection. When your phone has no service:

- The group sees where you were last seen, with how long ago, never a dot that looks live.
- While you share with a ride, your phone keeps recording your track. When you get service again, your current position goes up, and the points from the dead zone are added to your ride track for your [ride summary](/help/ride-summary-and-ride-again).
- Sharing still ends at its end time, even if your phone can't reach the server.

Offline maps keep the map on your screen without service, but positions only update when phones have a connection. See [Offline Maps](/help/offline-maps).

## Who Sees What

- **Ride sharing:** riders who have joined that ride.
- **Chosen riders:** only the riders you picked are allowed to see your position.
- **Family link:** anyone who has the link, until the share ends.

Your exact location is never shown publicly. See [Privacy](/help/privacy).
