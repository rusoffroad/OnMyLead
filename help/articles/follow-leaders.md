---
title: Follow a Ride Leader
summary: Follow the riders who organize and lead your favorite rides and get a notification when they post a new public ride.
category: groups
order: 30
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/components/follow-leaders.tsx
  - app/src/app/r/[code].tsx
  - app/src/app/(tabs)/groups.tsx
  - app/src/lib/groups.ts
  - app/src/core/groups.ts
  - app/src/core/notifications.ts
  - supabase/migrations/20261017430000_riding_groups.sql
related: [find-a-ride, join-a-ride, riding-groups, notification-settings]
keywords: [follow, follower, unfollow, leader, organizer, new rides, notifications, tablet]
---

Liked a ride? Follow the rider who organized or led it, and you'll hear when they post their next public ride. Following is free.

## Follow a Leader

1. Open the ride's page. If you've joined the ride, go to **Riders**.
2. Find the organizer or ride leader. Each one is labeled **Organizer** or **Ride Leader**.
3. Tap **Follow**. The button changes to **Following**.

To stop, tap **Following** on a ride page, or use **Unfollow** on the Groups tab (see below).

You can't follow yourself, so your own name doesn't get a Follow button.

## What You Get

- A notification when a leader you follow posts a new public ride. Private and unlisted rides are never announced to followers.
- On the **Groups** tab, under **Leaders You Follow**, a list of the leaders you follow, and under **Their Upcoming Rides**, their upcoming public rides.

To turn these notifications off, switch off **Leaders You Follow** in [Notification Settings](/help/notification-settings).

## Unfollow a Leader

1. Tap the **Groups** tab.
2. Under **Leaders You Follow**, tap **Unfollow** next to the leader.

## Who Sees a Follow

Only you and the leader can see that you follow them. If riders follow you, the Groups tab shows how many.
