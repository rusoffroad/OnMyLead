---
title: Use OnMyLead on a Tablet
summary: On an iPad or Android tablet the map fills the screen, with the riders, the ride details and your buttons beside it.
category: getting-started
order: 40
release: "1.0"
updated: 2026-10-31
sources:
  - app/src/core/layout.ts
  - app/src/hooks/use-layout.ts
  - app/src/components/tab-bar.tsx
  - app/src/components/two-pane.tsx
  - app/src/app/(tabs)/_layout.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/app/(tabs)/find.tsx
  - app/src/app/r/[code].tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/ride/[id]/route.tsx
  - app/src/app/ride/[id]/waypoints.tsx
  - app/src/lib/orientation.ts
  - app/app.json
related: [ride-mode, route-builder, find-a-ride, getting-started]
keywords: [ipad, android tablet, tablet, landscape, split view, sidebar, big screen, rotate, multitasking]
---

OnMyLead works the same on a tablet as on a phone, with the same account, rides and Pro plan. A tablet just gets layouts made for the bigger screen: the map fills it, and the riders, the ride details and your buttons sit beside the map instead of on top of it.

## Turn It Either Way

Hold the tablet upright or sideways; every screen works both ways. Phones stay upright.

You can also run OnMyLead next to another app (Split View or Slide Over on an iPad, split screen on Android). The layout follows the size of the window: in a narrow window you get the phone layout, and it switches back as the window grows.

## Getting Around

On a tablet, **Rides**, **Find**, **Groups** and **You** run down the left edge of the screen instead of along the bottom.

On **Rides**, with the tablet sideways, **Create a Ride**, **Join a Ride** and **Find a Ride** stay on the left and your rides are listed beside them.

## Ride Mode on a Tablet

The live map fills the screen.

- **Riders** sit in a list on the left with how fresh each rider's location is. Tap the arrow beside a rider to get directions to them. Tap **Hide**, or swipe the list to the left, to see more map; tap **Show Riders** to bring it back. The list starts open with the tablet sideways and folded with it upright.
- **Your buttons** (the route strip, quick replies and status buttons) sit in a panel on the right. Swipe it down or tap **Hide** to fold it, just like on a phone. **Mechanical Issue** and **EMERGENCY** always stay on screen.
- **Directions** and **Add Waypoint** sit just above the buttons panel.
- The ride name, your sharing timer and any announcement stay at the top of the left side.

:::release 1.0.2
The round target button at the bottom of the map, just left of the buttons panel, centers the map on you. See [Use Ride Mode](/help/ride-mode).
:::

## The Ride Page

Once you've joined a ride, the ride and its details stay on the left, and **Map**, **Riders** and **Chat** open on the right. You can read the chat or check the route without losing the meeting time and place.

## Draw a Route and Add Waypoints

With the tablet sideways, the route tools and the waypoint list sit in a panel beside the map. Swipe the panel up or tap **Hide** to fold it. With the tablet upright, the panel floats in the bottom corner of the map; swipe it down to fold it.

## Find a Ride

Search and the list of rides sit on the left, with the map filling the rest of the screen.

:::note
Many tablets have no GPS. A Wi-Fi-only tablet can usually only tell roughly where it is, so share your location from your phone on the trail and use the tablet to follow the group.
:::
