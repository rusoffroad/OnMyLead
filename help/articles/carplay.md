---
title: Use OnMyLead on CarPlay
summary: During a ride, OnMyLead shows on your car's CarPlay screen with one-tap status buttons, your group, EMERGENCY and alerts when a rider falls behind.
category: ride-mode
order: 46
release: "2.1"
updated: 2026-11-14
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

:::until 3.1
Typed messages, your own quick replies and the map stay on your phone. CarPlay only allows a few buttons, and typing while driving isn't safe.
:::

:::release 3.1
## Messages on the Car Screen

Tap **Messages** at the top of the car screen to see the ride's messages, newest first, with who sent each one and how long ago.

- Tap a message to hear it read out. Long messages are cut short on the screen, and the whole message is read.
- Tap **Reply** to send a quick reply with one tap: the built-in ones (**On My Way**, **Running Late**, **Need a Minute**, **All Good**, **Beverage Break**) and your own saved ones from **My Quick Replies** on your phone.
- Tap **Group Chats** to open your riding groups' chats without leaving the ride, hear their messages and send them a quick reply.

There's no typing on the car screen, because Apple doesn't allow it while driving. To save a new reply for the car, type it once on your phone with **Message** in Ride Mode and turn on **Save as One of My Quick Replies**.
:::

:::release 3.1
## Group Chats on the Car Screen

With no ride in Ride Mode, tap **Messages** at the top of the car map to see your **Group Chats** (during a ride, tap **Messages**, then **Group Chats**): every riding group you run or are in, the one with the newest message first, with how many messages are new.

- Tap a group to see its newest messages. Tap a message to hear it read out.
- Tap **Reply** to send a quick reply to the group with one tap: the same built-in replies and your own saved ones as during a ride.
- Messages from riders you blocked don't show.
:::

:::release 3.1
## Exit Ride Mode or Map Mode From the Car

- **During a ride:** tap **Exit** at the top left of the car screen, then **Exit Ride Mode**. Ride Mode closes on your phone. You stay on the ride, and your phone keeps sharing your spot if it was. **Cancel** keeps Ride Mode open.
- **In Map Mode:** tap **Exit Map Mode** under the numbers. If you're recording a trail, the car asks first, because the recording pauses until you come back.

After you exit, the car screen shows **Open Map Mode** again.
:::

:::release 3.0
## Map Mode on the Car Screen

When Map Mode is open on your phone and no ride is in Ride Mode, the car screen shows Map Mode's numbers, updated as you drive:

- **Speed**, **Elevation**, **Heading**, **Trip** and **Moving** time, the same as the dash in Map Mode on your phone.
- When you're following a trail: the trail's name and the miles **Left on Trail**, or how far it is **To the Start**.
- When you're recording a trail: **Recording** or **Paused** with its length so far, and a **Pause** or **Resume** button.

Open Ride Mode and the car screen switches to your ride; close it and Map Mode comes back.
:::

:::until 3.1
The map itself stays on your phone. Apple only lets navigation apps draw maps on a CarPlay screen.
:::

:::release 3.1
## The Map on the Car Screen

The car screen shows the OnMyLead map, in your Map Style, with your position and the direction you're heading. The map turns as you drive, so the way ahead is up.

- **During a ride:** the ride route, the Leader Trackline, and every rider who is sharing. A hollow dot means that's only where a rider was last seen, not where they are now. A colored ring means the rider is separated or asked for help.
- **The rider line:** during a ride with two or more riders sharing, a bar along the bottom of the car map shows every rider's dot in running order, the same as the line in Ride Mode on your phone: the leader on the left, the tail gunner on the right, and your own dot outlined in white. The distance on the right is how far the last rider is behind the leader. The car screen can't be tapped on the map, so the bar doesn't show names; tap **Ride**, then **Group**, to see who is where.
- **In Map Mode:** the trail you're following and the trail you're recording.
- **Turn-by-turn:** while you follow a trail or the ride route, the top of the screen shows the next turn with an arrow and how far away it is (**Bear Left**, **Turn Right**, **Sharp Left**, **Make a U-Turn**), then the turn after it, and finally **Arrive at the End of** the trail. The turns come from the shape of the trail itself, so they work on any trail, with or without service. Gentle curves aren't called out. Below that are the miles left, the time left and when you'll get there.
- **Head to the Start:** before you reach the trail, the car says **Head to the Start** and how far it is in a straight line. There are no road directions to the start; use Apple Maps or Google Maps for that (**Directions** on the ride or trail).
- **Trails and roads:** the same Map Features as the maps on your phone: off-road trails and tracks with their names, Forest Service and BLM roads and trails, dirt roads, paved roads, hiking trails and closures, plus land boundaries if you turned them on. Zoom in to see trails, the same as on your phone. Rider Trails and Park Trails show only on your phone for now.
- **Layers** at the top right turns them on and off from the car: **Streets and Roads**, **Off-Road Trails**, **Hiking Trails** and **Land Boundaries**, then **Closures**, **Width-Limited Trails** and **Street-Legal Only**. A filled circle means it's on. What you pick here is saved for every map in OnMyLead, and **Map Settings** on your phone changes the car map too.
- The buttons on the map zoom in and out, bring the map back to you, and show arrows to move the map. On a touchscreen you can also drag it.
- **Ride** opens the status buttons, **Group** and EMERGENCY described above. In Map Mode, **Dash** opens your speed, elevation and trip numbers, with **Pause** or **Resume** at the top while you record.
- **Messages** at the top right opens the ride's messages during a ride. With no ride in Ride Mode it opens your **Group Chats** (see below).
- **Open Ride Mode** shows at the top left when your phone is sharing your spot on a ride but Ride Mode isn't open. Tap it and Ride Mode opens on your phone, so the car shows the ride, the riders' dots and the ride's messages.
- **Exit** at the top left closes Ride Mode or Map Mode on your phone, the same as on the screens without the map.

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
