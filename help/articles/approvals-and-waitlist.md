---
title: Approvals and the Waitlist
summary: How join requests work on rides where the organizer approves riders, and how the waitlist fills open spots on a full ride.
category: joining
order: 50
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/r/[code].tsx
  - app/src/app/ride/new.tsx
  - app/src/core/joining.ts
  - app/src/lib/api.ts
  - app/src/components/ride-roster.tsx
  - supabase/migrations/20261016000000_join_ride_approval_fix.sql
  - supabase/migrations/20261025000000_rider_approval_fix.sql
  - supabase/migrations/20261007000000_init.sql
  - supabase/migrations/20261015000000_notification_settings.sql
related: [join-a-ride, create-a-ride, organizer-controls, invite-riders, notification-settings]
keywords: [approve, approval, request to join, pending, waiting, decline, waitlist, wait list, full ride, max riders, max vehicles, spots]
---

Organizers can choose to approve each rider on a public ride, and can cap how many riders or vehicles come along. Here's what happens on both sides.

## Rides That Need Approval

When creating a public ride, the organizer picks **I Approve Riders** under **Joining**. See [Create a Ride](/help/create-a-ride).

### If You're Asking to Join

1. Open the ride page.
2. Tap **Request to Join**.

The page shows "Your request is waiting for the organizer." You get a notification when you're approved. Until then you don't see the exact meeting point or the group.

This is the same whether you found the ride on **Find** or opened it with its link, QR code or invite code. Only riders the organizer invited through a riding group skip approval. See [Invite Riders](/help/invite-riders).

### If You're the Organizer

You get a notification when someone asks to join. Then:

1. Open the ride page. The **Riders** section shows a red count of requests waiting.
2. Tap **Riders**.
3. Under **Waiting for You**, tap **Approve** or **Decline** next to each rider.

If you set **Max Riders** or **Max Vehicles** and the ride is already full, a rider you approve goes on the waitlist instead. They move up automatically when a spot opens.

## The Waitlist

If the organizer set **Max Riders** or **Max Vehicles** and the ride is full, new riders go on the waitlist. That includes riders the organizer approves and riders invited through a riding group. The page shows "You're on the waitlist. You'll move up automatically if a spot opens."

When a rider leaves, riders on the waitlist move up in the order they joined, as long as they fit. You get a notification when you have a spot.

The **Spots** line on the ride page shows how full the ride is, like "8 of 10 vehicles". Riders on the ride can see how many are on the waitlist under the **Going** list.

## Leaving the Waitlist or a Request

Open the ride page and tap **Leave Ride**, or swipe left on the ride on the **Rides** tab and tap **Leave**.

:::note
If the ride is cancelled, riders who asked to join or are on the waitlist get a notification and an email too.
:::
