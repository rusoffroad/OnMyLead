---
title: Emergencies and Staying Safe
summary: What the EMERGENCY button does and doesn't do, how Need Help works, and how to ride safer with OnMyLead. OnMyLead is not an emergency service.
category: safety-privacy
order: 50
release: "1.0"
updated: 2026-11-06
sources:
  - app/src/app/ride/[id]/live.tsx
  - app/src/components/hold-button.tsx
  - app/src/core/hold-to-send.ts
  - app/src/core/breakdown.ts
  - app/src/core/blocks.ts
  - app/src/lib/outbox.ts
  - app/src/app/notifications.tsx
  - app/src/app/support.tsx
  - app/src/core/crash-detect.ts
  - app/src/app/terms.tsx
  - supabase/migrations/20261015000000_notification_settings.sql
  - supabase/migrations/20261019300000_status_broadcast.sql
related: [emergency-siren, tilt-and-crash-alert, status-buttons, ride-mode, location-sharing, family-link, notification-settings, offline-maps]
keywords: [emergency, sos, 911, help, need help, accident, injury, hurt, crash, safety, rescue, tablet]
---

:::warning
OnMyLead is not an emergency service. It does not contact 911, search and rescue, or anyone outside your ride. If anyone is hurt, call 911 or your local emergency number first.
:::

OnMyLead helps your group keep track of each other. Phones lose signal, batteries die, and positions can be late or wrong, so use it alongside your own plan, not instead of one.

:::release 2.0
Every rider agrees to the Rider Safety and Liability Agreement before using the app: you ride at your own risk, never use the phone while moving, and only ride where it's allowed. See [The Rider Safety and Liability Agreement](/help/rider-safety-agreement).
:::

Everything on this page is free on every plan. None of it needs Pro.

## What EMERGENCY Does

The **EMERGENCY** button in Ride Mode alerts everyone on your ride at once.

1. In Ride Mode, tap **EMERGENCY**. It stays on screen even when the bottom panel is folded.
2. Read the **Emergency** screen. If you're sharing your location, it shows your coordinates in large type, so you can read them out on a call.
:::until 1.0.3
3. Press and hold **Alert My Group** until it sends. A quick tap won't send it.
:::

:::release 1.0.3
3. Press and hold **Alert My Group** for 1.5 seconds. A bar fills across the button and it says **Keep Holding**. When the bar is full, your phone buzzes, the screen closes and the alert goes out. If you let go early, it says **Not sent** and nothing goes to the group. With VoiceOver or TalkBack, double tap and hold, or use the **Send** action.
:::
4. If anyone is hurt, tap **Call 911** to open your phone's dialer.

Tap **Cancel** to close the screen without sending anything.

:::release 1.0.3
In [Full Map](/help/ride-mode), **EMERGENCY** stays in the slim bar at the bottom of the screen, so it's still one tap away.
:::

When the alert goes out:

- Every rider on the ride gets a notification, "EMERGENCY: your name needs help now", with "Tap to see where they are."
- It shows in red on their Ride Mode screen. If you're sharing your location, they see you on the map and can tap **Navigate** to get directions to you.
- Help and EMERGENCY notifications are always on for every rider, even in quiet hours, and they come through even from a rider someone has blocked.

:::release 2.1
- Their phones sound a loud **Emergency Siren** until they silence it, unless they turned it off. See [Hear the Emergency Siren](/help/emergency-siren).
:::

You see a card showing whose phones have the alert. If you sent it by mistake, tap **Cancel** on the card and the group is told to ignore it. See [Send a Status or Quick Reply](/help/status-buttons).

:::release 2.0
**Crash Alert** can also send it for you: if your phone detects a hard hit or a rollover in Ride Mode and you don't tap **I'm OK** within 30 seconds, your group gets the EMERGENCY alert with your location. See [Use the Tilt Meter and Crash Alert](/help/tilt-and-crash-alert).
:::

## What EMERGENCY Doesn't Do

- It doesn't call or text 911, emergency services, or anyone else.
- It doesn't reach anyone who isn't on the ride.
:::until 2.1
- It can't send without a connection. With no service, the alert waits on your phone and sends by itself when you get signal. Riders also need service to receive it.
:::

:::release 2.1
- With no service, it reaches only riders on the ride within Bluetooth range (about 30 to 100 meters, passed along by up to six phones), and it waits on your phone and sends by itself when you get signal. If any nearby rider's phone gets signal first, it sends the alert for you. See [Share With Nearby Riders With No Service](/help/bluetooth-sharing).
:::

## Need Help

**Need Help** is for when you need the group but it isn't an emergency. It sends with one tap, shows in red for the group, and notifies everyone on the ride the same way, including during quiet hours.

When things are sorted, tap **Resolved, I'm OK** so the group knows.

## Ride Safer

- **Call 911 first** in an emergency, then alert your group.
- **Share your location for the whole ride**, so Ride Bubble and the group can see you, and so riders can find you if you call for help. See [Share Your Location](/help/location-sharing).
- **Send a family link** to someone at home, and tell them when you expect to be back. See [Share a Family Link](/help/family-link).
- **Download the ride's map** before you lose signal. The map keeps working offline, but positions only update with a connection. See [Offline Maps](/help/offline-maps).
- **Allow notifications** so you hear when someone needs help. See [Notification Settings](/help/notification-settings).
- **Allow location Always**, so your group can see you with your phone locked.

On Android, allow location **While Using the App**: the **Sharing Your Location** notification keeps your group seeing you with the phone locked. **Need Help** and **EMERGENCY** arrive in the **Rider Alerts** notification category, which Android shows at the highest priority.
- **Never type or read the screen while driving or riding.** Pull over first. Ride Mode is built for one-tap use when you're stopped.
- **Carry what you need to get yourself home**, and ride within your skill and your machine's limits.
