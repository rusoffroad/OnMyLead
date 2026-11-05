---
title: Follow the Leader's Trackline
summary: A line in the leader's blue shows where the leader went in Ride Mode. Older passes fade when the leader crosses back over it. The leader can turn it off.
category: ride-mode
order: 15
release: "2.1"
updated: 2026-11-05
sources:
  - app/src/core/leader-trackline.ts
  - app/src/hooks/use-leader-trackline.ts
  - app/src/components/leader-trackline.tsx
  - app/src/components/leader-trackline-ink.ts
  - app/src/hooks/use-leader-trail.ts
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/group-mapbox-map.tsx
  - app/src/components/group-map.tsx
  - supabase/migrations/20261104210000_leader_trackline.sql
related: [ride-mode, leader-sweep-and-tail-gunner, map-layers, privacy]
keywords: [trackline, track line, trail line, breadcrumb, leader line, leader path, where did the leader go, follow the leader, blue line, faded line, dashed line, double back, crossing]
---

In Ride Mode, a line follows behind the leader on every rider's map, in the same blue as the leader's dot. It shows exactly where the leader rode, so at a fork, a wash or a faint two-track you can see which way they went.

The line starts when you open Ride Mode and grows as the leader moves. The leader sees it on their own map too.

## When the Leader Crosses Their Own Line

If the leader crosses the line, rides a loop back to where they started, or doubles back down the same trail, everything from before that point turns faded, thinner and dashed. The line from there on stays bright solid blue and is drawn on top. So where two passes share a trail, the bright line is always the newest one, the one to follow.

Short wiggles, a tight hairpin, or wandering a few yards off the old line on the way back don't start a new pass.

## Turn It Off (Leader)

The line is on for every ride unless the leader turns it off. Turning it off hides it for everyone on the ride, and turning it back on brings it back for everyone, including the part ridden while it was off.

1. In Ride Mode, tap the layers button on the map.
2. Under **Leader Trackline**, tap the row to switch between **On for Everyone** and **Off for Everyone**.

The switch shows for the leader and the ride's organizers. If nobody has the Leader role, the organizer leads. Riders see the line but not the switch. With no signal the switch can't save; try again when you have service.

## Good to Know

- Each phone draws the line from the leader's live position, which riders on the ride already see. Nothing new is uploaded. Your phone keeps the line for the ride you're on, so closing Ride Mode and coming back doesn't lose it, and the next ride's line replaces it.
- If your phone stops hearing from the leader for a while (no signal, or Ride Mode was closed), the line has a gap rather than a straight line across the map. A stop, like lunch or a regroup, doesn't fade the line behind the leader. Open Ride Mode early to see the whole ride.
- If the leader changes partway through the ride, the line starts again from the new leader.
- **iPhone, iPad, Android phones and Android tablets:** the line shows on every map style, including 3D Terrain and the flat Apple or Google map.
- **Website:** the line shows on the live Mapbox map. Where the website shows only a sketch of the route, there's no line.
