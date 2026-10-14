---
title: Leader, Sweep and Tail Gunner
summary: Who rides up front, who rides at the rear, and how to make someone leader, pick a tail gunner or hand off the ride.
category: rides
order: 50
release: "1.0"
updated: 2026-10-14
sources:
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

:::note
Roles can only go to riders who have joined the ride, and they can't change after the ride has ended or been cancelled.
:::

The rider gets a notification when they're made leader, made tail gunner or given the ride.
