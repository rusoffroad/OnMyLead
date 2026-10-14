---
title: Edit, Cancel or Delete a Ride
summary: Change your ride's route and stops, call a ride off so riders hear about it, or delete it for good.
category: rides
order: 30
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/r/[code].tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/core/cancel.ts
  - app/src/core/row-swipe.ts
  - app/src/lib/api.ts
  - app/src/app/ride/new.tsx
  - supabase/migrations/20261017000000_cancel_delete_ride.sql
  - supabase/migrations/20261018000000_pro_entitlements.sql
related: [organizer-controls, route-builder, waypoints-and-planned-stops, ride-summary-and-ride-again, create-a-ride]
keywords: [change ride, edit ride, cancel ride, call off, delete ride, remove ride, reschedule, change time, change date, weather cancel, tablet]
---

Plans change. As the organizer you can update the route and stops, cancel the ride so everyone knows it's off, or delete it entirely.

## What You Can Change

On your ride page, you can change:

- **The route.** Open the **Map** section and tap **Edit Route** (or **Build the Route** if there isn't one yet, or **Map a Route Anyway** on a freeride). See [Build a Route](/help/route-builder).
- **Planned stops.** In the **Map** section, tap **Add a Planned Stop**. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
- **Who leads and who rides at the rear.** See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).

:::note
The ride's name, day, meeting time and meeting point can't be changed after the ride is created. To move a ride, tap **Copy This Ride** on its page to start a new one with the same details and route, pick the new day, then cancel the old one. The copy counts as a new ride toward your monthly allowance on Free.
:::

## Cancel a Ride

Cancel when the ride is off but you want everyone to see that it was called off. The ride stays in their list as Cancelled.

1. Open the ride page.
2. In the **You're Organizing** card on **Details**, tap **Cancel Ride**.
3. Read the message. It tells you how many riders will hear about it.
4. Tap **Cancel Ride** to confirm, or **Keep Ride** to go back.

Everyone who joined, asked to join or is on the waitlist gets a notification and an email saying the ride is cancelled. Cancelling can't be undone.

You can cancel a ride that hasn't started yet or one that's live. A ride that has already ended can't be cancelled.

## Delete a Ride

Delete removes the ride for everyone, along with its chat and route. Only the ride's organizer can delete it.

1. Open the ride page.
2. In the **You're Organizing** card, tap **Delete Ride**.
3. Tap **Delete Ride** to confirm.

If the ride hadn't ended yet, everyone on it gets a notification and an email saying it's cancelled. Deleting can't be undone.

:::tip
You can also delete a ride from the **Rides** tab. Swipe left on the ride under **Your Rides** or **Past Rides** and tap **Delete**.
:::

## Cancel or Delete: Which One?

- **Cancel** keeps the ride in everyone's list, marked Cancelled.
- **Delete** removes it, its chat and its route for everyone.

Either way, riders on an upcoming ride are told it's off.

:::note
Cancelling or deleting doesn't give back a ride on a Free account. A ride counts toward the month you created it. See [Free and Pro](/help/free-vs-pro).
:::
