---
title: Your Home Screen
summary: What's on the Rides tab from version 2.0. Join, create and find rides, Map Mode, your group, public rides near you, your feed, badges and toolkit.
category: getting-started
order: 15
release: "2.0"
updated: 2026-11-03
sources:
  - app/src/components/home/events-card.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/home/**
  - app/src/components/inbox-bell.tsx
  - app/src/components/badge-strip.tsx
  - app/src/components/bottom-sheet.tsx
  - app/src/core/home.ts
  - app/src/core/feed.ts
  - app/src/lib/feed.ts
  - app/src/core/track-line.ts
  - supabase/migrations/20261102300000_home_feed.sql
related: [join-a-ride, create-a-ride, find-a-ride, navigation-mode, riding-groups, friends, follow-leaders, badges-and-ranks, use-onmylead-on-a-tablet]
keywords: [home, home screen, rides tab, main screen, feed, activity, customize feed, who sees my activity, toolkit, public rides near me, distance, radius, 500 miles, rides left, unlimited, your group]
---

The **Rides** tab is your home screen. It puts the three things riders do most at the top (join, create and find a ride), then Map Mode, your rides, your crew and what your friends have been up to.

## At the Top

- **Good morning**, **Good afternoon** or **Good evening** with your ride name. When friends are out riding, a line under it says how many. Tap it for [Who's Riding](/help/out-riding).
- **The bell** opens your notifications, with a red number for new ones. See [See and Clear Your Notifications](/help/notifications-inbox).
- **Your picture** (or your first letter) opens the **You** tab.

## Join, Create and Find

- **Join a Ride**, the big red card: type the invite code from the ride leader and tap **Join**. You can also open a ride's link or scan its QR code with your phone's camera. Joining is **Unlimited** on every plan. See [Join a Ride](/help/join-a-ride).
- **Create a Ride**, the dark card with the red flag under Join: the label says how many rides you have left this month on Free (**1 Left This Month**, or **None Left This Month**), or **Unlimited** on Pro and during the trial. Tap the label on Free to see what Pro adds. See [Create a Ride](/help/create-a-ride) and [Free and Pro](/help/free-vs-pro).
- **Find a Ride**: opens the map of public rides. The label shows how many are coming up near you, like **12 Within 500 mi**. See [Find a Ride](/help/find-a-ride).

When one of your rides is live, a card says **Your ride is live. Tap to open Ride Mode**.

## Map Mode

Your offroad map for when you're not on a group ride. The card shows a small map with your Track Line, and how many rider trails are near you when location is allowed.

- **Open Map** opens Map Mode.
- **Map a Custom Trail** opens Map Mode ready to draw a trail that isn't marked on any map.
- **Track Line** draws where you've been, a new colour each day: today red, yesterday blue, older days gold.

See [Navigate Offroad and Map Your Own Trails](/help/navigation-mode).

## Events

Under Map Mode, the **Events** card opens the Events area: rallies, poker runs and ride weekends. It shows your next event (one you host or said you're going to), or else the next public event near you, and how many are coming up. See [Events](/help/events).

## Your Rides

- **Ride Invites**: rides your riding groups invited you to.
- **Your Next Ride**: the soonest ride you're on. If you're on more than one, tap **All** to see them all.
- **Past Rides**: rides that ended. Free shows your last few; see [Free and Pro](/help/free-vs-pro).

Swipe a ride left to delete it (if you organize it) or leave it. On onmylead.com, click **Delete** or **Leave** at the end of the row. The app always asks first.

## Your Group

Your riding group with the newest group chat message (or your first group), with how many riders are in it, how many of them are out riding now, and the newest message.

- **Group Chat** opens the group's chat.
- **Plan a Group Ride** starts a new ride with that group already picked to invite. Creating rides follows your plan's ride limit.
- Tap the group's name for its page. With more than one group, **All** opens the **Groups** tab.

No group yet? **Ride With the Same Crew?** takes you to the **Groups** tab. See [Riding Groups](/help/riding-groups).

## Public Rides Near You

Upcoming public rides, nearest first, as cards you swipe sideways. Each shows how far away its meeting area is, the date and time, and the area. Tap one to open it.

To change how far it looks, tap the distance chip (**Within 500 mi** at first) and pick **50 mi**, **100 mi**, **250 mi**, **500 mi**, **1,000 mi** or **Anywhere**, then **Done**. Your phone remembers it.

The home screen never asks for your location. If you've already allowed it, rides are measured from where you are. If not, you see every upcoming public ride.

## Feed

What your friends, riders you follow and your riding groups have been up to in the last 30 days:

- friends out riding right now (always at the top),
- finished rides, with the miles and how many rode,
- badges earned,
- trails shared with every rider,
- rides posted to your riding groups.

Tap a post about a group ride or a trail to open it. The feed shows a few posts; tap **Show More** for the rest.

:::release 2.0
Riders' own posts show in the feed too. Tap the **heart** on any post to like it, or tap the post to open it in **Social** with every comment. **Open Social**, next to **Customize**, shows all your friends' activity, your friends and your posts. See [Like, Comment and Post in Social](/help/social).
:::

A ride is named only if it was public or you were on it. Your location is never in anyone's feed: an Out Riding post says only the spot words the rider chose, and only to riders who could already see them on Who's Riding.

### Customize Your Feed

Tap **Customize**.

1. Under **Show Posts From**, pick **Friends**, **Friends and Riders I Follow**, or **Friends, Follows and My Groups**.
2. Under **What Shows**, turn off any kind of post you don't want: **Friends Out Riding**, **Finished Rides**, **Badges Earned**, **Trails Shared** or **Group Rides Posted**. From 2.0 there's also **Posts**.
3. Under **Who Sees Your Activity**, pick **Friends Only** (the default), **Friends and Followers** (riders who follow you as a leader) or **Nobody**.
4. Tap **Save**.

Your choices are saved to your account, so they're the same on every phone, tablet and the website. Blocked riders never see your posts, and you never see theirs. See [Add Friends](/help/friends), [Follow Leaders](/help/follow-leaders) and [Report or Block a Rider](/help/report-and-block).

## Your Badges

Your rank and all seven badge patches. Tap **See All** (or the patches) for your progress. See [Earn Badges and Ranks](/help/badges-and-ranks).

## Your Toolkit

Shortcuts to the tools that live on the **You** tab: **Who's Riding**, **Friends & Social** (your friends, their activity and your posts; see [Like, Comment and Post in Social](/help/social)), **Garage**, **Trip Planner**, **Offline Maps**, **Starlink**, **Battery Saver** and **Share Location**.

## Help & Support

Opens Help and Support: these guides, **Contact Us**, and how to report a problem.

## On a Tablet

In landscape, and on a big window, Home has two columns: join, create, find, Map Mode, your toolkit and help on the left; your rides, group, public rides, feed and badges on the right. In portrait it's one column, like a phone. See [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet).

## On the Website

When you're signed in at onmylead.com, the **Rides** page is the same home screen.
