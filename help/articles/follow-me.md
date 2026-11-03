---
title: Follow Me on the Map
summary: Keep the map moving with your dot as you ride, see which way you're heading, and turn Follow Me on or off.
category: ride-mode
order: 13
release: "2.0"
updated: 2026-11-02
sources:
  - app/src/core/follow-camera.ts
  - app/src/core/heading.ts
  - app/src/hooks/use-follow-me.ts
  - app/src/components/follow-me-button.tsx
  - app/src/components/own-heading.tsx
  - app/src/components/group-map.tsx
  - app/src/components/nav-map.tsx
  - app/src/components/nav-map.web.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/nav/index.tsx
  - app/src/app/(tabs)/profile.tsx
related: [ride-mode, navigation-mode, full-map, use-onmylead-on-a-tablet]
keywords: [follow me, follow, map follows me, keep me centered, auto center, recenter, map moves with me, tracking mode, my arrow, heading, direction arrow, which way am i going, my dot, blue dot]
---

With **Follow Me** on, the map in [Ride Mode](/help/ride-mode) and [Navigate](/help/navigation-mode) moves with you as you ride, so your dot stays in view and you never have to drag the map to find yourself. The map keeps your zoom and doesn't turn; it slides so you stay in the open part of the map, clear of the panels.

## Your Own Arrow

While you're moving faster than a walk (about 4 mph), a small white arrow on the edge of your own blue dot points the way you're heading, the same arrow every other rider's dot gets. It stays true when you turn the map. When you stop, the arrow goes away, because a phone can only tell direction while it moves.

## The Follow Me Button

**Follow Me** sits on the map just left of the round **Center on Me** button.

| What you see | What it means |
|---|---|
| Blue **Following** | The map is moving with you. Tap it to turn Follow Me off. |
| Blue outline, **Paused** | You dragged or pinched the map, so it stopped following to let you look around. Tap it, or **Center on Me**, to follow you again. |
| Plain **Follow Me** | Follow Me is off. The map stays where you put it. Tap it to turn Follow Me on. |

Follow Me is on until you turn it off. Your phone remembers the choice for Ride Mode and Navigate alike, and you can also switch it in the **You** tab under **On the Trail**: **Follow Me on Maps**.

With Follow Me off, **Center on Me** still centers the map on you once, and Navigate doesn't move the map by itself, even while you record or follow a trail.

In Navigate the map holds still while the **Measure** tab is open, and when you jump to a place with search.

## In Full Map

In [Full Map](/help/full-map), **Follow Me** stays on the map as a round arrow button next to **Center on Me**, so the map stays as big as it can be.

## On Each Device

- **iPhone and Android phones:** **Follow Me** and **Center on Me** sit on the right, just above the bottom panel. If the panel fills the screen, fold it to see them.
- **iPad and Android tablets:** both sit at the bottom of the map, just left of the buttons panel in Ride Mode, and in the bottom corner in Navigate.
- **Website:** Navigate has **Follow Me** too, and shows your arrow when your browser reports your direction (most phones do while you move; computers usually don't). Ride Mode on the website shows the route instead of a live map, so it has no Follow Me button.
