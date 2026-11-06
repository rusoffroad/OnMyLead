---
title: Hear the Emergency Siren
summary: When a rider in your group sends EMERGENCY or a Crash Alert goes out, your phone sounds a loud siren until you silence it. Here's how it works and how to turn it off.
category: safety-privacy
order: 51
release: "2.1"
updated: 2026-11-05
sources:
  - app/src/core/siren.ts
  - app/src/lib/siren.ts
  - app/src/components/emergency-siren.tsx
  - app/src/app/notifications.tsx
  - app/src/lib/push.ts
  - supabase/functions/notify-ride-message/index.ts
  - supabase/functions/_shared/fcm.ts
  - supabase/migrations/20261105070000_emergency_siren.sql
related: [emergency-and-safety, tilt-and-crash-alert, notification-settings, bluetooth-sharing, status-buttons]
keywords: [siren, alarm, emergency, sos, crash, accident, loud, sound, alert sound, silent mode, wake up]
---

:::warning
OnMyLead is not an emergency service. The siren only reaches riders on your ride. If anyone is hurt, call 911 or your local emergency number first.
:::

When another rider on your ride sends **EMERGENCY**, your phone sounds a loud siren so you notice it over wind, engines and helmets. It keeps going until you silence it. It's free on every plan and it starts on.

## What Sounds the Siren

- A rider presses and holds **Alert My Group** on the Emergency screen in Ride Mode, or sends EMERGENCY from CarPlay.
- A rider's **Crash Alert** countdown runs out, or they tap **Alert My Group Now** on it. See [Use the Tilt Meter and Crash Alert](/help/tilt-and-crash-alert).

**Need Help** and the other status buttons don't sound the siren; they come with the usual notification sound. Your own EMERGENCY never sounds the siren on your phone.

## With OnMyLead Open

The siren takes over the whole screen, on any screen in the app, and it says who needs help. Your phone buzzes with it, it plays even with the ring/silent switch on silent, and any music you're playing turns down under it.

- Tap **Show Me Where** to silence it and open Ride Mode with their location, so you can tap **Navigate** to them.
- Tap **Silence Siren** to silence it and stay where you are.

If more than one rider needs help, the newest shows first, with how many more riders need help. Silencing it silences all of them.

The siren stops by itself if the rider cancels their EMERGENCY or taps another status, like **I'm OK**. An EMERGENCY you've silenced never sounds again on that phone, and one older than 10 minutes doesn't sound when you open Ride Mode later; it still shows in red there.

## With OnMyLead Closed or in the Background

The EMERGENCY notification plays the siren as its sound, for about 27 seconds. Tap the notification to open Ride Mode at their location; the siren doesn't start again in the app.

- **iPhone and iPad:** the siren follows your ring/silent switch, like any notification. It's a Time Sensitive notification, so it comes through a Focus if you allow Time Sensitive notifications for OnMyLead in **Settings > Notifications > OnMyLead**.
- **Android phones and tablets:** the siren has its own notification channel, **Emergency Siren**, and plays as an alarm, so you hear it with the ringer on silent. Do Not Disturb can still hold it back; to let it through, open **Settings > Apps > OnMyLead > Notifications > Emergency Siren** and allow it to override Do Not Disturb.

## With No Service

With [Bluetooth Sharing](/help/bluetooth-sharing) (on every plan for EMERGENCY), an EMERGENCY from a rider within Bluetooth range sounds the siren in Ride Mode too. If OnMyLead is in the background, you get a notification with the siren that says it was sent over Bluetooth.

## On the Website

Ride Mode on onmylead.com sounds the siren while the page is open. Your browser may only play it after you've tapped or clicked the page once. The website doesn't send notifications.

## Hear It or Turn It Off

1. Go to the **You** tab.
2. Under **Settings**, tap **Notifications**.
3. Tap **Play Siren** to hear it for three seconds.
4. Switch **Emergency Siren** off if you'd rather not hear it. EMERGENCY notifications still come through, with the normal notification sound.

Your choice follows your account to your other devices.
