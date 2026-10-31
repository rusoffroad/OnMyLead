---
title: Keep the Group Together with Ride Bubble
summary: Ride Bubble watches for riders who drop back, run ahead or stop moving, and warns the leader and tail gunner before anyone gets lost.
category: ride-mode
order: 30
release: "1.0"
updated: 2026-10-31
sources:
  - app/src/core/bubble.ts
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/ride/new.tsx
  - app/src/components/rider-pin.tsx
  - app/src/components/group-map.tsx
related: [ride-mode, leader-sweep-and-tail-gunner, status-buttons, create-a-ride, location-sharing]
keywords: [bubble, separated, together, left behind, gap, distance alert, stopped rider, tight trail, desert, highway, tablet]
---

Ride Bubble keeps an eye on the gaps in the group while Ride Mode is open. When a rider gets too far from everyone else, stops while the group keeps moving, or goes quiet, Ride Bubble flags them. It's free on every plan.

## How It Decides

Each rider is measured against the nearest other rider, not just the leader. That way a rider who has run far ahead counts too, and the tail gunner at the back is measured against the last rider rather than the whole pack.

A rider turns yellow or red when:

- **They're too far from the nearest rider.** The distances depend on the ride's Ride Bubble setting (below).
- **They've stopped while at least half the group is moving.** Yellow after 2 minutes stopped, red after 5 minutes.
- **Their phone has gone quiet.** No update for 5 minutes turns a rider red, with a message like "No update from Sam for 6 minutes. Showing last known location."

Only riders who are sharing their location are part of Ride Bubble. A rider who isn't sharing can't be measured.

## Ride Bubble Settings

The organizer picks the setting when creating the ride, under **Add Route, Difficulty and More**, in **Ride Bubble**.

| Setting | Yellow when the nearest rider is more than | Red when the nearest rider is more than |
|---|---|---|
| **Standard** | 0.5 miles | 1.5 miles |
| **Tight Trail** | 0.1 miles | 0.25 miles |
| **Desert** | 0.75 miles | 2 miles |
| **Highway** | 1 mile | 3 miles |

The stopped and no-update times are the same for every setting.

## What Everyone Sees

- A yellow or red ring around a rider's dot on the map.
- At the top of Ride Mode, **Together** in green, or the number of red riders, such as **2 Separated**, in red. Tap it to see every rider and when they last updated.

## What the Leader and Tail Gunner See

The ride's leader, tail gunner, organizer and co-organizers also get:

- **An alert card** for each yellow or red rider, such as "Mike is 1.7 miles behind the group. Last moving 4 minutes ago." Tap **Navigate** for directions to them. Leaders and organizers can also tap **Regroup** to set a regroup point at their location.
- **A spoken alert and a buzz** the moment a rider turns red, so you don't have to look down.

The alert cards hide when the bottom panel is folded. Tap **Buttons ▲** to open the panel and see them.

:::note
Spoken alerts pause while your own phone has no service. When you lose signal everyone looks quiet, and that's your signal dropping, not theirs.
:::

## Tips

- Ask everyone to share their location for the whole ride so Ride Bubble can see them. See [Share Your Location](/help/location-sharing).
- Give someone the tail gunner role so the back of the group is covered. See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).
