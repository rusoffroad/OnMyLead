---
title: Get Directions in Apple Maps or Google Maps
summary: Hand off to Apple Maps or Google Maps for turn-by-turn directions to the meeting point, along the route, to the destination, or to a rider.
category: routes-maps
order: 70
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/directions.tsx
  - app/src/core/directions.ts
  - app/src/lib/directions.ts
  - app/src/app/r/[code].tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/components/rider-list.tsx
related: [ride-mode, ride-day-and-weather, waypoints-and-planned-stops, privacy]
keywords: [navigate, navigation, turn by turn, apple maps, google maps, meeting point, driving directions, how to get there]
---

OnMyLead hands you over to Apple Maps or Google Maps for turn-by-turn directions on the road. Off road, follow the leader and the route on the OnMyLead map.

Only the place you want to go is sent to the maps app, nothing about you.

## Get Directions to the Meeting Point

1. Open the ride from the **Rides** tab.
2. On the **Details** section, find the **Directions** card.
3. Tap a row:
   - **Meeting Point:** the exact meeting spot.
   - **Along the Route:** follows the ride's route through stops on the way, ending at the end of the route.
   - **Destination:** the ride's destination, if the organizer added one.
4. Pick **Apple Maps** or **Google Maps**, unless you've already chosen one (below).

The **Directions** card shows while the ride is scheduled or live. **Meeting Point** and **Along the Route** only show for riders who have joined the ride, because the exact meeting spot and the route are private to them. See [Privacy](/help/privacy).

## Get Directions in Ride Mode

1. In Ride Mode, tap **Directions** just above the bottom panel, on the left.
2. Tap a row:
   - **Regroup Point:** where the leader asked everyone to meet up, when one is set.
   - **Meeting Point**
   - **Continue Along the Route:** picks up from where you are on the route.
   - **Destination**
3. Pick your maps app, if asked.

You can also get directions from other places in Ride Mode:

- Tap the yellow **Regroup point set. Tap to navigate** banner.
- Tap **Navigate** on a rider's alert card.
- Open the **Riders** list and tap **Navigate**, or **Go to Last Seen** for a rider whose position is old.
- Tap a waypoint on the map. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).

:::note
Directions along the route pass through up to 8 stops picked from the route, and the maps app keeps to roads it knows between them. Off-road parts of the route may differ, so follow the OnMyLead map there.
:::

## Choose Your Maps App

1. Tap the **You** tab.
2. Under **Settings**, tap **Directions**.
3. Pick **Ask Each Time**, **Apple Maps** or **Google Maps**.
4. Tap **Done**.

Every **Navigate** and **Directions** button in the app uses this choice. With **Ask Each Time**, the app asks which one to open every time.

:::tip
Google Maps opens in its app if you have it installed, and in your browser if you don't.
:::
