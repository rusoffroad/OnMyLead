---
title: Waypoints and Planned Stops
summary: Mark camp, fuel, water or a hazard on a ride's map, and let the leader plan numbered stops for the whole group.
category: routes-maps
order: 30
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/ride/[id]/waypoints.tsx
  - app/src/app/r/[code].tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/components/waypoint-sheet.tsx
  - app/src/components/waypoint-row.tsx
  - app/src/components/waypoint-map.tsx
  - app/src/components/waypoint-map.web.tsx
  - app/src/hooks/use-ride-waypoints.ts
  - app/src/core/waypoints.ts
  - app/src/lib/waypoints.ts
  - supabase/migrations/20261018500000_ride_waypoints.sql
  - supabase/migrations/20261019200000_planned_stops.sql
related: [route-builder, leader-sweep-and-tail-gunner, ride-mode, directions, privacy]
keywords: [waypoint, pin, marker, camp, fuel stop, lunch stop, hazard, viewpoint, parking, planned stop, stops]
screenshots:
  - file: waypoints.webp
    shows: app/src/app/ride/[id]/waypoints.tsx
---

Waypoints are named spots you drop on a ride's map: camp, fuel, water, a viewpoint, a hazard or parking. Your own waypoints are only for you. The ride's leader can also share waypoints with everyone on the ride, and plan numbered stops the whole group will make.

![Planned stops and waypoints on a ride](/help/img/waypoints.webp)

Waypoints are never public. Shared ones and planned stops show only to riders on that ride.

## Who Sees What

- **Your waypoints**: only you see them, unless you can share (below).
- **Shared waypoints**: the leader or an organizer can share a waypoint with everyone on the ride.
- **Planned stops**: always shared. Every rider sees them numbered on the map, in order.

The leader is the rider with the Leader role, or the organizer when nobody has it. See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).

You need to have joined the ride to add or see its waypoints.

## Add a Waypoint

1. Open the ride and tap the **Map** tab.
2. Under **Waypoints**, tap **Add a Waypoint** (or **Open Waypoints Map** if there are some already).
3. Press and hold the map where you want it. To mark where you're standing, tap **Add at My Location** instead.
4. Pick what it is: **Spot**, **Camp**, **Fuel**, **Water**, **Viewpoint**, **Hazard** or **Parking**. The name fills in for you.
5. Change the **Name** if you like, and add a **Note (Optional)**.
6. If you're the leader or an organizer, choose who it's for under **What It Is** (see below).
7. Tap **Save Waypoint**.

In Ride Mode, tap **Add Waypoint** to drop one where you are, or press and hold the map. See [Ride Mode](/help/ride-mode).

Names can be up to 60 characters and notes up to 280.

### Sharing a Waypoint (Leader and Organizers)

When the leader or an organizer adds a waypoint, they choose:

- **Planned Stop**: the whole ride stops here. Numbered on every rider's map.
- **Everyone on the Ride**: shows on every rider's map.
- **Just Me**: only you see it.

New waypoints from the leader or an organizer start as **Everyone on the Ride**, and you can switch to **Just Me**.

## Plan the Ride's Stops

Planned stops tell everyone where the group will stop for fuel, lunch or camp, and in what order.

1. Open the ride and tap the **Map** tab.
2. Under **Planned Stops**, tap **Add a Planned Stop**.
3. Press and hold the map where the group will stop.
4. Pick what it is and give it a name.
5. Add a **Planned Time (Optional)**, like "12:30 pm".
6. Tap **Save Planned Stop**.

Stops are numbered in the order you add them. To change the order:

1. Tap a planned stop on the map or in the list.
2. Tap **Move Earlier** or **Move Later**.

The leader or an organizer can edit any planned stop on the ride, even ones someone else added, so the plan carries on if the leader changes.

## View, Navigate, Edit or Remove

Tap a waypoint on the map or in the list to open it. You'll see its type, who it's from, the note and its coordinates.

- **Navigate**: get directions in your maps app. See [Directions](/help/directions).
- **Edit**: change it. You can edit your own waypoints. The leader or an organizer can also edit planned stops.
- **Remove**: take it off the map. You can remove your own. The leader or an organizer can also remove shared ones. When a shared waypoint is removed, everyone stops seeing it.

## On the Website

The waypoints map works on onmylead.com too. Click the map to drop a waypoint, and click a waypoint to open it.

:::release tablet
On a tablet held sideways, the waypoint list sits beside the map; swipe it up or tap **Hide** to fold it.
:::

## No Signal

The waypoints you can see are saved on your phone, so they stay on the map without signal. The panel shows **Saved on This Phone** when that's what you're seeing.

## Limits

Each rider can add up to 100 waypoints on a ride. If you reach that, remove one to add another.

:::note
Waypoints are different from the numbered points you tap when drawing a route. Route points shape the line; waypoints mark places along the way.
:::
