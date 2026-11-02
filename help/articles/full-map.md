---
title: Full Map
summary: Hide the bars and panels on any map so the map fills your screen, and bring them back with one tap.
category: routes-maps
order: 12
release: "1.0.4"
updated: 2026-11-02
sources:
  - app/src/components/full-map.tsx
  - app/src/hooks/use-full-map.ts
  - app/src/core/full-map.ts
  - app/src/components/panel-handle.tsx
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/rides-map-chrome.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/ride/[id]/route.tsx
  - app/src/app/ride/[id]/waypoints.tsx
  - app/src/app/nav/index.tsx
  - app/src/app/(tabs)/find.tsx
related: [ride-mode, navigation-mode, route-builder, waypoints-and-planned-stops, find-a-ride, map-layers]
keywords: [full map, full screen, bigger map, more map, hide buttons, hide controls, show controls, map only]
---

Every map in OnMyLead can fill your whole screen. **Full Map** tucks the top bar, the layers button and the panel away, and leaves one slim bar at the bottom so you can bring everything back with one tap.

## Turn On Full Map

Tap **Full Map** at the right end of the panel's grab bar, at the top of the panel over the map. It's in the same place in:

- [Ride Mode](/help/ride-mode)
- [Navigate](/help/navigation-mode)
- [Draw a Route](/help/route-builder)
- [Waypoints and Planned Stops](/help/waypoints-and-planned-stops)

In [Find a Ride](/help/find-a-ride), tap the **Full Map** button at the top of the buttons on the map's right edge.

## Bring the Buttons Back

Tap **Controls** in the bar at the bottom, or swipe the bar up. Everything comes back the way you left it. In Find a Ride, tap the same corner button again (**Exit Full Map**).

Your phone remembers Full Map for each map, so it opens the same way next time. Find a Ride always opens with its list.

## What Stays on Screen

The bar keeps only what you shouldn't have to dig for:

| Map | In the bar or on the map |
| --- | --- |
| Ride Mode | The route line with every rider, **EMERGENCY**, calls for help from other riders, **Center on Me** |
| Navigate | Your speed, the miles left on a trail you're following, or the length you're measuring, a red **Rec** while recording, **Undo** while measuring, **Center on Me** |
| Draw a Route | The route's miles and **Undo**. Tapping the map still adds points |
| Waypoints | How many waypoints the ride has. Press and hold the map to drop one |

On every map, the **No Signal** tag stays when you have no service, and tapping a trail line still shows its card.

## Phones, Tablets and the Website

Full Map works the same on iPhone, iPad, Android phones and Android tablets. On a tablet the bar sits in the bottom-left corner. On onmylead.com, press **F** to turn on Full Map and **Esc** to bring the controls back (not while you're typing in a box).
