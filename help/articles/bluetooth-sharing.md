---
title: Share With Nearby Riders With No Service
summary: With no cell service, riders on the same ride pass spots, status taps and messages to each other over Bluetooth, and phones pass them along the group.
category: ride-mode
order: 25
release: "2.1"
updated: 2026-11-05
sources:
  - app/src/core/nearby.ts
  - app/src/lib/nearby.ts
  - app/modules/onmylead-nearby/**
  - app/src/lib/outbox.ts
  - app/src/hooks/use-broadcast.ts
  - app/src/hooks/use-ride-chat.ts
  - app/src/components/broadcast-card.tsx
  - app/src/components/ride-chat.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/(tabs)/profile.tsx
  - supabase/migrations/20261104060000_bluetooth_sharing.sql
  - supabase/migrations/20261104100000_bluetooth_mesh.sql
related: [ride-mode, ride-chat, location-sharing, emergency-and-safety, status-buttons, offline-maps, battery-saver, privacy]
keywords: [bluetooth, no service, no signal, offline, dead zone, mesh, relay, nearby, out of range, no cell, message, talk, seen by, got it]
---

When there's no cell service, OnMyLead phones on the same ride talk to each other over Bluetooth. Riders close to you keep moving on your map, and your status taps, quick replies and typed messages reach them, with no service at all. Each phone passes on what it hears, so the rider at the back can reach the front through the riders in between. It works on iPhone, iPad, Android phones and Android tablets, and they all work with each other.

## What It Does

- **Spots.** If you're sharing your location with the ride, nearby riders on the ride see your dot move. Their details say **Via Bluetooth** when the spot came phone to phone. When one phone gets a newer spot for any rider, from Bluetooth or from the internet, it passes that on too, so everyone in range sees the freshest spot the group has.
- **Status taps and EMERGENCY.** A status you tap goes to nearby riders at once over Bluetooth, with or without service, and still sends over the internet when you have signal. An EMERGENCY alerts nearby riders just like it does with service, and always goes out first.

:::release 2.2
- **The Emergency Siren over Bluetooth.** An EMERGENCY from a nearby rider sounds the siren on your phone with no service, and a notification with the siren if OnMyLead is in the background. See [Hear the Emergency Siren](/help/emergency-siren).
:::
- **Quick replies and messages.** Your quick replies and the messages you type in Ride Mode reach nearby riders too. Their phones read them out loud, and they show in Ride Chat marked **Via Bluetooth**. Every Ride Mode message goes over Bluetooth whole, in any language.
- **Got it, seen it.** The card under your tap says who has it: **Reached (name) over Bluetooth** when their phone got it, and **Seen by (name)** once it showed on their screen. While your tap is **Waiting for Signal**, the card still names the nearby riders who got it over Bluetooth.
- **Passed along.** Each phone passes on what it hears, up to six phones down the line, so a strung-out group can still hear each other when the riders in between are in range.
- **A phone with service helps the rest.** Any phone on the ride that has signal puts what OnMyLead knows about the group, the other riders' spots, status taps and messages, on the air for the riders near it with none.
- **Uploaded when anyone gets signal.** When any phone on the ride gets service, it passes what it heard to OnMyLead, including messages and who has seen what, so riders elsewhere and people at home see the group too.

When it's working, the no-service banner in Ride Mode says **No Service. Sharing With 2 Nearby Phones Over Bluetooth.**

## Range

Bluetooth reaches about 30 to 100 meters (100 to 300 feet) between phones in the open, and less through trees, hills, bodies and steel. It works best when the group is bunched up, at a regroup, or riding close. Riders a half mile apart are usually out of range of each other unless riders in between pass it along.

Riders farther away than that show where they were last seen, as before. See [Use Ride Mode](/help/ride-mode).

## Before You Lose Service

- **Open Ride Mode once with service.** Your phone gets the ride's Bluetooth keys from OnMyLead then and keeps them for that ride. Joining a ride needs service.
- **Allow Bluetooth.** The first time, iPhone and iPad ask to use Bluetooth, and Android asks for **Nearby devices**. Say yes.
- **Keep Bluetooth on.** If Bluetooth is off in the phone's settings, nothing goes out.
- **Download the ride's map.** See [Offline Maps](/help/offline-maps).

## Turn It On or Off

Bluetooth Sharing is on by default. Turn it off or back on in either place:

- **You:** switch **Bluetooth Sharing** off or on.
- **Ride Mode:** when you have no service, the no-service banner has a **Bluetooth On** button. Tap it to turn Bluetooth Sharing off (it then says **Bluetooth Off**), and tap again to turn it back on. It starts again right away.

With it off, your phone doesn't use Bluetooth for OnMyLead at all. Your status taps, messages and location still go over the internet whenever you have service.

## Privacy

- Only riders who joined the ride can read what's sent. Everything is encrypted with a key that only the ride's joined riders get, and the key changes for every ride.
- Phones near you that aren't on your ride see only that an OnMyLead phone is nearby. They can't see your name, your ride or where you are.
- Your spot goes out only while you're sharing with the ride. Stop sharing and it stops.
- Each spot, tap, message and receipt carries a code that only your phone and OnMyLead can make, so nobody can upload a fake spot, put words in your mouth or mark your message seen for you.
- It runs only in Ride Mode, and ends when the ride ends.

## Battery

Bluetooth uses far less battery than GPS, but it adds a little to Ride Mode's battery use. The radio works hardest when you have no service or there are phones in range, which is when it matters. With service and nobody in range it idles, and with [Max Battery Saver](/help/battery-saver) on it slows down too. Phones that come into range are picked up either way.

## On Each Device

- **iPhone and iPad:** keeps working with the screen locked while you share with the ride. A locked iPhone can be a little slower to find other phones.
- **Android phones and tablets:** keeps working with the screen off while Ride Mode shows its sharing notification. An Android phone may not find a locked iPhone on its own; the iPhone finds the Android phone instead, and they then talk both ways.

## Good to Know

- It isn't a satellite messenger. It doesn't reach 911 or anyone outside Bluetooth range. See [Emergency and Safety](/help/emergency-and-safety).
- Photos, polls, announcements and leader-only messages still need service.
- With no service, a message you get over Bluetooth shows in Ride Chat with **Via Bluetooth** until OnMyLead has it; then it looks like any other message.
