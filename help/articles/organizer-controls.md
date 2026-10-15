---
title: Organizer Controls
summary: Everything you can do as a ride's organizer, from starting Ride Mode and approving riders to ending the ride for everyone.
category: rides
order: 40
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/app/r/[code].tsx
  - app/src/components/ride-roster.tsx
  - app/src/components/invite-card.tsx
  - app/src/components/group-invite.tsx
  - app/src/core/roles.ts
  - app/src/core/cancel.ts
  - app/src/lib/api.ts
  - supabase/migrations/20261007000000_init.sql
  - supabase/migrations/20261015000000_notification_settings.sql
related: [leader-sweep-and-tail-gunner, approvals-and-waitlist, edit-cancel-or-delete-a-ride, ride-mode, invite-riders, ride-chat]
keywords: [organizer, host, run a ride, start ride, end ride, manage riders, approve, announcement, admin of ride, tablet]
---

When you create a ride, you're its organizer. You're also its leader until you hand that job to someone else. Here's what you can do from your ride page.

## Before the Ride

- **Invite riders.** Share the link, code or QR code, or invite a whole riding group. See [Invite Riders](/help/invite-riders).
- **Approve requests.** If riders asked to join, the **Riders** section shows a red count and a **Waiting for You** list with **Approve** and **Decline**. See [Approvals and the Waitlist](/help/approvals-and-waitlist).
- **Build or edit the route** and add planned stops in the **Map** section. See [Build a Route](/help/route-builder).
- **Pick a leader and a tail gunner** from the roster in **Riders**. See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).
- **Post announcements** in the ride chat. Your latest announcement is pinned near the top of the ride page for everyone on the ride. See [Ride Chat](/help/ride-chat).

You get a notification when someone joins or asks to join a ride you organize. You can turn these off in [Notification Settings](/help/notification-settings).

## Start the Ride

1. Open the ride page.
2. Tap **Start Ride Mode**.

The ride goes live, riders on it get a notification that it started, and Ride Mode opens for you. Everyone else on the ride sees **Enter Ride Mode** on the ride page, and a banner on their **Rides** tab. See [Ride Mode](/help/ride-mode).

## End the Ride

When everyone is off the trail:

1. Open the ride page.
2. In the **You're Organizing** card on **Details**, tap **End Ride for Everyone**.

Ending the ride stops everyone's location sharing for this ride. Riders then see their ride summary on the ride page. See [Ride Summary and Ride Again](/help/ride-summary-and-ride-again).

:::warning
A live ride doesn't end by itself. Remember to tap **End Ride for Everyone** when you're done, so location sharing for the ride stops.
:::

## Hand Off the Whole Ride

If you can't make it, give the ride to another rider who has joined. Open **Riders**, tap their name and tap **Give Them the Ride**. They become the organizer and leader, and you stay on the ride as a rider. You can't undo this yourself. See [Leader, Sweep and Tail Gunner](/help/leader-sweep-and-tail-gunner).

## Call It Off

Use **Cancel Ride** or **Delete Ride** in the **You're Organizing** card. See [Edit, Cancel or Delete a Ride](/help/edit-cancel-or-delete-a-ride).

## Run It Again

Tap **Copy This Ride** (or **Ride Again** after it ends) to start a new ride with the same details and route. See [Ride Summary and Ride Again](/help/ride-summary-and-ride-again).

:::note
As the organizer you can't leave your own ride. Hand it to another rider first if you need to step away.
:::
