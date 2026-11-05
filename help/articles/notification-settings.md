---
title: Notification Settings
summary: Choose which ride, chat, group and account notifications you get, set a ride reminder and quiet hours. Help and EMERGENCY alerts always come through.
category: account
order: 30
release: "1.0"
updated: 2026-11-05
sources:
  - supabase/migrations/20261104150000_waypoint_alerts.sql
  - app/src/app/notifications.tsx
  - app/src/core/notifications.ts
  - app/src/lib/notification-settings.ts
  - app/src/lib/push.ts
  - app/src/core/push-tap.ts
  - app/src/lib/push.web.ts
  - app/src/components/message-alerts.tsx
  - app/src/app/(tabs)/profile.tsx
  - supabase/migrations/20261101500000_rider_badges.sql
  - supabase/migrations/20261101700000_out_riding.sql
related: [emergency-siren, notifications-inbox, getting-started, status-buttons, ride-chat, group-chat, follow-leaders, emergency-and-safety, pro-trial, troubleshooting]
keywords: [notifications, push, alerts, mute, quiet hours, do not disturb, reminder, lock screen, preview, emails, sound]
---

You decide what OnMyLead tells you about. Every change saves as soon as you make it, and your choices apply on any device you sign in on.

## Open Notification Settings

1. Go to the **You** tab.
2. Under **Settings**, tap **Notifications**. The line under it sums up your settings, like **Everything on** or **2 turned off**.

:::release 2.0
You can also tap the bell at the top of the **Rides** tab, then **Notification Settings** at the bottom of the list.
:::

## Always On: Help and EMERGENCY

When someone in your group taps **Need Help** or **EMERGENCY**, you're always told, even during quiet hours. This can't be turned off.

:::release 2.1
**Emergency Siren**, just below, starts on: an EMERGENCY from your group sounds a loud siren until you silence it. Tap **Play Siren** to hear it, or switch it off to get EMERGENCY notifications with the normal sound. See [Hear the Emergency Siren](/help/emergency-siren).
:::

## What You Can Turn On or Off

Everything below starts on.

### On the Trail

- **Rider Status**: status buttons and quick replies from Ride Mode, like **On My Way**, **Need Fuel** and **Flat Tire**, and when a rider cancels one.
- **Announcements**: what the organizer tells the whole group.
:::release 2.1
- **Announcements** also cover new waypoints the leader shares while the ride is live. See [New Waypoint Alerts](/help/waypoints-and-planned-stops#new-waypoint-alerts).
:::

:::release 2.0
Messages riders type in Ride Mode with **✎ Message** follow the **Rider Status** setting too.
:::

### Ride Chat

- **Group Chat**: messages and quick replies from your group.
- **Messages to the Leader**: leader-only messages, when you're leading.
- **Show Message Text**: turn this off to keep messages off your lock screen. You'll see who wrote, not what.

### Before the Ride

- **Ride Changes**: a ride starts, is cancelled, or gets a new time or meeting spot, or you get a spot or a role.
- **New Riders**: someone joins or asks to join a ride you organize.
- **Email When a Ride Is Cancelled**: an email as well as the notification if a ride you joined is cancelled or removed.

### Your Riding Groups

- **Ride Invites**: someone invites you, or a group you're in, to a ride.
- **Riding Group Chat**: new messages in your riding groups' chats. To mute just one group, do it from that group's chat. See [Group Chat](/help/group-chat).
- **Leaders You Follow**: a leader you follow posts a new public ride.

:::release 1.0.3
- **Direct Messages**: a rider messages you, say after seeing you Out Riding. To mute one conversation, do it from inside it. See [See Who's Out Riding Nearby](/help/out-riding).
- **Friend Requests**: a rider asks to be your friend, or accepts your request. See [Add Friends](/help/friends).
:::
:::release 2.0
- **Likes and Comments**: a rider likes or comments on your post, ride, badge or trail, or replies after you comment. Likes on one post come at most once every 15 minutes. See [Like, Comment and Post in Social](/help/social).
:::
:::release 2.1
- **Likes and Comments** also covers a rider liking or replying to your comment. Likes on one comment come at most once every 15 minutes too.
:::

### Your Account

:::until 1.0.3
- **Pro Trial Reminders**: a week, 3 days and a day before your Pro Trial ends, and when it does.
:::
:::release 1.0.3
- **Badges and Pro Trial**: when you earn a badge (see [Earn Badges and Ranks](/help/badges-and-ranks)), and a week, 3 days and a day before your Pro Trial ends. It also tells you when a trail you shared is hidden from the public map (see [Navigate Offroad and Map Your Own Trails](/help/navigation-mode)).
:::
- **Email Me Too**: the same Pro Trial reminders by email.

## Tapping a Notification

Tapping a notification takes you straight to what it's about, whether OnMyLead was open, in the background or closed:

- A status tap like **Need Help**, a quick reply, or a ride going live opens **Ride Mode** for that ride.
- A ride chat message opens the ride's **Chat**.
- A riding group message opens that group's chat.
- Ride changes, new riders, invites and reminders open the ride.
:::release 1.0.3
- A new badge opens **Badges**.
- A direct message opens the conversation.
- A friend request, or a request someone accepted, opens **Friends**.
- A trail of yours being hidden opens **My Trails**.
:::
:::release 2.0
- A like or a comment opens that post with all its comments.
:::

:::release 2.0
Notifications you've missed or swiped away are kept under the bell on the **Rides** tab for 30 days. See [See and Clear Your Notifications](/help/notifications-inbox).
:::

## Ride Reminder

Get a heads-up before each ride you've joined, with the meeting spot. Under **Ride reminder**, pick **Off**, **30 Min**, **1 Hour**, **2 Hours** or **Day Before**. It starts at **1 Hour**.

## Quiet Hours

1. Under **Quiet hours**, turn on **Silence Overnight**.
2. Use the minus and plus buttons under **From** and **Until** to set the times. Each tap moves the time by half an hour.

During quiet hours everything is held except help alerts. Until you change them, quiet hours run from 10 PM to 6 AM.

## If Notifications Aren't Arriving

- If you see **Notifications Are Off for OnMyLead**, your iPhone is blocking them. Tap **Open iPhone Settings** and turn on **Allow Notifications**.

On Android, the button is **Open Settings**. Android also sorts OnMyLead's notifications into three categories you can tune in **Settings > Apps > OnMyLead > Notifications**: **Rider Alerts** (Need Help, EMERGENCY and other status taps, shown at the highest priority), **Ride Chat** (ride and group chat) and **Ride Updates** (ride changes, new riders, invites, reminders and account notices).
- If you see **Let OnMyLead Send Notifications**, tap **Turn On Notifications** and allow them.
- While OnMyLead is open, new ride chat messages pop up inside the app instead of as a banner.

## On the Website

You can change these settings at onmylead.com too. Notifications themselves come to the app on your phone or tablet.
