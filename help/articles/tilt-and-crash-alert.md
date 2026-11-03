---
title: Use the Tilt Meter and Crash Alert
summary: See your vehicle's roll and pitch, get warned before a steep lean, and have OnMyLead alert your group if it detects a crash.
category: safety-privacy
order: 52
release: "2.0"
updated: 2026-11-03
sources:
  - app/src/app/tilt.tsx
  - app/src/components/tilt-gauge.tsx
  - app/src/components/tilt-tile.tsx
  - app/src/components/crash-countdown.tsx
  - app/src/core/tilt.ts
  - app/src/core/crash-detect.ts
  - app/src/hooks/use-tilt.ts
  - app/src/hooks/use-crash-alert.ts
  - app/src/lib/tilt.ts
  - app/src/lib/motion.ts
related: [emergency-and-safety, ride-mode, navigation-mode]
keywords: [tilt, inclinometer, roll, pitch, angle, side hill, off camber, rollover, crash detection, crash alert, accident, level]
---

The tilt meter shows how far your vehicle leans side to side (**Roll**) and tips nose up or down (**Pitch**), using the motion sensors in your phone or tablet. It works with no signal. Crash Alert uses the same sensors to spot a likely crash in Ride Mode and tell your group if you don't answer.

## See Your Tilt

The **Tilt** tile shows your roll and pitch over the map:

- In **Map Mode**, under your speed and the dash.
- In **Ride Mode**, on the left side of the map above the panel. On a tablet it sits in the map's bottom-left corner. It hides in Full Map and when there isn't room.

The numbers turn amber as you get close to your limit and red at it. Tap the tile to open the full **Tilt** screen, with an axle seen from behind that leans with your roll, two wheels seen from the side that tip with your pitch, and the biggest lean each way under each one. Tap **Reset Max** to clear those.

You can also open it from the **You** tab: tap **Tilt and Crash Alert**. The screen stays on while it's open, so you can leave it up on your mount.

## Zero It for Your Mount

Your phone probably doesn't sit flat in its mount, so zero the meter once you've mounted it:

1. Park on flat, level ground.
2. Put the phone in its mount the way you ride.
3. Open **Tilt** and tap **Zero**, then **Zero** again to confirm.

That reading becomes level. Zero again whenever you move the phone or switch vehicles. The Zero is kept on this phone only, since each phone sits differently. Tap **Clear Zero** to remove it.

Until you zero it, the meter treats the phone's nearest plain position (lying flat, standing upright or on its side) as level, so a phone standing in a dash mount reads close to level. That reading is only rough, so the numbers stay blue instead of turning amber or red, tilt warnings don't buzz, and Crash Alert only watches for hard hits, not rollovers. Zero it to turn those on.

## Tilt Warnings

With **Warn Me** on, your phone buzzes when you lean past your limit for more than a moment, and again every few seconds while you stay past it. Set your own limits with **Roll Limit** and **Pitch Limit** (10° to 45°; they start at 25° roll and 30° pitch). Turn on **Say It Out Loud** to also hear the angle, such as "Roll 28 left".

:::warning
Every vehicle tips at a different angle, and load, tires and ground all change it. The limits are reminders, not a promise you won't roll.
:::

On a motorcycle, turn **Warn Me** off, since leaning into turns is normal. To hide the tile, turn off **Show in Map Mode and Ride Mode**. Your limits and these switches follow your account to your other devices.

## Crash Alert

Crash Alert is on unless you turn it off. While Ride Mode is open, it watches for a hard hit or (once you've zeroed the tilt meter) a rollover while you're riding, followed by your vehicle stopping. When it sees one:

1. A full-screen countdown starts at 30 seconds, with vibration and a spoken warning.
2. Tap **I'm OK** to cancel. Nothing is sent.
3. If nobody taps **I'm OK**, your group gets the same **EMERGENCY** alert as the Emergency button, with your location, plus a chat message saying your phone detected a possible crash. Tap **Alert My Group Now** to send it straight away.

Choose how easily it goes off under **Sensitivity** on the Tilt screen: **Low** (only very hard hits and full rollovers, fewer false alarms on rough trails), **Normal** (recommended) or **High** (also smaller hits and steep tips). A hard bump you keep riding through doesn't count, and neither does knocking the phone while parked. Dropping your phone can still start the countdown, which is why it waits for you.

:::warning
Crash Alert tells your group only. It doesn't call 911 or emergency services. It only works while Ride Mode is open and you've joined the ride. With no service the alert waits on your phone and sends as soon as it reconnects, and riders need service to receive it. See [Emergencies and Staying Safe](/help/emergency-and-safety).
:::

## Where It Works

The tilt meter and Crash Alert are in the app on iPhone, iPad, Android phones and Android tablets. They aren't on the website, because a computer has no motion sensors.
