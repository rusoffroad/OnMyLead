---
title: Offroad Park Trails
summary: Every map shows the trails of offroad parks like Hidden Falls, colored by the park's own levels and named, so you know a park before you ride it.
category: routes-maps
order: 55
release: "2.1"
updated: 2026-11-05
sources:
  - app/src/core/park-trails.ts
  - app/src/lib/park-trails.ts
  - app/src/hooks/use-trail-map.ts
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/trail-tiles.tsx
  - app/src/components/mapbox-map.tsx
  - app/src/components/mapbox-map.web.tsx
  - app/src/lib/web-map.ts
  - app/src/app/(tabs)/profile.tsx
  - app/scripts/parks/parks.json
  - supabase/migrations/20261104180000_park_trails.sql
related: [map-layers, navigation-mode, find-a-ride, offline-maps, route-builder]
keywords: [park trails, offroad park, off-road park, ohv park, orv park, atv park, hidden falls, hidden falls adventure park, katemcy, hollister hills, svra, park map, trail levels, level 5, trail names, private park, openstreetmap]
---

OnMyLead draws the trails of offroad parks on every map: Ride Mode, Map Mode, the route builder, waypoints, Find a Ride and the maps on onmylead.com. Hidden Falls Adventure Park, Katemcy Rocks, Wolf Caves, General Sam's, Hollister Hills, Hungry Valley, Ocotillo Wells, Interlake, SMORR, Sand Mountain and about fifty more parks and OHV areas are in, with their trail names and, where the park rates its trails, the park's own levels.

## See a Park's Trails

1. Open any map and zoom in to about a county's width. Park trails draw as **solid lines with a dark edge**, so they don't look like the dashed amber agency trails or the mint dotted rider trails.
2. From farther out, each park's **name** sits on the map with how many trails and miles are mapped, so you can see where the parks are while you pan across the state.
3. Zoom in closer and the trail **names** appear along the lines.

Park trails show for everyone, signed in or not, and they're on unless you turn them off.

## What the Colors Mean

Where a park rates its trails (Hidden Falls does, level 1 to 5), the line takes the color of that level, the same colors as trailhead signs and rider trails:

- **Green**: level 1 and 2, the easiest.
- **Blue**: level 3.
- **White**: level 4.
- **Red**: level 5, the hardest.
- **Amber**: a trail the park hasn't rated.
- **Thin white**: a park road.
- **Red dashes**: a trail the park has closed.

The key is in the map panel: under **Map Features**, the **Park Trails** row in the **Trails** group shows the four level colors.

## Tap a Trail

Tap a park trail to see its card: the park's name, the trail's name, its level (or **Park Road** / **Trail** when it has none), its length, and whether it's one way. The card reminds you that levels and lines come from OpenStreetMap, the open map that riders and parks contribute to, so check the park's posted map too: trails change after storms and work days, and a park may re-rate a trail before the map catches up.

## Turn Park Trails Off

Tap the layers button on any map and, under **Map Features**, tap the **Park Trails** row in the **Trails** group to turn it off. The same choice is on the **You** tab as **Park Trails on Maps**. Either one changes every map, on every device you're signed in on. Park Trails is free for everyone, like Rider Trails, so it stays even without Pro.

## With No Signal

A park you've looked at while connected stays on your phone, so its trails draw again at the park with no service. Parks you've never opened need a signal the first time.

## Where the Trails Come From

Park trails are OpenStreetMap data (© OpenStreetMap contributors), published under the Open Database License, which allows OnMyLead to show them with that credit. OnMyLead never copies a park's own copyrighted map. A park that isn't on the map yet simply isn't mapped in OpenStreetMap; anyone, including the park, can add its trails there and they'll come into OnMyLead with the next park update.

If a line is wrong or a trail is gone, use **Contact Us** on the You tab and name the park and the trail. The OnMyLead team can take a line off the map right away.
