---
title: Edit, Cancel or Delete a Ride
summary: Change your ride's name, day, time, meeting point, route and details, call a ride off so riders hear about it, or delete it for good.
category: rides
order: 30
release: "1.0"
updated: 2026-11-10
sources:
  - app/src/app/r/[code].tsx
  - app/src/app/ride/[id]/edit.tsx
  - app/src/core/ride-edit.ts
  - supabase/migrations/20261104120000_edit_ride_details.sql
  - app/src/app/(tabs)/index.tsx
  - app/src/core/cancel.ts
  - app/src/core/row-swipe.ts
  - app/src/components/swipe-row.tsx
  - app/src/components/swipe-row.web.tsx
  - app/src/lib/api.ts
  - app/src/app/ride/new.tsx
  - supabase/migrations/20261017000000_cancel_delete_ride.sql
  - supabase/migrations/20261018000000_pro_entitlements.sql
related: [organizer-controls, route-builder, waypoints-and-planned-stops, ride-summary-and-ride-again, create-a-ride]
keywords: [change ride, edit ride, edit ride details, change meeting point, rename ride, website, onmylead.com, cancel ride, call off, delete ride, remove ride, reschedule, change time, change date, weather cancel, tablet]
---

Plans change. As the organizer (or a co-organizer) you can update the ride's details, change the route and stops, cancel the ride so everyone knows it's off, or delete it entirely.

:::until 2.1
## What You Can Change

On your ride page, you can change:

- **The route.** Open the **Map** section and tap **Edit Route** (or **Build the Route** if there isn't one yet, or **Map a Route Anyway** on a freeride). See [Build a Route](/help/route-builder).
- **Planned stops.** In the **Map** section, tap **Add a Planned Stop**. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
- **Who leads and who rides at the rear.** See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).

:::note
The ride's name, day, meeting time and meeting point can't be changed after the ride is created. To move a ride, tap **Copy This Ride** on its page to start a new one with the same details and route, pick the new day, then cancel the old one. The copy counts as a new ride toward your monthly allowance on Free.
:::
:::

:::release 2.1
## Edit Ride Details

1. Open the ride page.
2. In the **You're Organizing** card on **Details**, tap **Edit Ride Details**.
3. Change what you need and tap **Save Changes**. **Cancel** leaves everything as it was.

You can change the name, the day and meeting time, the departure and expected finish times, the meeting point (search a place, use your location, type coordinates, or tap the map on onmylead.com), the place name, the state a public ride is listed in, the description, destination, route length, difficulty, experience, the vehicles welcome, whether you approve riders, the vehicle and rider limits, what to bring, required equipment, fuel notes and the instructions joined riders see (on a ride whose meeting point never saved, the instructions box appears once you pick the point, and stays while it holds text).

The box above **Save Changes** says what the save will do before you tap it, or **Not Ready to Save** with the reason while something stops it (a blank name, a time that doesn't read, a half-typed meeting point, instructions before a meeting point):

- **A new time or meeting point** sends everyone on the ride (including riders waiting for approval or on the waitlist) a notification, and the ride page shows **Updated** with what changed for a week, so nobody turns up at the old spot. Ride reminders move to the new time.
- **Other details** (the description, limits, what to bring and so on) just update on the ride page, marked Updated. No notification.

Lowering a vehicle or rider limit never removes anyone who already joined. A private ride stays open to anyone with its code.

Co-organizers can edit the ride too. Riders can't.

:::note
Once the ride is **live**, the day, times and meeting point are locked, because everyone is already out riding. The name and the other details can still change. A ride that has ended or been cancelled can't be edited: tap **Ride Again** or **Copy This Ride** to plan the next one.
:::

The same **Edit Ride Details** button is on the ride page at onmylead.com, so you can make changes on a big screen. On an iPad or Android tablet turned sideways, the day, times and meeting point sit on the left and the rest of the details on the right.

## The Route, Stops and Roles

- **The route.** Open the **Map** section and tap **Edit Route** (or **Build the Route** if there isn't one yet, or **Map a Route Anyway** on a freeride). See [Build a Route](/help/route-builder).
- **Planned stops.** In the **Map** section, tap **Add a Planned Stop**. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
- **Who leads and who rides at the rear.** See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).
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
:::until 3.0
You can also delete a ride from the **Rides** tab. Swipe left on the ride under **Your Rides** or **Past Rides** and tap **Delete**.
:::
:::release 3.0
You can also delete a ride from the **Home** tab. Swipe left on the ride under **Your Rides** or **Past Rides** and tap **Delete**.
:::

On onmylead.com there's nothing to swipe: each ride on the **Rides** page has its own button at the end of the row. Click the trash can (**Delete**) on a ride you organize, then confirm. On a ride someone else organizes the button is **Leave** (or **Decline** for an invite).
:::

## Cancel or Delete: Which One?

- **Cancel** keeps the ride in everyone's list, marked Cancelled.
- **Delete** removes it, its chat and its route for everyone.

Either way, riders on an upcoming ride are told it's off.

:::note
Cancelling or deleting doesn't give back a ride on a Free account. A ride counts toward the month you created it. See [Free and Pro](/help/free-vs-pro).
:::
