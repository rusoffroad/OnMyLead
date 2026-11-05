---
title: What Other Riders Can See
summary: Your location is never public. See what strangers, riders on your ride and family links can see, and how OnMyLead's server enforces it.
category: safety-privacy
order: 30
release: "1.0"
updated: 2026-11-05
sources:
  - supabase/migrations/20261104050000_badge_leaderboard.sql
  - supabase/migrations/20261102950000_events.sql
  - supabase/migrations/20261102800000_abuse_reports.sql
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
  - app/src/app/out-riding.tsx
  - supabase/migrations/20261101700000_out_riding.sql
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

:::release 1.0.3
- Your profile picture, if you added one. Like your ride name, any signed-in rider can see it, never people who aren't signed in. See [Add a Profile Picture](/help/profile-picture).
:::

- That you're on the ride, your role, and whether you've checked in.
- Your messages in the ride chat, except leader-only messages, which only you and the leader can read.
- Your status taps and quick replies from Ride Mode (and, from 2.0, messages you type there). A status tap carries your phone's location at the moment you tapped it.
- Your live location, but only while you're sharing with the ride.

:::release 2.1
- If you're the leader, the path you've ridden while sharing, drawn as the [Leader Trackline](/help/leader-trackline). Each rider's phone draws it from the live positions it already gets; nothing extra is uploaded. You can turn it off for the ride.
:::

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

:::release 1.0.3
## Out Riding

[Out Riding](/help/out-riding) is off until you switch it on. While it's on, riders who can see you get your ride name, where you said you're riding (if you typed it) and roughly how far away you are in whole miles, never your location. OnMyLead keeps only an area of about a mile, and deletes it when you turn Out Riding off. It turns itself off at the time you picked, or after 6 hours without opening the app. By default only your friends, and riders you've ridden with or share a group with, can see you.

## Friends

Only you and the other rider can see that you're friends, or that one of you sent a request. Nobody can search for riders by name: a rider can only send you a request if they've ridden with you, share a riding group with you, can see you in Out Riding, have messaged with you, or have your friend link. Being friends never shares your location. See [Add Friends](/help/friends).
:::

:::release 2.0
## Reports

The OnMyLead team can't read your direct messages or chats. The one exception is a report: when a rider reports another rider, their messages with that rider (direct messages, and what either of them wrote in the last 30 days in a group or ride chat they share) are saved with the report so the team can look into it. Only the OnMyLead team can read them, and every time they're opened it's logged. See [Report or Block a Rider](/help/report-and-block).

## Your Feed

Home's **Feed** shows your finished rides, badges, shared trails and group rides to **Friends Only** unless you change it. Under **Customize**, **Who Sees Your Activity** can be **Friends and Followers** or **Nobody**. A ride is named only to riders who were on it, or if it was public. Your location is never in a feed. Blocked riders never see your posts. See [Your Home Screen](/help/home-screen).

The same setting decides who can see your posts, likes and comments in Social and your activity on your profile. Photos you post are made smaller and have no location added. Anyone who can see a post can see its photo, and like any photo, someone with its address could pass it on. Sharing to Facebook, Instagram or X only happens when you tap **Share**, and a share never includes your location. See [Like, Comment and Post in Social](/help/social).
:::

:::release 2.1
## The Badge Leaderboard

Signed-in riders can see the badge leaderboard: your ride name, picture, badges and the state or country you picked. Nothing else, and never where you are. Turn off **Show Me on the Leaderboard** to leave it. If **Who Sees Your Activity** is **Nobody**, you're left off until you turn it on. See [See the Badge Leaderboard](/help/badge-leaderboard).
:::

## Blocked Riders

When you block a rider, nothing tells them, and they can't see who has blocked them. See [Report or Block a Rider](/help/report-and-block).

## Your Data

OnMyLead doesn't sell your data or use it for advertising. It shares data only with the services that run the app, such as Apple for notifications and purchases on iPhone. For the full list, read the Privacy Policy at onmylead.com/privacy.

On Android, Google delivers notifications (Firebase Cloud Messaging), handles purchases (Google Play) and draws the map (Google Maps).

:::release 2.0
[Music Controls](/help/music-controls) read what's playing only on your phone. On Android, the optional Notification Access is used only to see the song and the app playing it; OnMyLead never reads or keeps your notifications.

:::release 2.0
Your app settings and your own Map Mode trails (with their photos) are backed up to your account so they show on every device you sign in on. Only you can read that backup; a trail becomes public only when you tap **Share with Everyone**. Track Line and your live location are never part of it. See [Use OnMyLead on More Than One Device](/help/sync-across-devices).
:::
:::

:::release 2.0
When you agree to the Rider Safety and Liability Agreement, a record of it is saved (your account, the version, the time, the device and app version, and your IP address). Other riders never see it, and it's kept as a legal record if you delete your account. See [The Rider Safety and Liability Agreement](/help/rider-safety-agreement#what-gets-saved).
:::

You can delete your account and its data at any time. See [Delete Your Account](/help/delete-account).

:::release 2.0
## Events

An event's place is picked by its host and is shown to everyone who sees the event, so hosts are asked to pick a public spot. It's stored to about 100 m. Events never show any rider's location. Anyone with an event's link can see it, but the names of its hosts, Ride Managers and riders going only show to signed-in riders.
:::
