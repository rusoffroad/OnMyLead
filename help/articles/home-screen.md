---
title: Your Home Screen
summary: What's on your home screen. Map Mode, joining and starting rides, events, who's out riding, your rides, your group and your feed, and how to customize it.
category: getting-started
order: 15
release: "2.0"
updated: 2026-11-10
sources:
  - app/src/components/found-us-card.tsx
  - app/src/lib/found-us.ts
  - app/src/app/leaderboard.tsx
  - app/src/components/home/events-card.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/home/**
  - app/src/components/inbox-bell.tsx
  - app/src/components/language-button.tsx
  - app/src/components/badge-strip.tsx
  - app/src/components/bottom-sheet.tsx
  - app/src/core/home.ts
  - app/src/core/feed.ts
  - app/src/lib/feed.ts
  - app/src/core/track-line.ts
  - app/src/components/launch-cover.tsx
  - app/src/core/home-layout.ts
  - app/src/components/tab-bar.tsx
  - supabase/migrations/20261102300000_home_feed.sql
related: [join-a-ride, create-a-ride, find-a-ride, navigation-mode, riding-groups, friends, follow-leaders, badges-and-ranks, use-onmylead-on-a-tablet]
keywords: [home, customize home, reorder home, hide sections, out riding now, up next, ride solo, home screen, rides tab, main screen, feed, activity, customize feed, who sees my activity, toolkit, public rides near me, distance, radius, 500 miles, rides left, unlimited, your group]
---

:::release 3.0
**Home** is the first tab. It opens on a satellite map of your area with your greeting. Under it are the four things riders do most: **Map Mode**, **Join a Ride**, **Start a Ride** and **Events**. Below those are the sections you pick, like who's out riding and what's up next.

## At the Top

- **Good Morning**, **Good Afternoon** or **Good Evening** with your ride name, over a satellite map of your area. If you haven't allowed location, the map shows a riding area instead. The home screen never asks for your location.
- **The bell** opens your notifications, with a red number for new ones. See [See and Clear Your Notifications](/help/notifications-inbox).
- **Your picture** (or your first letter) opens **You**: your profile, settings, Garage, Offline Maps and the rest.
- When you're signed out, a flag lets you pick the app's language. Signed in, it's in **You**. See [Change the App's Language](/help/language).

## Map Mode

The first card, over the bottom of the map. It says **Ride Solo**, because Map Mode is your own offroad map: nobody else sees where you are. When location is allowed it shows how many rider trails are near you.

Tap **Open Map Mode**, or the blue round **Map Mode** key in the middle of the tab bar. Recording, Track Line, drawing a custom trail and offline maps are all inside Map Mode. Pro riders can turn a solo ride into a group ride from there with **Make It a Group Ride**. See [Navigate Offroad and Map Your Own Trails](/help/navigation-mode).

## Join a Ride

The big red card. Type the invite code from the ride leader and tap **Join**. You can also open a ride's link, or scan its QR code with your phone's camera (the QR button on the card explains how). Joining is **Unlimited** on every plan. See [Join a Ride](/help/join-a-ride).

## Start a Ride and Events

Two tiles side by side:

- **Start a Ride** creates a new ride. On Free it says how many you have left this month (**1 Left This Month**, or **None Left This Month**, which opens Pro). On Pro and during the trial it says **Lead your group**. See [Create a Ride](/help/create-a-ride) and [Free and Pro](/help/free-vs-pro).
- **Events** opens rallies, poker runs and ride weekends. See [Events](/help/events).

When one of your rides is live, a card under them says **Your ride is live. Tap to open Ride Mode**.

## Your Sections

These show by default, in this order:

- **Out Riding Now**: friends who are out riding right now, with the spot they named (never where they are). Tap one, or **See All**, for [Who's Riding](/help/out-riding). When nobody is out, the card asks if you're heading out.
- **Up Next**: ride invites from your riding groups, your next ride (tap **All** to see every ride you're on), and your next event, or the next public event near you.
- **Your Group**: your riding group with the newest chat message, with **Group Chat** and **Plan a Group Ride**. With more than one group, **All** opens your groups.
- **Feed**: what your friends, riders you follow and your riding groups have been up to. Friends out riding show in Out Riding Now instead, so they aren't listed twice. **Customize** changes what the feed shows; **Open Social** opens Social.

You can also turn on **Public Rides Near You**, **Your Badges**, **Your Toolkit** and **Past Rides**.

Swipe a ride left to delete it (if you organize it) or leave it. On onmylead.com, click **Delete** or **Leave** at the end of the row. The app always asks first.

## Customize Home

1. Scroll to the bottom of Home and tap **Customize Home**.
2. Turn each section on or off with its switch.
3. Use the up and down arrows to move a section higher or lower.
4. Tap **Done**.

Map Mode, Join a Ride, Start a Ride and Events always show first. **Reset to Default** puts everything back. Your layout is saved to your account, so it's the same on your phone, tablet and the website.

## Public Rides Near You

Upcoming public rides, nearest first, as cards you swipe sideways. Tap the distance chip (**Within 500 mi** at first) to pick **50 mi**, **100 mi**, **250 mi**, **500 mi**, **1,000 mi** or **Anywhere**. Signed out, this is the section Home shows.

## The Tab Bar

**Home**, **Rides** (public rides on the map), the blue **Map Mode** key, **Events** and **Social**. Your riding groups are in **Social** (tap **Riding Groups**) and on Home under **Your Group**.

## Your App Version

The very bottom of Home shows which version of OnMyLead you have, like **Version 3.0 (11)**. Tell us this number when you [contact support](/help/contact-support).

## On a Tablet

In landscape, and on a big window, Map Mode, Join a Ride, Start a Ride, Events and Customize Home are on the left and your sections are on the right, with the tabs in a rail down the left edge (**You** is at the bottom of the rail). In portrait it's one column, like a phone. See [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet).

## On the Website

When you're signed in at onmylead.com, **Home** is the same home screen.
:::

:::until 3.0
:::until 3.0
The **Rides** tab is your home screen. It puts the three things riders do most at the top (join, create and find a ride), then Map Mode, events, your rides, your crew and what your friends have been up to.
:::
:::release 3.0
The **Home** tab is your home screen. It puts the three things riders do most at the top (join, create and find a ride), then Map Mode, events, your rides, your crew and what your friends have been up to.
:::

:::release 2.1
Join a Ride, Create a Ride, Find a Ride, Events and Map Mode all fit on the first screen, without scrolling, in that order. Scroll down for your rides, your crew and what your friends have been up to. On small phones like the iPhone SE, the greeting line is left out to make room.
:::

## At the Top

- **Good morning**, **Good afternoon** or **Good evening** with your ride name. When friends are out riding, a line under it says how many. Tap it for [Who's Riding](/help/out-riding).
- **The flag** shows the language the app is in (for example 🇺🇸 EN). Tap it to pick another. It shows when you're signed out too. See [Change the App's Language](/help/language).
- **The bell** opens your notifications, with a red number for new ones. See [See and Clear Your Notifications](/help/notifications-inbox).
:::until 3.0
- **Your picture** (or your first letter) opens the **You** tab.
:::
:::release 3.0
- **Your picture** (or your first letter) opens **You** (your picture at the top of Home).
:::

:::release 3.0
In your first month, Home asks once: **How Did You Find OnMyLead?** Tap where you heard about us (Facebook, a friend, a riding club and so on) and tap **Send**, or tap **Not Now** and it won't ask again. Your answer is only counted, never shown to other riders.
:::

## Join, Create and Find

- **Join a Ride**, the big red card: type the invite code from the ride leader and tap **Join**. You can also open a ride's link or scan its QR code with your phone's camera. Joining is **Unlimited** on every plan. See [Join a Ride](/help/join-a-ride).
- **Create a Ride**, the dark card with the red flag under Join: the label says how many rides you have left this month on Free (**1 Left This Month**, or **None Left This Month**), or **Unlimited** on Pro and during the trial. Tap the label on Free to see what Pro adds. See [Create a Ride](/help/create-a-ride) and [Free and Pro](/help/free-vs-pro).
- **Find a Ride**: opens the map of public rides. The label shows how many are coming up near you, like **12 Within 500 mi**. See [Find a Ride](/help/find-a-ride).

When one of your rides is live, a card says **Your ride is live. Tap to open Ride Mode**.

## Events

:::until 2.1
Under Join, Create, Find and Map Mode, the gold **Events** card opens the Events area: rallies, poker runs and ride weekends. It shows your next event (one you host or said you're going to), or else the next public event near you, and how many are coming up.
:::

:::release 2.1
Right under **Create a Ride** and **Find a Ride**, the gold **Events** card opens the Events area: rallies, poker runs and ride weekends. It shows your next event (one you host or said you're going to), or else the next public event near you, and how many are coming up.
:::

See [Events](/help/events).

## Map Mode

:::until 2.1
Your offroad map for when you're not on a group ride. It's the blue card right under **Create a Ride** and **Find a Ride**, and shows how many rider trails are near you when location is allowed.
:::

:::release 2.1
Your offroad map for when you're not on a group ride. It's the blue card under **Events**.
:::

- **Open Map Mode** opens Map Mode. The blue **Map Mode** button in the tab bar opens it too, from any tab.
- **Map a Custom Trail** opens Map Mode ready to draw a trail that isn't marked on any map.
- **Track Line** draws where you've been, a new colour each day: today red, yesterday blue, older days gold.

:::release 2.1
The **Track Line** switch is the small switch in the top corner of the Map Mode card. Tap it to turn the line on or off.
:::

See [Navigate Offroad and Map Your Own Trails](/help/navigation-mode).

## Your Rides

- **Ride Invites**: rides your riding groups invited you to.
- **Your Next Ride**: the soonest ride you're on. If you're on more than one, tap **All** to see them all.
- **Past Rides**: rides that ended. Free shows your last few; see [Free and Pro](/help/free-vs-pro).

Swipe a ride left to delete it (if you organize it) or leave it. On onmylead.com, click **Delete** or **Leave** at the end of the row. The app always asks first.

## Your Group

Your riding group with the newest group chat message (or your first group), with how many riders are in it, how many of them are out riding now, and the newest message.

- **Group Chat** opens the group's chat.
- **Plan a Group Ride** starts a new ride with that group already picked to invite. Creating rides follows your plan's ride limit.
:::until 3.0
- Tap the group's name for its page. With more than one group, **All** opens the **Groups** tab.
:::
:::release 3.0
- Tap the group's name for its page. With more than one group, **All** opens **Riding Groups** (in **Social**).
:::

:::release 2.1
The card shows the group's photo next to its name, if the rider who made the group added one, or the group's initials. See [Add a Group Photo](/help/riding-groups#add-a-group-photo).
:::

:::until 3.0
No group yet? **Ride With the Same Crew?** takes you to the **Groups** tab. See [Riding Groups](/help/riding-groups).
:::
:::release 3.0
No group yet? **Ride With the Same Crew?** takes you to **Riding Groups** (in **Social**). See [Riding Groups](/help/riding-groups).
:::

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

:::release 2.1
A friend's post with a photo shows a small copy of the photo on the right; tap it, or the post, to open it in Social with the photo full width and every comment.
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

:::release 2.1
Tap **Leaderboard** beside **Your Badges** to see where you rank against other riders, everywhere or in your country and state. See [See the Badge Leaderboard](/help/badge-leaderboard).
:::

## Your Toolkit

:::until 3.0
Shortcuts to the tools that live on the **You** tab: **Who's Riding**, **Friends & Social** (your friends, their activity and your posts; see [Like, Comment and Post in Social](/help/social)), **Garage**, **Trip Planner**, **Offline Maps**, **Starlink**, **Battery Saver** and **Share Location**.
:::
:::release 3.0
Shortcuts to the tools that live on **You** (your picture at the top of Home): **Who's Riding**, **Friends & Social** (your friends, their activity and your posts; see [Like, Comment and Post in Social](/help/social)), **Garage**, **Trip Planner**, **Offline Maps**, **Starlink**, **Battery Saver** and **Share Location**.
:::

## Help & Support

Opens Help and Support. At the top, **Help Center: How-To Guides** opens these step-by-step guides; below it are **Contact Us** and quick answers to common questions, each with a **Read the Guide** link.

:::release 2.1
## Your App Version

The very bottom of Home shows which version of OnMyLead you have, like **Version 2.1 (10)**: the version number, then the build number in brackets. The same line shows at the bottom of the logo screen for a moment when the app opens. It's on iPhone, iPad, Android phones and Android tablets; the website is always the newest version, so it doesn't show one. Tell us this number when you [contact support](/help/contact-support).
:::

## On a Tablet

In landscape, and on a big window, Home has two columns: join, create, find, events, Map Mode, your toolkit and help on the left; your rides, group, public rides, feed and badges on the right. In portrait it's one column, like a phone. See [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet).

## On the Website

When you're signed in at onmylead.com, the **Rides** page is the same home screen.
:::
