---
title: Use OnMyLead on CarPlay
summary: During a ride, OnMyLead shows on your car's CarPlay screen with one-tap status buttons, your group, EMERGENCY and alerts when a rider falls behind.
category: ride-mode
order: 46
release: "2.1"
updated: 2026-11-12
sources:
  - app/modules/onmylead-carplay/**
  - app/plugins/with-carplay.js
  - app/src/core/carplay.ts
  - app/src/lib/carplay.ts
  - app/src/app/_layout.tsx
  - app/src/app/ride/[id]/live.tsx
  - app/src/app/nav/index.tsx
related: [ride-mode, navigation-mode, status-buttons, emergency-and-safety, ride-bubble, leader-sweep-and-tail-gunner, music-controls]
keywords: [carplay, car play, car screen, dashboard, truck, jeep, car, apple carplay, android auto, head unit, infotainment]
---

If your truck, Jeep or car has Apple CarPlay, OnMyLead shows on the car's screen during a ride. You get big buttons for the status taps you use most, your group, and EMERGENCY, so you can keep your phone in the mount and your eyes on the trail.

CarPlay works with iPhone. iPad, Android phones and Android tablets don't have it, and OnMyLead doesn't support Android Auto.

CarPlay is part of OnMyLead Pro, including the Pro Trial. On a Free account the car screen says **CarPlay Is Part of OnMyLead Pro**, and Ride Mode, status taps and EMERGENCY keep working on your phone. See [Free and Pro](/help/free-vs-pro).

## Start CarPlay

1. Connect your iPhone to the car, with a cable or wirelessly, the way you usually start CarPlay.
2. Tap **OnMyLead** on the car screen. If you don't see it, swipe across the car's home screen, or add it in your iPhone's **Settings** > **General** > **CarPlay** > your car > **Customize**.
3. Open **Ride Mode** for your ride on your phone. The car screen follows it.

:::until 3.0
Until Ride Mode is open on your phone, the car screen says **No Ride Running**.
:::

:::release 3.0
Riding solo, with no group ride? Open **Map Mode** on your phone, or tap **Open Map Mode** on the car screen, and the car shows Map Mode instead (see below).

With neither Ride Mode nor Map Mode open on your phone, the car screen says **No Ride Running**, with an **Open Map Mode** button.
:::

## What's on the Car Screen

The top of the screen shows the ride's name and how the group is doing: **Group Together**, how many riders are separated, or the latest status another rider tapped.

The buttons:

- **Group** lists every rider on the ride, with the leader and tail gunner marked.
- **OK**, **Stopped**, **Need Fuel**, **Mechanical Issue** and **Need Help** send that status to the group, the same as tapping it in Ride Mode on your phone.
- **Regroup Here** shows for the organizer and leader. Other riders get **Running Late** in its place.
- **EMERGENCY** asks once, **Send EMERGENCY with your location to everyone on the ride?**, and tap **Alert My Group** to send it. **Cancel** sends nothing.

Typed messages, your own quick replies and the map stay on your phone. CarPlay only allows a few buttons, and typing while driving isn't safe.

:::release 3.0
## Map Mode on the Car Screen

When Map Mode is open on your phone and no ride is in Ride Mode, the car screen shows Map Mode's numbers, updated as you drive:

- **Speed**, **Elevation**, **Heading**, **Trip** and **Moving** time, the same as the dash in Map Mode on your phone.
- When you're following a trail: the trail's name and the miles **Left on Trail**, or how far it is **To the Start**.
- When you're recording a trail: **Recording** or **Paused** with its length so far, and a **Pause** or **Resume** button.

The map itself stays on your phone. Apple only lets navigation apps draw maps on a CarPlay screen. Open Ride Mode and the car screen switches to your ride; close it and Map Mode comes back.
:::

:::release carplay-map
## The Map on the Car Screen

The car screen shows the OnMyLead map, in your Map Style, with your position and the direction you're heading. The map turns as you drive, so the way ahead is up.

- **During a ride:** the ride route, the Leader Trackline, and every rider who is sharing. A hollow dot means that's only where a rider was last seen, not where they are now. A colored ring means the rider is separated or asked for help.
- **In Map Mode:** the trail you're following and the trail you're recording.
- **Guidance:** while you follow a trail or the ride route, the top of the screen says **Follow** and the trail's name, with the miles and time left. Off the trail, it says **Head to the Start** with how far it is.
- The buttons on the map zoom in and out, bring the map back to you, and show arrows to move the map. On a touchscreen you can also drag it.
- **Ride** opens the status buttons and EMERGENCY described above, and **Group** lists the riders. In Map Mode, **Dash** opens your speed, elevation and trip numbers, and **Pause** or **Resume** works your recording.

Saved offline map areas draw with no service. Other riders' dots only move while your phone has service (or a Bluetooth connection to them); without it they stay where each rider was last seen.
:::

## Alerts on the Car Screen

- When another rider taps a status, like **Need Fuel**, **Mechanical Issue**, **Need Help** or **EMERGENCY**, it pops up as an alert with their name. Tap **OK** to close it. **OK** taps don't alert anyone.
- The leader and the tail gunner also get an alert when a rider falls out of the [Ride Bubble](/help/ride-bubble), the same alert the phone speaks.

## Language

The car screen uses the language you picked in OnMyLead. See [Language](/help/language).

## Troubleshooting

- **OnMyLead isn't on the car screen.** Update OnMyLead from the App Store, then reconnect your iPhone to the car.
:::until 3.0
- **The car screen says No Ride Running.** Open Ride Mode for your ride on your phone.
:::
:::release 3.0
- **The car screen says No Ride Running.** Open Ride Mode for your ride on your phone, or tap **Open Map Mode**.
:::
- **The car screen says CarPlay Is Part of OnMyLead Pro.** Your account is on Free. Check **You** > **Subscription** on your phone.
- **A button did nothing.** Status taps need the same signal as on your phone. With no service, they wait and send when you're back in range, just like in Ride Mode.
