---
title: Join a Ride
summary: Join with an invite link, a QR code or a code, or from Find. Learn what public and private rides show before and after you join.
category: joining
order: 20
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/app/r/[code].tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/get-the-app.web.tsx
  - app/src/core/ride-link.ts
  - app/src/core/joining.ts
  - app/src/core/cancel.ts
  - app/src/lib/api.ts
  - supabase/migrations/20261016000000_join_ride_approval_fix.sql
  - supabase/migrations/20261025000000_rider_approval_fix.sql
  - supabase/migrations/20261011000000_ride_discovery.sql
  - supabase/migrations/20261017430000_riding_groups.sql
related: [find-a-ride, qr-codes, approvals-and-waitlist, check-in, invite-riders, sign-in]
keywords: [join, invite code, ride code, link, accept invite, sign up for ride, rsvp, leave ride, private ride, public ride, tablet]
---

Joining a ride is free, with no limit on how many rides you join. You need a free OnMyLead account.

## Join With a Link

1. Tap the ride link someone sent you.
2. If you have OnMyLead on your iPhone, the ride opens in the app. If not, it opens the ride's page on onmylead.com, with a button to get the app.
3. Tap **Join Ride**.

If you aren't signed in, the button says **Sign In to Join**. See [Sign In](/help/sign-in).

## Join With a Code

1. On the **Rides** tab, tap **Join a Ride**.
2. Type the invite code, for example 7F3A9C21.
3. Tap **Open**.
4. On the ride page, tap **Join Ride**.

## Join With a QR Code

Point your iPhone camera at the ride's QR code and tap the link that appears. See [QR Codes](/help/qr-codes).

## Join From Find

Public rides are listed on the **Find** tab. Open one and tap **Join Ride**. See [Find a Ride](/help/find-a-ride).

## Join From a Group Invite

When someone invites your riding group, you get a notification and the ride shows under **Ride Invites** on the **Rides** tab.

1. Tap the ride.
2. In the **You're Invited** card, tap **Join Ride**, or **No Thanks** to turn it down.

You don't wait for approval when you're invited. If you say no thanks, you can still join later with the ride's link or code. On a ride where the organizer approves riders, you then ask to join like anyone else.

## Public and Private Rides

**Public** rides can be found on the Find tab, and anyone can open their page.

**Private** rides (marked **Private, Invite Only**) never show in Find. You need the link, QR code or invite code to see one.

Before you join either kind, the ride page shows the name, time, general area and details. After you join, you also see:

- The exact meeting point, and directions to it
- The organizer's instructions for joined riders
- The route and planned stops
- Who's going
- The ride chat

## After You Join

The ride shows under **Your Rides** on the **Rides** tab. On the ride page you'll find **Details**, **Map**, **Riders** and **Chat** sections. When you get to the meeting spot, tap **I'm Here and Ready** to check in. See [Check In](/help/check-in).

When the organizer starts the ride, tap **Enter Ride Mode**. See [Ride Mode](/help/ride-mode).

If the ride is full, you go on the waitlist. If the organizer approves riders, you wait for them to say yes. See [Approvals and the Waitlist](/help/approvals-and-waitlist).

## Leave a Ride

1. Open the ride page and tap **Riders**.
2. Tap **Leave Ride**.

Or, on the **Rides** tab, swipe left on the ride and tap **Leave**. Your spot opens up for someone else. You can rejoin with the ride's link or code if there's room. If the ride is live, leaving also stops sharing your location with the group.

:::note
You can't join a ride that has ended or been cancelled.
:::
