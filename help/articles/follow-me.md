---
title: Follow Me on the Map
summary: Keep the map moving with your dot as you ride, see which way you're heading, and turn Follow Me on or off.
category: ride-mode
order: 13
release: "2.0"
updated: 2026-11-05
sources:
  - app/src/core/follow-camera.ts
  - app/src/core/heading.ts
  - app/src/hooks/use-own-moving.ts
  - app/src/hooks/use-follow-me.ts
  - app/src/components/follow-me-button.tsx
  - app/src/components/own-heading.tsx
  - app/src/components/group-map.tsx
  - app/src/components/nav-map.tsx
  - app/src/components/nav-map.web.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/nav/index.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/core/intersections.ts
  - app/src/hooks/use-intersection-zoom.ts
  - app/src/components/use-follow-camera.ts
  - app/src/components/fallback-follow.ts
  - app/src/components/own-puck.tsx
  - app/src/components/rider-puck.tsx
  - app/src/lib/compass.ts
related: [ride-mode, navigation-mode, full-map, use-onmylead-on-a-tablet]
keywords: [zoom in at intersections, intersection zoom, junction, auto zoom, zoom out, keep dot on screen, compass, follow me, follow, map follows me, keep me centered, auto center, recenter, map moves with me, tracking mode, my arrow, heading, direction arrow, which way am i going, my dot, blue dot]
---

With **Follow Me** on, the map in [Ride Mode](/help/ride-mode) and [Navigate](/help/navigation-mode) moves with you as you ride, so your dot stays in view and you never have to drag the map to find yourself.

:::until 2.1
The map keeps your zoom and doesn't turn; it slides so you stay in the open part of the map, clear of the panels.

## Your Own Arrow

While you're moving faster than a walk (about 4 mph), a small white arrow on the edge of your own blue dot points the way you're heading, the same arrow every other rider's dot gets. It stays true when you turn the map. When you stop, the arrow goes away, because a phone can only tell direction while it moves.
:::

:::release 2.1
## How the Map Keeps Up With You

Your dot moves freely through the middle of the map. When it gets close to an edge of the open part of the map (clear of the panels), the map zooms out one step, once. After that, each time your dot nears an edge again, the map slides to bring you back, placing your dot a little behind the middle so you see more of the way ahead. The map never turns.

Tapping **Center on Me**, or picking Follow Me back up after a pause, starts fresh: the map may zoom out one step again the next time you near an edge.

## Zoom In at Intersections

While the map is following you and you're moving, it zooms in as you come up on a junction of roads or trails, about 9 seconds before you reach it, so you can see the turn up close. Once you're through, it zooms back out to where it was. It works with any road, track or trail drawn on the map, including on a downloaded map with no signal.

**Zoom In at Intersections** is on until you turn it off in the **You** tab under **On the Trail**. Your choice follows your account to your other devices.

## Your Dot

Your own dot has an arrow built into it and a soft beam ahead of it (Safety Orange unless you pick another **Dot Style** in [Map Settings](/help/map-layers)). The arrow always shows which way you're facing: the direction you're riding while you move, and your phone's compass when you're stopped, so it turns as you turn. The beam is long while you ride and shorter when you stop. The dot takes its stopped look as soon as your phone reports you've stopped, or after a short while with no new location (usually 5 to 15 seconds; up to about 40 seconds with Max Battery Saver, which updates less often). It stays true when you turn the map. In the iPhone, iPad and Android apps, if your device has no compass reading while you're stopped, the dot shows a round centre with no arrow instead of guessing a direction.
:::

## The Follow Me Button

**Follow Me** sits on the map just left of the round **Center on Me** button.

| What you see | What it means |
|---|---|
| Blue **Following** | The map is moving with you. Tap it to turn Follow Me off. |
| Blue outline, **Paused** | You dragged or pinched the map, so it stopped following to let you look around. Tap it, or **Center on Me**, to follow you again. |
| Plain **Follow Me** | Follow Me is off. The map stays where you put it. Tap it to turn Follow Me on. |

Follow Me is on until you turn it off. Your phone remembers the choice for Ride Mode and Navigate alike, and you can also switch it in the **You** tab under **On the Trail**: **Follow Me on Maps**.

:::release 2.1
From 2.1 these switches are also under **Following** in **Map Settings** (the round **Map Settings** button on Ride Mode's and Map Mode's map): **Follow Me**, **Zoom Out at the Edge** and **Zoom In at Intersections**. Turn **Zoom Out at the Edge** off and the map slides along with your dot without zooming out first; it's also on the **You** tab under **On the Trail**. The zoom switches work while Follow Me is on.
:::

With Follow Me off, **Center on Me** still centers the map on you once, and Navigate doesn't move the map by itself, even while you record or follow a trail.

In Navigate the map holds still while the **Measure** tab is open, and when you jump to a place with search.

## In Full Map

In [Full Map](/help/full-map), **Follow Me** stays on the map as a round arrow button next to **Center on Me**, so the map stays as big as it can be.

## On Each Device

- **iPhone and Android phones:** **Follow Me** and **Center on Me** sit on the right, just above the bottom panel. If the panel fills the screen, fold it to see them.
- **iPad and Android tablets:** both sit at the bottom of the map, just left of the buttons panel in Ride Mode, and in the bottom corner in Navigate.
- **Website:** Navigate has **Follow Me** too, and shows your arrow when your browser reports your direction (most phones do while you move; computers usually don't). Ride Mode on the website shows the route instead of a live map, so it has no Follow Me button.

:::release 2.1
The website has no compass, so on onmylead.com your dot keeps pointing the last way you were heading when you stop.
:::
