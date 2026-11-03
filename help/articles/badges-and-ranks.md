---
title: Earn Badges and Ranks
summary: Earn Bronze, Silver and Gold badges for leading, riding, miles and trails, see your rank on the You tab, and spot other riders' top badge.
category: account
order: 25
release: "1.0.3"
updated: 2026-11-03
sources:
  - supabase/migrations/20261103700000_brand_ambassador.sql
  - supabase/migrations/20261103900000_founder_badge.sql
  - app/src/components/badge-strip.tsx
  - supabase/migrations/20261102200000_ride_miles_cleanup.sql
  - app/src/app/badges.tsx
  - app/src/core/badges.ts
  - app/src/lib/badges.ts
  - app/src/components/badge-patch.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/components/rider-list.tsx
  - app/src/components/ride-roster.tsx
  - supabase/migrations/20261101500000_rider_badges.sql
related: [badge-leaderboard, ride-name-and-profile, leader-sweep-and-tail-gunner, ride-summary-and-ride-again, notification-settings]
keywords: [badges, leaderboard, brand ambassador, ambassador, founder, rank, ranking, achievements, levels, trail boss, tail gunner, crew rider, mile eater, trailblazer, mapmaker, trail scout, expert leader, legend]
---

Badges show what you have done on OnMyLead. Each badge has three levels, **Bronze**, **Silver** and **Gold**, and the levels you earn add up to your rank.

## The Badges

| Badge | What earns it | Bronze | Silver | Gold |
|---|---|---|---|---|
| **Trail Boss** | Lead group rides | 1 ride | 10 rides | 25 rides |
| **Tail Gunner** | Ride at the rear as tail gunner | 1 ride | 10 rides | 25 rides |
| **Crew Rider** | Ride with a group | 1 ride | 10 rides | 50 rides |
| **Mile Eater** | Miles on your rides | 100 miles | 1,000 miles | 5,000 miles |
| **Trailblazer** | Share trails you mapped with every rider | 1 trail | 5 trails | 20 trails |
| **Mapmaker** | Your shared trails rated accurate by other riders | 1 trail | 5 trails | 20 trails |
| **Trail Scout** | Rate trails for accuracy | 5 trails | 25 trails | 100 trails |

Leading counts when you are the ride's leader as it ends: the organizer, or the rider the organizer made **Leader** or handed the lead to. See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).

## How a Ride Counts

- A ride counts once it ends.
- It counts for you when your own location track on that ride covers at least half a mile, so share your location in **Ride Mode** while you ride.
- **Trail Boss**, **Tail Gunner** and **Crew Rider** also need at least two riders with a track, so a ride you end on your own doesn't count toward them. Your miles on it still do.
- Miles come from your own track, with GPS jumps and time stopped left out, the same way as the ride summary.

:::release 2.0
Rough locations, GPS bounces and time with your location off are left out of your miles too, the same as the ride summary.
:::
- No signal on the trail? Your track uploads when your phone gets service again, and the ride counts then.

Badges are worked out by OnMyLead's server from what you really ride, so nobody can add one by hand. Once you earn a badge, you keep it.

:::release 2.0
## Brand Ambassador and OnMyLead Founder

OnMyLead gives two special badges. They have no Bronze, Silver or Gold, you can't earn them by riding, and they don't count toward your rank.

| Badge | Who has it | Looks like |
|---|---|---|
| **OnMyLead Founder** | The rider who started OnMyLead | A red patch with a flag planted on a summit |
| **Brand Ambassador** | Riders who represent OnMyLead | A blue patch with the OnMyLead mountains and red arrow |

If OnMyLead gives you one:

- You get a notification, for example **You're an OnMyLead Brand Ambassador**.
- It shows at the top of **Badges** and first in the badge row on the **You** tab.
- It shows beside your name instead of your top riding badge, and on the Feed and your profile.
:::

## Your Rank

Every level you earn counts once toward your rank. There are 21 levels in all.

| Rank | Levels earned |
|---|---|
| **Rookie** | 0 |
| **Rider** | 1 |
| **Veteran** | 4 |
| **Expert** | 9 |
| **Legend** | 15 |

## See Your Badges

1. Go to the **You** tab. Under your name you see your rank and a row of all seven badges. Earned badges are in their Bronze, Silver or Gold color; the rest are outlines.
2. Tap the row to open **Badges**.
3. Each badge shows its level, what earns it and how far you are from the next level, for example **4 of 10 rides led for Silver**.

A badge you just earned is marked **New** until you open **Badges**.

On a tablet, **Badges** shows two columns in portrait and three in landscape.

## When You Earn a Badge

You get a notification, for example **New Badge: Trail Boss Silver**. Tap it to open **Badges**. To turn these off, switch off **Badges and Pro Trial** in [Notification Settings](/help/notification-settings).

## Other Riders' Badges

Each rider's top badge shows as a small patch beside their name in the ride's **Going** list, the **Riders** list in **Ride Mode** and the riders list beside the map on a tablet. Other riders see your badges and rank level, never your exact ride count or miles.

:::release 2.1
## The Leaderboard

See how your badge levels compare with other riders, everywhere or in your country and state, from **Leaderboard** on **Badges**. See [See the Badge Leaderboard](/help/badge-leaderboard).
:::
