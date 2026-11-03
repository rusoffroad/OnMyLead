---
title: Leader, Sweep and Tail Gunner
summary: Who rides up front, who rides at the rear, and how to make someone leader, pick a tail gunner or hand off the ride.
category: rides
order: 50
release: "1.0"
updated: 2026-11-03
sources:
  - app/src/core/leaving.ts
  - app/src/components/leave-ride.tsx
  - app/src/components/ride-roster.tsx
  - app/src/core/roles.ts
  - app/src/core/chat.ts
  - app/src/app/(tabs)/index.tsx
  - app/src/lib/api.ts
  - supabase/migrations/20261014000000_ride_handoff_tail_gunner.sql
  - supabase/migrations/20261015000000_notification_settings.sql
related: [organizer-controls, ride-mode, ride-bubble, ride-chat, follow-leaders]
keywords: [leader, lead, sweep, tail gunner, tail, rear, back of the pack, hand off, give ride, transfer, co-leader, roles, tablet]
---

Every group ride needs someone up front and someone at the back. OnMyLead shows the riding order on the roster: the leader first, the tail gunner last, everyone else in between.

## The Roles

- **Organizer**: the rider who created the ride (or was given it). Runs the ride page, starts and ends Ride Mode, and leads unless someone else is made leader.
- **Leader**: rides up front. Messages sent to the leader in ride chat go to them.
- **Tail Gunner**: rides at the rear so nobody gets left behind. In OnMyLead, the tail gunner is the sweep.
- **Rider**: everyone else.

On the **Riders** section of the ride page, the line at the top of the **Going** list shows who is **Leader** and who is **Tail Gunner** (or "Not picked yet").

## Make Someone Leader

The organizer can put another rider up front while still organizing.

1. On the ride page, tap **Riders**.
2. Tap the rider's name in the **Going** list.
3. Tap **Make Leader**.

To take the lead back, tap their name and tap **Remove as Leader**. You can make more than one rider a leader.

## Pick a Tail Gunner

The organizer or the leader can pick the one rider who rides at the rear.

1. On the ride page, tap **Riders**.
2. Tap the rider's name.
3. Tap **Make Tail Gunner**.

There's only one tail gunner at a time. Picking someone new moves the job to them. To clear it, tap the tail gunner's name and tap **Remove as Tail Gunner**. The leader and organizers ride up front, so they can't also be tail gunner.

## Hand Off the Lead

A rider who was made leader can pass the lead to someone else.

1. On the ride page, tap **Riders**.
2. Tap the rider's name.
3. Tap **Hand Them the Lead**, then **Hand Off**.

They lead from here, messages to the leader go to them, and you stay on the ride as a rider.

## Give Away the Whole Ride

The organizer can hand the entire ride to another rider, for example if you can't make it.

1. On the ride page, tap **Riders**.
2. Tap the rider's name.
3. Tap **Give Them the Ride**, then **Give Ride**.

They become the organizer and the leader. You stay on the ride as a rider and can't undo this yourself.

:::release 2.0
## Leave a Ride You Organize

Can't make it? You don't have to cancel the ride on everyone.

1. Tap **Leave Ride** at the bottom of the ride page (or under **Riders** in Ride Mode).
2. **Who Takes Over?** lists everyone who has joined, leaders and co-organizers first. Tap who should run it.
3. Tap **Give Ride and Leave**.

They become the organizer and the leader, and you're off the ride. Your location sharing for the ride stops. You can rejoin later as a rider with the ride's link or code.

Rather call it off? Tap **Cancel the Ride Instead**. If nobody else has joined yet, **Leave Ride** offers to cancel the ride, since there's nobody to hand it to. See [Edit, Cancel or Delete a Ride](/help/edit-cancel-or-delete-a-ride).

If you were made leader (but aren't the organizer) and you leave, the lead goes back to the organizer.
:::

:::note
Roles can only go to riders who have joined the ride, and they can't change after the ride has ended or been cancelled.
:::

The rider gets a notification when they're made leader, made tail gunner or given the ride.

:::release 1.0.3
Leading a ride earns toward the **Trail Boss** badge, and riding at the rear as tail gunner earns toward **Tail Gunner**. See [Earn Badges and Ranks](/help/badges-and-ranks).
:::
