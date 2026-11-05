---
title: Use the Tilt Meter and Crash Alert
summary: See your vehicle's roll and pitch, get warned before a steep lean, and have OnMyLead alert your group if it detects a crash.
category: safety-privacy
order: 52
release: "2.0"
updated: 2026-11-05
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

The numbers turn amber as you get close to your limit and red at it. Tap the tile to open the full **Tilt** screen, with an axle seen from behind that leans with your roll, two wheels seen from the side that tip with your pitch, and the biggest lean each way under each one. Tap **Reset Max** to clear those (it shows once the meter is calibrated).

You can also open it from the **You** tab: tap **Tilt and Crash Alert**. The screen stays on while it's open, so you can leave it up on your mount.

## Turn the Tilt Meter Off

Don't want it? At the top of the Tilt screen, under the Crash Alert switch, tap **Tilt Meter On** to turn it off. The Tilt tile leaves Map Mode and Ride Mode, the Tilt screen hides the readings, and tilt warnings stop. Crash Alert keeps working on its own switch. Tap **Tilt Meter Off** to bring it back. The switch follows your account to your other devices.

## Calibrate It for Your Mount

The tilt meter is off until you calibrate it, because your phone probably doesn't sit flat in its mount. Until then the Tilt screen shows **Calibrate** instead of readings, and the tile in Map Mode and Ride Mode says **Calibrate Tilt**. Tilt warnings don't buzz, and Crash Alert only watches for hard hits, not rollovers.

1. Place your phone where it will be mounted, with the vehicle on flat and level ground.
2. Open **Tilt** and press **Calibrate**, then **Calibrate** again to confirm.

That reading becomes level, and the meter turns on. After that the button says **Zero**: press it again whenever you move the phone or switch vehicles. The calibration is kept on this phone only, since each phone sits differently. Tap **Clear Zero** to remove it, which turns the meter off until you calibrate again.

## Tilt Warnings

With **Warn Me** on, your phone buzzes when you lean past your limit for more than a moment, and again every few seconds while you stay past it. Set your own limits with **Roll Limit** and **Pitch Limit** (10° to 45°; they start at 25° roll and 30° pitch). Turn on **Say It Out Loud** to also hear the angle, such as "Roll 28 left".

:::warning
Every vehicle tips at a different angle, and load, tires and ground all change it. The limits are reminders, not a promise you won't roll.
:::

On a motorcycle, turn **Warn Me** off, since leaning into turns is normal. To hide the tile, turn the **Tilt Meter** off at the top of the screen. Your limits and these switches follow your account to your other devices.

## Crash Alert

Crash Alert is on unless you turn it off. To turn it on or off, open the Tilt screen and tap the **Crash Alert On** / **Crash Alert Off** switch at the top. The switch follows your account to your other devices. While Ride Mode is open, it watches for a hard hit or (once you've zeroed the tilt meter) a rollover while you're riding, followed by your vehicle stopping. When it sees one:

1. A full-screen countdown starts at 30 seconds, with vibration and a spoken warning.
2. Tap **I'm OK** to cancel. Nothing is sent.
3. If nobody taps **I'm OK**, your group gets the same **EMERGENCY** alert as the Emergency button, with your location, plus a chat message saying your phone detected a possible crash. Tap **Alert My Group Now** to send it straight away.
4. To cancel and stop Crash Alert for now, tap **I'm OK, Turn Off Crash Alert** under the buttons. Turn it back on from the top of the Tilt screen.

Choose how easily it goes off under **Sensitivity** on the Tilt screen: **Low** (only very hard hits and full rollovers, fewer false alarms on rough trails), **Normal** (recommended) or **High** (also smaller hits and steep tips). A hard bump you keep riding through doesn't count, and neither does knocking the phone while parked. Dropping your phone doesn't count either: Crash Alert notices the moment of falling and ignores the landing, and a dropped phone lying at an angle doesn't count as a rollover until it's back in its mount. If something still sets it off by mistake, tap **I'm OK**.

:::release 2.1
At driving speed (about 10 mph and up), a moment of falling can be your vehicle in the air (a jump, a ledge or a roll), so a hard landing, or coming to rest on its side or roof, still counts as a crash. Slower than that, a fall is taken as a dropped phone, as before. A phone that slides to the floor while you keep driving doesn't set it off; if you stop right after it falls, the countdown may start: tap **I'm OK**.
:::

:::warning
Crash Alert tells your group only. It doesn't call 911 or emergency services. It only works while Ride Mode is open and you've joined the ride. With no service the alert waits on your phone and sends as soon as it reconnects, and riders need service to receive it. See [Emergencies and Staying Safe](/help/emergency-and-safety).
:::

## Where It Works

The tilt meter and Crash Alert are in the app on iPhone, iPad, Android phones and Android tablets. They aren't on the website, because a computer has no motion sensors.
