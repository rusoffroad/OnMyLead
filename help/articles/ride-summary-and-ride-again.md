---
title: Ride Summary and Ride Again
summary: After a ride ends, see your distance and route, who finished, share a ride card, and set up the same ride again in a few taps.
category: rides
order: 70
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/ride-summary.tsx
  - app/src/components/ride-card.tsx
  - app/src/core/summary.ts
  - app/src/app/r/[code].tsx
  - app/src/app/ride/new.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/core/pro.ts
  - app/src/core/entitlements.ts
related: [organizer-controls, create-a-ride, location-sharing, free-vs-pro, ride-mode]
keywords: [summary, stats, statistics, distance, track, ride card, share, recap, ride again, repeat ride, copy ride, history, past rides]
---

When the organizer ends a ride, everyone who was on it gets a summary on the ride page. Organizers can also start the same ride again with one tap.

## See Your Ride Summary

1. On the **Rides** tab, find the ride under **Past Rides**.
2. Tap it. The summary is at the top of the ride page.

The summary has three parts.

### Your Ride

Your **Distance** and how long you were **Out For**, plus a map of your route. Only you can see your route.

Your stats come from sharing your location in Ride Mode. If you didn't share, there's no track for you on that ride. See [Location Sharing](/help/location-sharing).

**Moving Time**, **Average Speed**, **Top Speed** and **Climbing** are part of Advanced Ride Statistics. This is a Pro feature. See [Free and Pro](/help/free-vs-pro). Your full stats are saved either way.

### The Group

Who finished the ride: the riders still on it when it ended. With Pro, you also see the group's totals: the **Longest** and **Average** distance and the **Group Top Speed**. These are totals only, and nobody's route is shown.

### Ride Card

A picture of the ride to share with friends or on social media.

1. Pick a layout: **Standard**, **Full Stats** or **Big Number**.
2. Tap **Share Ride Card**.

**Standard** is free. **Full Stats** and **Big Number** are Premium Ride Cards. This is a Pro feature. See [Free and Pro](/help/free-vs-pro). The card never shows the meeting point or anyone's route.

## Ride Again

Organizers can set up the same ride again without filling everything in.

1. Open the ended ride's page.
2. In the **You're Organizing** card, tap **Ride Again**.
3. The Create a Ride form opens with the name, details, meeting point and route already filled in. The day is set to the next one on the same weekday.
4. Check the day and times.
5. Tap **Create Public Ride** or **Create Private Ride**.

On a ride that hasn't ended yet, the same button is called **Copy This Ride**.

:::note
Ride Again creates a new ride, so it counts toward your monthly rides on Free. See [Create a Ride](/help/create-a-ride).
:::

## Past Rides

Ended and cancelled rides move to **Past Rides** on the **Rides** tab. Free shows your last 5. Full ride history is a Pro feature. Nothing is deleted, so older rides show again with Pro. See [Free and Pro](/help/free-vs-pro).

To remove a ride from your Past Rides, swipe left on it and tap **Leave** (or **Delete** if you organized it).
