---
title: Use OnMyLead on More Than One Device
summary: Sign in with the same account on your iPhone, iPad, Android phone, tablet or the website, and your settings and Map Mode trails follow you.
category: account
order: 25
release: "2.0"
updated: 2026-11-04
sources:
  - app/src/lib/map-waypoints.ts
  - app/src/core/map-waypoints.ts
  - app/src/core/synced-settings.ts
  - app/src/lib/settings-sync.ts
  - app/src/core/trail-backup.ts
  - app/src/lib/trail-backup.ts
  - app/src/lib/offline-maps.ts
  - app/src/app/maps/index.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/lib/voice.ts
  - app/src/lib/tilt.ts
  - app/src/lib/appearance-sync.ts
  - supabase/migrations/20261103300000_account_sync.sql
related: [navigation-mode, offline-maps, privacy, use-onmylead-on-a-tablet, sign-in]
keywords: [sync, cloud, backup, two phones, ipad and iphone, new phone, same account, settings, devices, restore trails]
---

Sign in with the same account on every device you use (iPhone, iPad, Android phone or tablet, and onmylead.com) and OnMyLead keeps them in step. Change a setting on your phone and your tablet has it too. Record a trail on your phone and it's in My Trails on your iPad.

Your rides, chats, friends, groups, Garage, trips, Starlink setup, notification settings and profile were always kept with your account. Now your app settings and your own trails are too.

:::release 2.0
Syncing your settings and trails is a Pro feature. See [Free and Pro](/help/free-vs-pro). On a Free account, the **Sync** row on the You tab carries a **Pro** tag. Your account, rides, chats, friends and groups are on every device for free.
:::

## What Follows Your Account

**Settings**

- The map style (Satellite or Topo) and the trail layer switch
- **Rider Trails on Maps** and **Follow Me on Maps**
- The **Track Line** switch (the line itself stays on each device, see below)
- **Directions**: which maps app Navigate opens. If you picked Apple Maps, an Android phone asks each time, since it doesn't have Apple Maps.
- **Music Controls**
- **Appearance**: Dark, Light or Match Phone, your theme and Color Blind Mode
- **Language**: the language you picked, or Match Phone (then each device follows its own language)
- **Tilt**: your warning angles, Warn Me, the spoken warnings, the Tilt Meter switch, and Crash Alert (the Zero stays on each device)
- **Voice**: the voice that speaks your alerts. A device that doesn't have that voice uses its best one.
- Your saved quick replies for ride chat
- Which panels you keep open or folded in Ride Mode, Map Mode, Route Builder and Waypoints
- The search distance in Find a Ride and Events
- Announcements you closed, and the Starlink page connecting by itself

**Map Mode trails**

Every trail in **My Trails** (ones you recorded, drew or saved from other riders), with its details, named spots and photos, is backed up privately to your account. Sign in on another device and they're there. Delete a trail on one device and it's deleted on the others too.

The backup is private: only you can see it. Sharing still works exactly as before. A trail only becomes public when you tap **Share with Everyone**.

:::release 2.1
**Map Mode waypoints**

Waypoints you drop in Map Mode on your own (press and hold the map) are backed up privately the same way, so they show on your other devices, and a waypoint you remove on one is removed on the others. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops#press-and-hold-the-map).
:::

**Offline map areas**

The areas you download aren't copied between devices (they're big), but your other devices know about them. Open **Offline Maps** on another phone or tablet and they're listed under **On Your Other Devices**. Tap **Download** to save the same area on this one, or **Hide** to stop seeing it. Downloading is part of Pro, the same as any download.

## What Stays on Each Device

Some things are about one device, so they stay on it:

- **Battery Saver**: it's about this device's battery, and an iPad on the charger may not need it.
- **Track Line**: the line of where you've been is location history, so it never leaves the device.
- The tilt meter's **Zero**: each phone sits differently in its mount.
- A recording in progress (it backs up as soon as you save the trail).
- The downloaded map squares themselves.
- The Rider Safety and Liability Agreement: you agree once on each device you install OnMyLead on.

Your live location is never part of sync. It's only sent while you share it with a ride or with riders you pick, as always. See [Privacy and Your Location](/help/privacy).

## Check or Sync Now

1. Tap **You**.
2. Under **Settings**, **Sync Across Devices** says when this device last synced.
3. Tap it to sync right away.

Devices sync when you open the app, when you sign in, a moment after you change a setting or a trail, and when you tap **Sync Across Devices**. With no signal, your changes wait on the device and go up the next time you're connected.

If you change the same setting on two devices before either syncs, the change you made last wins. Other settings aren't affected.

## Signing In With a Different Account

Each account keeps its own settings and trails. If someone else signs in on your device, they get their own settings, and trails backed up to your account don't show in their My Trails. Trails made on the device before sync existed go to the first account that syncs them.

## Deleting Your Account

Deleting your account deletes the settings and trail backup kept with it. Trails you shared publicly follow the steps in [Delete Your Account](/help/delete-account).
