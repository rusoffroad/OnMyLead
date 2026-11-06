---
title: Use OnMyLead on CarPlay
summary: During a ride, OnMyLead shows on your car's CarPlay screen with one-tap status buttons, your group, EMERGENCY and alerts when a rider falls behind.
category: ride-mode
order: 46
release: "2.1"
updated: 2026-11-06
sources:
  - app/modules/onmylead-carplay/**
  - app/plugins/with-carplay.js
  - app/src/core/carplay.ts
  - app/src/lib/carplay.ts
  - app/src/app/_layout.tsx
  - app/src/app/ride/[id]/live.tsx
related: [ride-mode, status-buttons, emergency-and-safety, ride-bubble, leader-sweep-and-tail-gunner, music-controls]
keywords: [carplay, car play, car screen, dashboard, truck, jeep, car, apple carplay, android auto, head unit, infotainment]
---

If your truck, Jeep or car has Apple CarPlay, OnMyLead shows on the car's screen during a ride. You get big buttons for the status taps you use most, your group, and EMERGENCY, so you can keep your phone in the mount and your eyes on the trail.

CarPlay works with iPhone. iPad, Android phones and Android tablets don't have it, and OnMyLead doesn't support Android Auto.

CarPlay is part of OnMyLead Pro, including the Pro Trial. On a Free account the car screen says **CarPlay Is Part of OnMyLead Pro**, and Ride Mode, status taps and EMERGENCY keep working on your phone. See [Free and Pro](/help/free-vs-pro).

## Start CarPlay

1. Connect your iPhone to the car, with a cable or wirelessly, the way you usually start CarPlay.
2. Tap **OnMyLead** on the car screen. If you don't see it, swipe across the car's home screen, or add it in your iPhone's **Settings** > **General** > **CarPlay** > your car > **Customize**.
3. Open **Ride Mode** for your ride on your phone. The car screen follows it.

Until Ride Mode is open on your phone, the car screen says **No Ride Running**.

## What's on the Car Screen

The top of the screen shows the ride's name and how the group is doing: **Group Together**, how many riders are separated, or the latest status another rider tapped.

The buttons:

- **Group** lists every rider on the ride, with the leader and tail gunner marked.
- **OK**, **Stopped**, **Need Fuel**, **Mechanical Issue** and **Need Help** send that status to the group, the same as tapping it in Ride Mode on your phone.
- **Regroup Here** shows for the organizer and leader. Other riders get **Running Late** in its place.
- **EMERGENCY** asks once, **Send EMERGENCY with your location to everyone on the ride?**, and tap **Alert My Group** to send it. **Cancel** sends nothing.

Typed messages, your own quick replies and the map stay on your phone. CarPlay only allows a few buttons, and typing while driving isn't safe.

## Alerts on the Car Screen

- When another rider taps a status, like **Need Fuel**, **Mechanical Issue**, **Need Help** or **EMERGENCY**, it pops up as an alert with their name. Tap **OK** to close it. **OK** taps don't alert anyone.
- The leader and the tail gunner also get an alert when a rider falls out of the [Ride Bubble](/help/ride-bubble), the same alert the phone speaks.

## Language

The car screen uses the language you picked in OnMyLead. See [Language](/help/language).

## Troubleshooting

- **OnMyLead isn't on the car screen.** Update OnMyLead from the App Store, then reconnect your iPhone to the car.
- **The car screen says No Ride Running.** Open Ride Mode for your ride on your phone.
- **The car screen says CarPlay Is Part of OnMyLead Pro.** Your account is on Free. Check **You** > **Subscription** on your phone.
- **A button did nothing.** Status taps need the same signal as on your phone. With no service, they wait and send when you're back in range, just like in Ride Mode.
