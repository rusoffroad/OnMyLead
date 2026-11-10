---
title: Free and Pro
summary: What every OnMyLead account gets for free, what OnMyLead Pro adds, and how the Free monthly ride works.
category: pro
order: 10
release: "1.0"
updated: 2026-11-10
sources:
  - supabase/migrations/20261105090000_pro_bluetooth_dot_photos.sql
  - app/src/core/carplay.ts
  - app/src/hooks/use-dot-size.ts
  - app/src/core/pro.ts
  - app/src/core/entitlements.ts
  - app/src/lib/entitlements.ts
  - app/src/lib/pro.ts
  - app/src/app/pro.tsx
  - app/src/app/subscription.tsx
  - app/src/components/pro-gate.tsx
  - app/src/components/pro-tag.tsx
  - app/src/components/pro-plan.tsx
  - app/src/app/ride/new.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/core/map-mode-time.ts
  - app/src/lib/map-mode-time.ts
  - app/src/core/tablet-gate.ts
  - app/src/components/tablet-pro-gate.tsx
  - supabase/migrations/20261104000000_pro_tiers.sql
  - supabase/migrations/20261018000000_pro_entitlements.sql
  - supabase/migrations/20261027000000_play_billing.sql
related: [navigation-mode, pro-trial, subscribe-to-pro, manage-subscription, emergency-and-safety]
keywords: [free, pro, map mode hours, map time, pro tag, premium, upgrade, price, cost, limits, ride limit, one ride a month, what's included, features, tablet]
---

OnMyLead is free to download and use. Free accounts can join as many rides as they like, and every safety feature is free on every plan. OnMyLead Pro is for riders who lead a lot of rides and want extras like offline maps and GPX import.

Pro is $4.99 a month or $29.99 a year in the US. Other countries see the price in local currency. Every new account starts with a [free 30-day Pro Trial](/help/pro-trial).

## What's Included

This is the same comparison as the **Free and Pro** table on the Pro screen.

:::until 2.0
| | Free | Pro |
|---|---|---|
| Create Rides | 1 a Month | Unlimited |
| Join Rides | Unlimited | Unlimited |
| Live Tracking, SOS and Ride Bubble | Yes | Yes |
| Ride Chat and Voting | Yes | Yes |
| Draw Routes and Follow Leaders | Yes | Yes |
| Navigate (Map Mode From 2.0): Offroad Map, Draw and Measure, Rate Trails | Yes | Yes |
| Record and Share Your Trails | No | Yes |
| Group Rides on Your Trails | No | Yes |
| Import GPX Routes | No | Yes |
| Offline Maps | No | Yes |
| Saved Riding Groups | No | Yes |
| Create Ride Polls | No | Yes |
| Ride History | Last 5 | All |
| Advanced Trip Planning | No | Yes |
| Advanced Ride Statistics | No | Yes |
| Premium Ride Cards | No | Yes |
:::

:::until 2.1
| | Free | Pro |
|---|---|---|
| Create Rides | 1 a Month | Unlimited |
| Join Rides and Follow the Leader | Unlimited | Unlimited |
| Live Tracking, SOS, Crash Alert and Ride Bubble | Yes | Yes |
| Ride Chat | Yes | Yes |
| Map Mode | 8 Hours a Month | Unlimited |
| Social Feed: See, Like and Read Comments | Yes | Yes |
| Badges, Events and Friends | Yes | Yes |
| Draw Routes, Waypoints and Directions | No | Yes |
| Map Layers: Satellite, Topo and Trails | No | Yes |
| Draw, Record, Save, Rate and Share Trails | No | Yes |
| Track Line and Named Spots | No | Yes |
| Group Rides on Your Trails | No | Yes |
| Import GPX Routes | No | Yes |
| Offline Maps | No | Yes |
| Post, Comment and Share to Social Media | No | Yes |
| Create Events | No | Yes |
| Saved Riding Groups and Custom Codes | No | Yes |
| Create and Vote on Ride Polls | No | Yes |
| Your Own Messages and Music Controls | No | Yes |
| Ride History | Last 5 | All |
| Advanced Ride Statistics and Premium Cards | No | Yes |
| Advanced Trip Planning | No | Yes |
| Garage Build Sheet | No | Yes |
| Themes, Light Mode and Natural Voices | No | Yes |
| Sync Across Devices | No | Yes |
| iPad, Android Tablets and the Website | No | Yes |
:::

:::release 2.1
| | Free | Pro |
|---|---|---|
| Create Rides | 1 a Month | Unlimited |
| Join Rides and Follow the Leader | Unlimited | Unlimited |
| Live Tracking, SOS, Crash Alert and Ride Bubble | Yes | Yes |
| Ride Chat | Yes | Yes |
| Map Mode | 8 Hours a Month | Unlimited |
| Social Feed: See, Like and Read Comments | Yes | Yes |
| Badges, Events and Friends | Yes | Yes |
| Draw Routes, Waypoints and Directions | No | Yes |
| Bluetooth Sharing With No Service | No | Yes |
| CarPlay | No | Yes |
| Map Layers: Satellite, Topo and Trails | No | Yes |
| Draw, Record, Save, Rate and Share Trails | No | Yes |
| Track Line and Named Spots | No | Yes |
| Group Rides on Your Trails | No | Yes |
| Import GPX Routes | No | Yes |
| Offline Maps | No | Yes |
| Post, Comment and Share to Social Media | No | Yes |
| Create Events | No | Yes |
| Saved Riding Groups, Group Photos and Custom Codes | No | Yes |
| Create and Vote on Ride Polls | No | Yes |
| Your Own Messages and Music Controls | No | Yes |
| Ride History | Last 5 | All |
| Advanced Ride Statistics and Premium Cards | No | Yes |
| Advanced Trip Planning | No | Yes |
| Garage Build Sheet | No | Yes |
| Themes, Light Mode, Natural Voices and Custom Dots | No | Yes |
| Sync Across Devices | No | Yes |
| iPad, Android Tablets and the Website | No | Yes |
:::

## Always Free

:::until 2.0
Safety never depends on your plan. On every plan you get Ride Mode, live tracking, Need Help, EMERGENCY, Mechanical Issue alerts, Ride Bubble, location sharing, family links, ride chat and joining rides.
:::

:::release 2.0
Joining a ride and following the leader are free and unlimited, on every device. Safety never depends on your plan. On every plan you get Ride Mode, live tracking, Need Help, EMERGENCY, Mechanical Issue alerts, Crash Alert, Ride Bubble, location sharing, family links, ride chat, the status buttons and the leader's route and waypoints on the ride map. Directions to a rider who needs help are free too.
:::

## The Free Monthly Ride

Free accounts create one ride each calendar month.

- The month follows UTC time, so a new month can start a few hours earlier or later than midnight where you live.
- A ride counts when you create it. Deleting or cancelling it doesn't give the ride back.
- Using **Ride Again** to copy a ride counts as creating a ride.
- Rides you create on the website count too.
- Joining other riders' rides is always unlimited.

When you create a ride on a Free account, the Create a Ride screen shows how many you've created this month, like **Rides Created This Month: 0 of 1**. If you've used it, the app tells you the date your next free ride opens, and you can tap **See OnMyLead Pro** or **Not Now**.

:::release 2.0
## Free Map Mode Time

Free accounts get 8 hours of Map Mode every calendar month (UTC time). Pro has no limit.

- The clock only runs while Map Mode is open on your screen. It stops when you leave Map Mode or put the app in the background.
- It never runs while you're sharing your location on a group ride, so riding with a group and following the leader stay unlimited.
- Your time is counted on your OnMyLead account, so it's the same on every device and doesn't reset if you reinstall the app.
- Map Mode shows the time you have left, like **Free Map Mode: 5 h 20 m Left This Month**.
- When the time is used up, Map Mode tells you and offers **See OnMyLead Pro**. It opens again at the start of the next month.
:::

## What Each Pro Feature Does

:::until 2.0
- **Create More Rides:** Pro creates as many rides as you lead.
- **Import GPX Routes:** bring in a track from Gaia, onX or any GPX file. See [Import a GPX Route](/help/import-gpx). Drawing a route on the map stays free, and a route you already imported stays editable.
- **Offline Maps:** download satellite, topo and trail maps so the map keeps working with no signal. See [Offline Maps](/help/offline-maps). Maps already on your phone keep working on Free.
- **Saved Riding Groups:** save your crew, add riders and invite everyone in one tap. See [Riding Groups](/help/riding-groups). Joining a group, its chat and its ride invites stay free.
- **Record and Share Your Trails:** record a trail in Navigate, and share your trails on the public map. The offroad map, following a trail, measuring and rating other riders' trails stay free, and a trail you already shared stays editable. See [Navigate Offroad and Map Your Own Trails](/help/navigation-mode).
- **Group Rides on Your Trails:** turn one of your trails into a group ride's route. Drawing a route on the map stays free.
- **Create Ride Polls:** ask the group a quick question in ride chat. Everyone can still vote on polls for free. See [Ride Polls](/help/ride-polls).
- **Full Ride History:** Free shows your last 5 past rides. Pro shows every ride you've been on. Nothing is ever deleted, so older rides come back if you upgrade.
- **Advanced Trip Planning:** plan several trips at once, start from packing lists, copy trips and link them to rides. One active trip and the fuel check stay free. See [Trip Planner](/help/trip-planner).
- **Advanced Ride Statistics:** moving time, average and top speed, climbing and the group's totals after every ride. Distance and time out stay free.
- **Premium Ride Cards:** share your ride with the Full Stats and Big Number layouts. The standard card stays free.
:::

:::release 2.0
- **Create More Rides:** Pro creates as many rides as you lead.
- **Draw Ride Routes:** draw the route for your ride on the map, snapped to trails and roads. Freeride rides and following the leader's route stay free. See [Draw a Route](/help/route-builder).
- **Waypoints and Planned Stops:** drop waypoints and plan stops with symbols for fuel, camp, hazards and more. Seeing the leader's waypoints on a ride stays free. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
- **Directions:** hand any spot to Apple Maps or Google Maps for turn-by-turn directions. Directions to a rider who needs help stay free. See [Get Directions in Apple Maps or Google Maps](/help/directions).
- **Map Layers:** switch between satellite, topo and the trails layer with trail names and closures. The standard map stays free. See [Map Layers and Trails](/help/map-layers).
- **Unlimited Map Mode:** Free includes 8 hours of Map Mode a month. Pro has no limit.
- **Map a Custom Trail:** draw a trail on the map and measure distances along it. Following trails stays free.
- **Record, Save, Rate and Share Trails:** record your line, keep your trails in My Trails, rate trails and share yours on the public map. Seeing and following other riders' trails stays free. See [Navigate Offroad and Map Your Own Trails](/help/navigation-mode).
- **Track Line:** see where you've been on the map for the last 7 days. Your dot on the map stays free.
- **Named Spots:** mark obstacles, hazards, water crossings and viewpoints on your trails. Seeing spots on shared trails stays free.
- **Group Rides on Your Trails:** turn one of your trails into a group ride's route.
- **Import GPX Routes:** bring in a track from Gaia, onX or any GPX file. See [Import a GPX Route](/help/import-gpx).
- **Offline Maps:** download satellite, topo and trail maps so the map keeps working with no signal. See [Offline Maps](/help/offline-maps). Maps already on your phone keep working on Free.
- **Post, Comment and Share:** post ride reports with a photo on your profile, comment on your friends' rides, badges, trails and posts, and share to Facebook, Instagram or X. Seeing Social, reading comments and liking (posts and comments) stay free; replying to a comment is commenting, so it's Pro. Pro riders show a gold **PRO** tag next to their name. See [Like, Comment and Post in Social](/help/social).
- **Create Events:** post a rally, poker run or ride weekend with photos, an agenda and its group rides. Seeing events, saying you're going and being a co-host or Ride Manager stay free. See [Events](/help/events).
- **Saved Riding Groups:** save your crew, add riders and invite everyone in one tap. Joining a group, its chat and its ride invites stay free. See [Riding Groups](/help/riding-groups).
- **Custom Share Codes:** pick your own easy code for a ride, group or friend link. Every ride and group still gets a free code that works. See [Choose Your Own Code](/help/custom-codes).
- **Ride Polls:** create polls and vote on them in ride chat. Reading a poll and its results stays free. See [Ride Polls](/help/ride-polls).
- **Your Own Messages:** type your own one-line message to the group in Ride Mode and save your quick replies. The status buttons, Need Help and EMERGENCY stay free. See [Send a Status or Quick Reply](/help/status-buttons).
- **Music Controls:** play, pause, skip and change the volume from Ride Mode and Map Mode. See [Control Your Music While You Ride](/help/music-controls).
- **Full Ride History:** Free shows your last 5 past rides. Pro shows every ride you've been on. Nothing is ever deleted, so older rides come back if you upgrade.
- **Advanced Ride Statistics:** moving time, average and top speed, climbing and the group's totals after every ride. Distance and time out stay free.
- **Premium Ride Cards:** share your ride with the Full Stats and Big Number layouts. The standard card stays free.
- **Advanced Trip Planning:** plan several trips at once, start from packing lists, copy trips and link them to rides. One active trip and the fuel check stay free. See [Trip Planner](/help/trip-planner).
- **Garage Build Sheet:** track parts and extras with costs, build totals, the Build Sheet and CSV export. Your machines, specs and fuel range stay free. See [Your Garage](/help/garage).
- **Themes and Light Mode:** pick Light, Match Phone or one of the themes. Dark mode and Color Blind Mode stay free. See [Change the Look](/help/appearance).
- **Natural Voices:** pick a voice for spoken alerts. Alerts are still read out loud with the Automatic voice on Free. See [Choose the Voice for Spoken Alerts](/help/voice).
- **Sync Across Devices:** your settings and Map Mode trails follow you to every device. Your account and rides are on every device for free. See [Use OnMyLead on More Than One Device](/help/sync-across-devices).
- **iPad, Android Tablets and the Website:** use OnMyLead on a big screen. On a Free account, a tablet or the website still lets you join a ride, open your rides, follow the leader in Ride Mode and manage your account. See [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet).

If you were already using a theme or a voice before 2.0, the app keeps it.
:::

:::release 2.1
New in Pro with 2.1:

- **Bluetooth Sharing With No Service:** with no cell service, see nearby riders on your map and pass your spot, status taps and messages to them over Bluetooth, and phones pass them along the group. On every plan, your phone passes everything along for the group, and status taps go out and come in over Bluetooth, so EMERGENCY, Need Help and Crash Alerts always get through, and so does the I'm OK that ends one. On Free, the switch shows the Pro tag. See [Share With Nearby Riders With No Service](/help/bluetooth-sharing).
- **CarPlay:** see your group and send status taps from your car's screen. On Free, the car screen says **CarPlay Is Part of OnMyLead Pro**, and Ride Mode, status taps and EMERGENCY keep working on your phone. See [Use OnMyLead in CarPlay](/help/carplay).
:::release 2.1.1
On CarPlay, Map Mode shows your speed, elevation, heading, trip and the trail you're following when no group ride is running (Pro).
:::
- **Customize Your Dot:** pick your Dot Style and Dot Size. On Free your dot is the Red, White and Blue dot at Medium. If you picked another one during a trial, it comes back when you have Pro again.
- **Group Photos:** give a riding group you made a photo. Everyone can still see group photos for free. See [Riding Groups](/help/riding-groups).

When 2.1 arrives, every rider without Pro gets a fresh 30-day Pro trial first, so nothing changes for you right away. Home shows the date your trial ends. See [Your Free 30-Day Pro Trial](/help/pro-trial).
:::

When you tap something that needs Pro, a short prompt explains it. Tap **See OnMyLead Pro** to see the plans, or **Not Now** to close it.

:::release 2.0
On a Free account, a small gold **Pro** tag sits beside each button that needs Pro, so you know before you tap. You'll see it on buttons like **Import GPX**, **Record a Trail**, **Download** for offline maps, **New Group**, **Create an Event**, **Directions**, **Add Waypoint**, **Message** in Ride Mode, the music button, **Map Style**, **Track Line**, **Mark a Spot**, poll voting, the theme and voice choices, and **Sync**. Tapping one opens the same prompt. During your Pro Trial and on Pro the tags are gone. Create a Ride doesn't carry a tag, because Free includes a ride a month; it shows how many you have left instead.
:::

## See Your Plan

:::release 2.0
Pro Annual is half price for the first year when you invite a new rider who finishes their first ride, or when a friend invites you. See [Invite Friends and Get 50% Off Pro](/help/refer-a-friend).
:::


On the **You** tab, under **Settings**, tap **Subscription**. **Your Plan** shows Free, Pro Trial or Pro. On Free it also shows how many rides you've created this month.

Your plan is saved on your phone, so the app knows it even with no signal.

:::note
Pro is bought in the app on iPhone or iPad through the App Store. Pro you buy there also works when you use OnMyLead on the website.
:::

On Android, Pro is bought through Google Play. Pro belongs to your OnMyLead account, so it works on iPhone, iPad, Android and the website, whichever store you bought it from.
