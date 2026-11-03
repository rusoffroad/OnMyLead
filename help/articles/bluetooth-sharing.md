---
title: Share With Nearby Riders With No Service
summary: With no cell service, Ride Mode passes spots, status taps and quick replies between riders on the same ride who are close by, over Bluetooth.
category: ride-mode
order: 25
release: "2.1"
updated: 2026-11-03
sources:
  - app/src/core/nearby.ts
  - app/src/lib/nearby.ts
  - app/modules/onmylead-nearby/**
  - app/src/lib/outbox.ts
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/(tabs)/profile.tsx
  - supabase/migrations/20261103600000_bluetooth_sharing.sql
related: [ride-mode, location-sharing, emergency-and-safety, status-buttons, offline-maps, privacy]
keywords: [bluetooth, no service, no signal, offline, dead zone, mesh, relay, nearby, out of range, no cell]
---

When there's no cell service, OnMyLead phones on the same ride talk to each other over Bluetooth. Riders close to you keep moving on your map, and your status taps and quick replies reach them, with no service at all. It works on iPhone, iPad, Android phones and Android tablets, and they all work with each other.

## What It Does

- **Spots.** If you're sharing your location with the ride, nearby riders on the ride see your dot move. Their details say **Via Bluetooth** when the spot came phone to phone.
- **Status taps and EMERGENCY.** A status you tap with no service goes to nearby riders right away, and still sends over the internet when you get signal. An EMERGENCY alerts nearby riders just like it does with service.
- **Quick replies.** Nearby riders' phones read your quick reply out loud.
- **Passed along.** Each phone passes on what it hears, up to three phones down the line, so a strung-out group can still hear each other when the riders in between are in range.
- **Uploaded when anyone gets signal.** When any phone on the ride gets service, it passes what it heard to OnMyLead, so riders elsewhere and people at home see the group too.

When it's working, the no-service banner in Ride Mode says **No Service. Sharing With 2 Nearby Phones Over Bluetooth.**

## Range

Bluetooth reaches about 30 to 100 meters (100 to 300 feet) between phones in the open, and less through trees, hills, bodies and steel. It works best when the group is bunched up, at a regroup, or riding close. Riders a half mile apart are usually out of range of each other unless riders in between pass it along.

Riders farther away than that show where they were last seen, as before. See [Use Ride Mode](/help/ride-mode).

## Before You Lose Service

- **Open Ride Mode once with service.** Your phone gets the ride's Bluetooth keys from OnMyLead then and keeps them for that ride. Joining a ride needs service.
- **Allow Bluetooth.** The first time, iPhone and iPad ask to use Bluetooth, and Android asks for **Nearby devices**. Say yes.
- **Keep Bluetooth on.** If Bluetooth is off in the phone's settings, nothing goes out.
- **Download the ride's map.** See [Offline Maps](/help/offline-maps).

## Turn It Off

Bluetooth Sharing is on by default. To turn it off, open **You** and switch off **Bluetooth Sharing**. Your status taps and location still go over the internet whenever you have service.

## Privacy

- Only riders who joined the ride can read what's sent. Everything is encrypted with a key that only the ride's joined riders get, and the key changes for every ride.
- Phones near you that aren't on your ride see only that an OnMyLead phone is nearby. They can't see your name, your ride or where you are.
- Your spot goes out only while you're sharing with the ride. Stop sharing and it stops.
- Each spot and tap carries a code that only your phone and OnMyLead can make, so nobody can upload a fake spot for you.
- It runs only in Ride Mode, and ends when the ride ends.

## On Each Device

- **iPhone and iPad:** keeps working with the screen locked while you share with the ride. A locked iPhone can be a little slower to find other phones.
- **Android phones and tablets:** keeps working with the screen off while Ride Mode shows its sharing notification. An Android phone may not find a locked iPhone on its own; the iPhone finds the Android phone instead, and they then talk both ways.

## Good to Know

- It isn't a satellite messenger. It doesn't reach 911 or anyone outside Bluetooth range. See [Emergency and Safety](/help/emergency-and-safety).
- Ride chat, photos and polls still need service.
- Bluetooth uses far less battery than GPS, but it adds a little to Ride Mode's battery use.
