---
title: Navigate Offroad and Map Your Own Trails
summary: Use Navigate as your offroad map, record or draw your own trails, share them with every rider, rate trails others mapped, and measure distances.
category: routes-maps
order: 15
release: "1.0.3"
updated: 2026-11-03
sources:
  - app/src/components/music-controls.tsx
  - app/src/app/nav/index.tsx
  - app/src/app/nav/trails.tsx
  - app/src/app/nav/trail/[id].tsx
  - app/src/app/nav/public/[id].tsx
  - app/src/components/nav-map.tsx
  - app/src/components/nav-map.web.tsx
  - app/src/core/follow-camera.ts
  - app/src/components/follow-me-button.tsx
  - app/src/components/rate-trail-sheet.tsx
  - app/src/components/trail-picker-sheet.tsx
  - app/src/core/nav-trails.ts
  - app/src/lib/nav-trails.ts
  - supabase/migrations/20261101600000_nav_trails.sql
related: [follow-me, map-layers, route-builder, create-a-ride, offline-maps, badges-and-ranks]
keywords: [navigate, navigation, nav mode, navigation mode, offroad map, gps, record a trail, track, my trails, share a trail, rider trails, user submitted trails, rate a trail, trail rating, accuracy, distance finder, measure, ruler, how far, trail photos, difficulty]
---

**Navigate** is OnMyLead's offroad map for when you're not on a group ride. It has the same trails and roads as the rest of the app, shows where you are, and lets you record your own trails, keep them on your phone or share them with every rider. The map, following trails, measuring and rating trails are free. Recording, sharing your trails and planning group rides on them are part of [OnMyLead Pro](/help/free-vs-pro).

## Open Navigate

- On Home, tap the **Navigate** card.
- Or on the **You** tab, tap **Navigate** under **On the Trail**.

At the top of the map are three tabs: **Explore**, **Record** and **Measure**. Swipe the panel down to see more of the map, and up to bring it back.

:::release 1.0.4
For the whole screen, tap **Full Map** on the panel's grab bar. A slim bar keeps your speed (or the miles left on a trail you're following, or the length you're measuring, with **Undo**), a red **Rec** while you record, and **Center on Me** stays. Tap **Controls**, or swipe the bar up, to bring everything back. See [Full Map](/help/full-map).
:::

:::tip
On a tablet, the panel sits beside the map in landscape, and floats over the corner of the map in portrait.
:::

## Explore

**Explore** shows your speed and elevation, with the map centered on you. Use the layers button for **Satellite** or **Topo** and trail lines (see [Map Layers and Trails](/help/map-layers)), the search box to jump to a place, and the round **Center on Me** button to center on you again. Tap any line to see what it is.

### The Map Follows You

:::until 1.0.4
While you record a trail, or follow a trail you're on or near, the map moves with you so your dot stays in view. Tapping **Center on Me** also makes the map follow you. The button turns white while the map is following.

To look around, drag or pinch the map. It stops following until you tap **Center on Me** again. The map also holds still while the **Measure** tab is open, and when you jump to a place with search.
:::

:::release 1.0.4
With **Follow Me** on (it is unless you turn it off), the map moves with you so your dot stays in view, and while you're moving your dot has a white arrow pointing the way you're heading. The **Follow Me** button sits just left of **Center on Me** and shows **Following**.

To look around, drag or pinch the map. It pauses (the button shows **Paused**) until you tap it or **Center on Me** again. The map also holds still while the **Measure** tab is open, and when you jump to a place with search. Tap **Following** to turn Follow Me off; the map then stays where you put it, even while you record. See [Follow Me on the Map](/help/follow-me).
:::

The screen stays on while Navigate is open.

### Follow a Trail

1. Open a trail from **My Trails**, or tap a rider trail on the map.
2. Tap **Follow in Navigate** (your trails) or **Navigate** (rider trails).
3. The trail is drawn on the map, and the panel shows the distance **Left on Trail**, or how far you are from its start. Tap **Stop** to stop following.

## Record a Trail

This is in the OnMyLead app on your phone or tablet. The website can't record.

This is a Pro feature. See [Free and Pro](/help/free-vs-pro).

1. Tap the **Record** tab, then **Record a Trail**.
2. Ride. Your line is drawn on the map with its distance, time and climb.
3. Tap **Pause** for a break and **Resume** to carry on.
4. Tap **Finish and Save** when you're done. Or tap **Discard Recording** to throw it away.

Keep Navigate open while you record: the screen stays on, and recording stops if you leave Navigate or lock the phone. If the app closes, the recording is still there when you open Navigate again.

## Measure a Distance

1. Tap the **Measure** tab.
2. Tap the map where you want to measure from, then where you want to measure to. On the website, click.
3. Pick **Follow Trails** to measure along the trails and roads, or **Straight Line** for the distance as the crow flies.
4. Keep tapping to add points. **Undo** removes the last one, **Clear** starts over.
5. Tap **Save as Trail** to keep the line in My Trails, so you can follow it or plan a ride on it.

## My Trails

Tap **My Trails** in Explore (or the trail chip on the map) to see every trail on this phone: ones you recorded, drew with Measure, or saved from other riders. Tap a trail to open it.

On a trail you can:

- Name it and add details: **Difficulty** (Easy, Moderate, Hard or Extreme), **Vehicles That Fit**, **Surface**, **Season**, a width limit, **One Way** and notes.
- Add up to 6 photos. Press and hold a photo to remove it.
- See its distance, climb, high point and, for a recording, moving time.
- **Follow in Navigate**, **Plan a Group Ride on This Trail** or **Delete Trail**.

Trails stay on your phone until you share them. Deleting the app deletes them too.

## Share a Trail With Every Rider

Sharing is a Pro feature. See [Free and Pro](/help/free-vs-pro).

1. Open the trail in My Trails.
2. Give it a name, a difficulty and at least one vehicle type. Other details are optional but help other riders.
3. Tap **Share with Everyone** and confirm.

Shared trails show your ride name as the mapper, with the trail's photos and details. To keep where you start and finish private, the first and last 200 meters (about 650 feet) of a shared trail are left off. A trail too short for that can't be shared.

If your Pro ends, trails you already shared stay up and you can still edit them or stop sharing.

To take it back, tap **Stop Sharing**. The trail comes off the public map and its ratings are removed. It stays on your phone.

You need to be signed in to share. Sharing trails also counts toward the **Trailblazer** badge. See [Earn Badges and Ranks](/help/badges-and-ranks).

## Delete a Trail

Only the rider who mapped a trail can delete it.

1. Open the trail in **My Trails**.
2. Tap **Delete Trail**, then **Delete**.

The trail is deleted from your phone. If you shared it, it also comes off the public map with its photos and ratings. If that can't happen (with no signal, for example), the app says so and keeps the trail, so try again with a signal.

On a trail you shared, the trail's page also has **Delete Your Trail**. It takes the trail off the public map and keeps the copy on this phone in My Trails.

Group rides that already used the trail as their route keep their route.

## Rider Trails on the Map

Trails other riders shared are called rider trails. They're drawn as **mint dotted lines**, so they stand out from the agency and OpenStreetMap trails. They show on Navigate and on the other maps with trail lines once you zoom in, when you're signed in.

Tap one to see its card. It says **User Submitted Trail**, who mapped it, the difficulty, distance, its **Quality** and **Line Accuracy** stars, and buttons to rate it, navigate it or see the details. The details page adds the vehicles, notes, photos and **Save to My Trails**.

### Hide Rider Trails

On the **You** tab, under **On the Trail**, turn off **Rider Trails on Maps**. You can also turn off **Rider Trails** in the map's layers panel. They're on unless you turn them off.

## Rate a Rider Trail

1. Tap a rider trail, then **Rate Trail** (or **Rate This Trail** on its page).
2. Give the trail's **Quality** from 1 to 5 stars: is it worth riding?
3. If you rode it, rate how accurate the line is under **Rode It? How Accurate Is the Line?**
4. Add a note for the mapper if you like, then tap **Save Rating**.

You can change your rating later. You can't rate your own trails. After you follow a rider trail for a while, Navigate asks you to rate it.

### When Riders Rate a Trail as Inaccurate

If several riders rate a trail's line 2 stars or fewer for accuracy, it's hidden from everyone else's map. Right now that's 3 riders, who make up at least half of its accuracy ratings. The mapper keeps the trail on their phone and gets a notification, and My Trails shows it as hidden. OnMyLead can also put a trail back or take one down.

:::warning
Rider trails are mapped by riders, not by a land agency. Always check posted signs, closures and land access before you ride.
:::

## Use a Trail for a Group Ride

This is a Pro feature. See [Free and Pro](/help/free-vs-pro).

- On a trail, tap **Plan a Group Ride on This Trail**. The new ride uses the trail as its route and its start as the meeting point.
- On a ride's route, tap **Use One of My Trails** and pick a trail.

See [Create a Ride](/help/create-a-ride) and [Draw a Route](/help/route-builder).

:::release 1.0.4
## Control Your Music

The round **Music** button above **Center on Me** pauses, skips and changes the volume of the music on your phone. See [Control Your Music While You Ride](/help/music-controls).
:::

## On the Website

On onmylead.com, Navigate has Explore, Measure and My Trails (kept in that browser). Sign in to see, share and rate rider trails. Recording a trail is only in the app.
