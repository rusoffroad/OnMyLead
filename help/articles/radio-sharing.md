---
title: Share Over a Meshtastic Radio
summary: Pair your own Meshtastic radio and Bluetooth Sharing also goes over it, so spots, alerts and messages reach riders with a radio miles away with no service.
category: ride-mode
order: 26
release: "3.5"
draft: true
updated: 2026-11-19
review: "Draft until Radio Sharing is tested with real radios and the Admin switch radio_sharing is turned on. Before publishing, check the range and how often spots go out on a real ride, and confirm release: matches the version it ships in."
sources:
  - app/src/core/meshtastic.ts
  - app/src/core/radio-share.ts
  - app/src/core/radio-status.ts
  - app/src/lib/radio.ts
  - app/src/app/radio.tsx
  - app/modules/onmylead-mesh-radio/**
  - app/src/app/(tabs)/profile.tsx
related: [bluetooth-sharing, ride-mode, ride-chat, emergency-and-safety, permissions, privacy]
keywords: [meshtastic, lora, radio, mesh, no service, no signal, offline, long range, miles, node, heltec, t1000, rak]
---

Bluetooth Sharing reaches riders a few hundred feet away. If you carry a Meshtastic radio, OnMyLead can send the same spots, status taps, EMERGENCY, quick replies and messages over the radio too, so riders on your ride who also have a radio get them from much farther away with no service at all. Radios pass packets on for each other, so a strung-out group stays in touch.

Radio Sharing goes along with [Bluetooth Sharing](/help/bluetooth-sharing): the same things go out, with the same plan rules, and only while Bluetooth Sharing is on in Ride Mode.

## What You Need

- A Meshtastic radio for the US (915 MHz), set up once in the Meshtastic app with its region set to **United States**. The radio doesn't need its own GPS: your phone gives the location.
- The radio on the same main channel as the rest of your group's radios. Meshtastic's default channel works.
- Bluetooth Sharing on, under **You**.

## Pair Your Radio

1. Turn your radio on and keep it close to your phone or tablet.
2. Open **You** and tap **Radio Sharing**.
3. Tap **Pair a Radio**, then **Pair** next to your radio.
4. Enter the PIN when your phone asks. It shows on the radio's screen, or it's the radio's fixed PIN if it has no screen (Meshtastic's default is 123456 unless you changed it).

The page then shows **Connected**, the radio's battery and how busy the channel is. It works the same on iPhone, iPad, Android phones and Android tablets.

## On a Ride

Open Ride Mode as usual. With Bluetooth Sharing on, your phone connects to your radio and sends over it too. Riders heard over the radio show on your map and in Ride Chat like riders heard over Bluetooth.

- **EMERGENCY always goes first,** over the radio and over Bluetooth.
- **Spots go out less often over the radio** than over Bluetooth, because a radio channel is slow and shared by everyone in range: about every 2 minutes on Meshtastic's default setting, sooner when you've moved, and less often in big groups.
- **Messages work best short.** Each message takes a second or two of the channel.
- **Photos, routes and maps don't go over the radio.** They're far too big.

## Privacy

Everything OnMyLead sends over the radio is encrypted for your ride only, the same as Bluetooth Sharing. Other Meshtastic users' radios can pass it on but can't read it, and their apps don't show it. OnMyLead doesn't change your radio's settings.

Your radio itself may broadcast its own name and, if it has GPS, its own position to anyone on its channel. That's a Meshtastic setting, separate from OnMyLead. Change it in the Meshtastic app if you don't want it.

## If It Doesn't Work

- **Pairing failed:** check the PIN on your radio and try again. If it keeps failing, forget the radio in your phone's Bluetooth settings and pair it again here.
- **Set your radio's region:** a new radio doesn't transmit until its region is set. Set it to United States in the Meshtastic app.
- **Licensed (ham) mode:** OnMyLead won't send over a radio in licensed mode, because ham rules don't allow encrypted messages.
- **Not in range:** your phone connects again by itself when the radio is back in range.
