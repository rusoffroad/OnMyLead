---
title: What Other Riders Can See
summary: Your location is never public. See what strangers, riders on your ride and family links can see, and how OnMyLead's server enforces it.
category: safety-privacy
order: 30
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/privacy.tsx
  - app/src/app/r/[code].tsx
  - app/src/core/geo.ts
  - app/src/core/sharing.ts
  - app/src/core/chat.ts
  - app/src/lib/api.ts
  - supabase/migrations/20261007000000_init.sql
  - supabase/migrations/20261010000000_chat_summary_fuel.sql
  - supabase/migrations/20261012000000_chat_leader_push.sql
  - supabase/migrations/20261020000000_blocked_riders.sql
related: [location-sharing, family-link, report-and-block, ride-name-and-profile, delete-account]
keywords: [privacy, private, who can see me, meeting point, exact location, rounded, public ride, data, safe, stranger, tablet]
---

OnMyLead is built so your location is never public. You choose who sees it and for how long, and sharing always ends. These rules are enforced by OnMyLead's server, not just hidden in the app.

## Before You Join a Ride

Anyone can see a ride's public page: its name, time, description and details such as difficulty and vehicles. What they don't get:

- **The exact meeting point.** Public listings and the ride map show a meeting area rounded to about a mile. The ride page says **Shown after you join**, or **Near** and the area's name.
- **The route, the meeting instructions and the roster.** Only riders who have joined the ride get these.

The exact meeting point and the route are stored separately from the public ride, and the server only hands them to riders on the ride.

## Riders on Your Ride

Once you've joined a ride, the other riders on it can see:

- Your ride name. If you turned on **Show My Google (or Apple or Facebook) Profile**, they also see that account's name and photo. See [Your Ride Name and Profile](/help/ride-name-and-profile).
- That you're on the ride, your role, and whether you've checked in.
- Your messages in the ride chat, except leader-only messages, which only you and the leader can read.
- Your status taps and quick replies from Ride Mode. A status tap carries your phone's location at the moment you tapped it.
- Your live location, but only while you're sharing with the ride.

## Your Live Location

The server only lets someone read your location while all of these are true:

- You have turned sharing on.
- Your share hasn't run out or been stopped.
- They are someone your share covers: a rider on that ride, a rider you picked, or someone with your family link.
- For ride sharing, the ride is still going and you're still on it.

When the ride ends, every ride share on it stops at once. When you leave a ride, your share for it stops. See [Share Your Location](/help/location-sharing).

## Your Ride Track

While you share with a ride, your phone keeps a track of where you rode for your ride summary. Only you can see your own track. The group summary shows totals only, never anyone's route.

## Waypoints

Waypoints you drop are only yours, unless you're the ride's leader and choose to share one with the ride. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).

## Family Links

Anyone with your family link can see your last location until that share ends. See [Share a Family Link](/help/family-link).

## Blocked Riders

When you block a rider, nothing tells them, and they can't see who has blocked them. See [Report or Block a Rider](/help/report-and-block).

## Your Data

OnMyLead doesn't sell your data or use it for advertising. It shares data only with the services that run the app, such as Apple for notifications and purchases on iPhone. For the full list, read the Privacy Policy at onmylead.com/privacy.

:::release android
On Android, Google delivers notifications (Firebase Cloud Messaging), handles purchases (Google Play) and draws the map (Google Maps).
:::

You can delete your account and its data at any time. See [Delete Your Account](/help/delete-account).
