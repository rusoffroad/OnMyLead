---
title: Use OnMyLead on a Tablet
summary: On an iPad or Android tablet the map fills the screen, with the riders, the ride details and your buttons beside it.
category: getting-started
order: 40
release: "1.0"
updated: 2026-11-04
sources:
  - app/src/app/e/[code].tsx
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

:::release 2.0
Using OnMyLead on a tablet or the website is a Pro feature. See [Free and Pro](/help/free-vs-pro). On a Free account, a tablet or the website opens a screen with **Join a Ride**, **Your Rides**, **See OnMyLead Pro** and **Your Account**. Joining a ride, the ride page and Ride Mode always work, so you can follow the leader on any device for free.
:::

## Turn It Either Way

Hold the tablet upright or sideways; every screen works both ways. Phones stay upright.

You can also run OnMyLead next to another app (Split View or Slide Over on an iPad, split screen on Android). The layout follows the size of the window: in a narrow window you get the phone layout, and it switches back as the window grows.

## Getting Around

On a tablet, **Rides**, **Find**, **Groups** and **You** run down the left edge of the screen instead of along the bottom.
:::release 2.0
The blue **Map Mode** button sits under **Find** and opens your offroad map full screen.
:::

:::until 2.0
On **Rides**, with the tablet sideways, **Create a Ride**, **Join a Ride** and **Find a Ride** stay on the left and your rides are listed beside them.
:::

:::release 2.0
On **Rides**, with the tablet sideways, **Join a Ride**, **Create a Ride**, **Find a Ride**, **Events**, **Map Mode**, your toolkit and help stay on the left, and your rides, group, public rides, feed and badges are beside them. Upright, it's one column. See [Your Home Screen](/help/home-screen).
:::

## Ride Mode on a Tablet

The live map fills the screen.

- **Riders** sit in a list on the left with how fresh each rider's location is. Tap the arrow beside a rider to get directions to them. Tap **Hide**, or swipe the list to the left, to see more map; tap **Show Riders** to bring it back. The list starts open with the tablet sideways and folded with it upright.
- **Your buttons** (the route strip, quick replies and status buttons) sit in a panel on the right. Swipe it down or tap **Hide** to fold it, just like on a phone. **Mechanical Issue** and **EMERGENCY** always stay on screen.
- **Directions** and **Add Waypoint** sit just above the buttons panel.
- The ride name, your sharing timer and any announcement stay at the top of the left side.

:::release 2.0
Tap **Message** at the top of the buttons panel to type a message to the group. It opens as a card in the middle of the screen.
:::

:::release 1.0.3
On a tablet, Ride Mode's pop-up cards (Share Your Location, **EMERGENCY**) and sheets close when you swipe them down, just like on a phone.
:::

:::release 1.0.2
The round target button at the bottom of the map, just left of the buttons panel, centers the map on you. See [Use Ride Mode](/help/ride-mode).

:::release 2.0
**Follow Me** sits just left of that button and keeps the map moving with you as you ride. Drag the map to look around and it pauses; tap **Paused** to follow you again. See [Follow Me on the Map](/help/follow-me).
:::
:::

:::release 1.0.3
Tap **⤢ Full Map** at the top of the buttons panel to hide the riders list, the ride name and the buttons. A slim bar stays at the bottom right with the route line and **EMERGENCY**. See [Use Ride Mode](/help/ride-mode).
:::

:::until 2.0
**Menus ▲** in that bar brings everything back.
:::

:::release 2.0
**Controls** in that bar brings everything back (or swipe the bar up). Navigate, Draw a Route, Waypoints and Find a Ride have **Full Map** too; on a tablet their bar sits in the bottom-left corner. See [Full Map](/help/full-map).
:::

## The Ride Page

Once you've joined a ride, the ride and its details stay on the left, and **Map**, **Riders** and **Chat** open on the right. You can read the chat or check the route without losing the meeting time and place.

:::release 2.0
**Leave Ride** is at the bottom of the left side of the ride page, and at the bottom of the **Riders** list in Ride Mode. See [Join a Ride](/help/join-a-ride).
:::

:::release 2.1
## Scout on a Tablet

In [Scout](/help/scout) (**Find** > **Places to Ride**), the distance slider, the filters and the list of places sit on the left and the map fills the rest of the screen, sideways or upright. A place's page puts its details on the left and its map beside them.
:::

## Draw a Route and Add Waypoints

With the tablet sideways, the route tools and the waypoint list sit in a panel beside the map. Swipe the panel up or tap **Hide** to fold it. With the tablet upright, the panel floats in the bottom corner of the map; swipe it down to fold it.

:::release 2.1
A long swipe the way the panel folds (up beside the map, down when it floats at the bottom), or a swipe on the folded panel, goes straight to [Full Map](/help/full-map).
:::

## Find a Ride

Search and the list of rides sit on the left, with the map filling the rest of the screen.

:::note
Many tablets have no GPS. A Wi-Fi-only tablet can usually only tell roughly where it is, so share your location from your phone on the trail and use the tablet to follow the group.
:::

:::release 2.0
## Events on a Tablet

Events shows two events per row on a tablet in portrait and three in landscape. An event's page keeps its photo, details and hosts on the left, and the agenda, group rides and who's going on the right. See [Events](/help/events).
:::
