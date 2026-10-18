---
title: Map Layers and Trails
summary: Switch between satellite and topo, show public trails and roads with their names and closures, and tap a trail to see which vehicles can ride it.
category: routes-maps
order: 50
release: "1.0"
updated: 2026-10-18
sources:
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/trail-tiles.tsx
  - app/src/components/trail-tiles.web.tsx
  - app/src/hooks/use-trail-map.ts
  - app/src/core/trails.ts
  - app/src/core/osm-trails.ts
  - app/src/lib/trail-tiles.ts
  - app/src/lib/trail-tiles.web.ts
  - app/src/lib/trail-lookup.ts
  - app/src/lib/map-signal.ts
  - app/src/lib/web-map.ts
  - app/src/components/rides-map.tsx
  - app/src/components/route-builder-map.tsx
  - app/src/components/route-builder-map.web.tsx
  - app/src/components/rides-map.web.tsx
  - app/src/components/waypoint-map.web.tsx
related: [offline-maps, route-builder, ride-mode, find-a-ride, waypoints-and-planned-stops]
keywords: [closed, closure, closed trail, seasonal closure, trail names, road names, labels, layers, topo, topographic, satellite, trails, forest service, mvum, blm, openstreetmap, osm, legal trails, vehicle access, ohv, utv, map type, tablet]
screenshots:
  - file: map.webp
    shows: app/src/components/trail-tiles.tsx
---

OnMyLead's maps can show public trails and roads over satellite imagery or a topo map. Tap a trail to see its name and which vehicles are allowed on it.

![Trail lines and rider dots on the satellite map](/help/img/map.webp)

## Open the Layers

The layers button is the round button with a stacked layers icon in the top-right corner of the map. You'll find it on:

- Ride Mode's map
- A ride's waypoints map
- The route builder
- The area picker for offline maps

Tap it to open the **Map** panel. Tap it again to close the panel.

Your choices are remembered on your phone and used on every map in the app.

## Satellite or Topo

At the top of the panel, pick:

- **Satellite**: aerial imagery with road and place labels. This is the default.
- **Topo**: the USGS topographic map, with contour lines.

## Public Trails and Roads

Turn **Public Trails and Roads** on to draw trail and road lines on the map. It's on unless you turn it off.

:::until 1.0.1
- **Trail**: a dashed sand-colored line.
- **Road**: a solid pale line.
:::

:::release 1.0.1
- **Trail**: a bold dashed amber line.
- **Road**: a solid white line.
- **Closed**: red dashes on a dark outline. See [Closed Trails and Roads](#closed-trails-and-roads).

Every line has a dark outline, so it stands out on forest, desert and snow.

### Trail and Road Names

Zoomed in, the map shows names:

- OpenStreetMap trails get a name tag in the middle of the trail, like **Hell's Revenge 4x4 Trail**. A tag with a red border and **Closed** marks a trail mapped as closed or private.
- Forest Service roads and trails show their name and number along the line, like **Jenny Lind 414.1**.
- Road names come from the satellite map's own labels, and the topo map has its own road names.
:::

The lines come from:

- **USDA Forest Service**: the Motor Vehicle Use Map roads and trails.
- **Bureau of Land Management**: BLM routes.
- **OpenStreetMap**: tracks mapped by riders, including off-road parks, state land and county roads.

Trail lines show once you zoom in. If you see **Zoom In to See Trails**, zoom in a little. If you see **Zoom In for Park and Local Trails**, the Forest Service and BLM lines are showing, and the OpenStreetMap tracks appear when you zoom in closer.

The map on the **Find a Ride** tab shows trail lines too when you zoom in, following the choice you made here.

## See Who Can Ride a Trail

1. Make sure **Public Trails and Roads** is on and you're zoomed in.
2. Tap a trail or road line. In the route builder, press and hold instead, since a tap adds a route point.
3. A card shows the trail's name, where it is, whether it's a trail, road or track, the segment's miles and surface when known.

Under **Open To**, the card lists the vehicles the agency allows. If access changes by season, it says **Open To, by Season** with the open dates. If the agency data doesn't say, the card tells you.

:::release 1.0.1
If the trail or road is closed today, a red box at the top of the card says so, for example **Closed for the Season** with the date it opens again, **Closed to Motor Vehicles** or **No Public Access**. On a seasonal trail, a vehicle whose season is over shows **Closed Now** next to its dates.
:::

For an OpenStreetMap track, the card says it was mapped by riders on OpenStreetMap, and that parks and private land need permission or a pass.

:::warning
Map data can be out of date. Always check posted signs and closures before you ride.
:::

:::release 1.0.1
## Closed Trails and Roads

Closed trails and roads are drawn as red dashes on a dark outline, and the panel's legend shows **Trail**, **Road** and **Closed**. A line is marked closed when:

- **Forest Service**: the road is listed as closed to motor vehicles (red, labeled **CLOSED** along the line), or a seasonal road or trail is outside its open dates for every vehicle today (red, over the trail's normal line).
- **BLM**: the route's travel plan closes it to off-highway vehicles.
- **OpenStreetMap**: the track is mapped as closed or private.

Seasonal closures show once you zoom in to about a county's width, and need a signal to load. The other closures are part of the trail lines, so they're saved with a downloaded map.

:::warning
Closures come from the agencies' published travel plans and seasons and from OpenStreetMap. They are not live gate reports: a trail can also be closed for fire, snow, repairs or a local order that isn't in this data, and coverage outside Forest Service and BLM land depends on what riders have mapped. Always check posted signs and local orders before you ride.
:::
:::

## Download a Ride's Map

On a ride with a route, the panel has **Download This Ride's Map**. One tap saves satellite, topo and trails around the route for riding with no signal. This is a Pro feature. See [Free and Pro](/help/free-vs-pro) and [Offline Maps](/help/offline-maps).

The **Offline Maps** link at the bottom of the panel opens all your downloaded maps.

## With No Signal

When your phone loses signal, a **No Signal** tag with **Downloaded Map** appears under the layers button. The map then shows only what's saved on your phone, and the satellite view switches to downloaded USGS aerial photos. See [Offline Maps](/help/offline-maps).

## On the Website

The website's route builder and waypoints map have the same layers button and **Map** panel: **Satellite** or **Topo**, **Public Trails and Roads**, the trail and road names, and closed trails in red. The satellite map shows road names too. Zoomed in, the **Find a Ride** map shows the trail lines and names as well.

On the website, click a trail line to see its card when you're not adding points: on a route imported from a GPX file, for example. On the waypoints map a click adds a waypoint, so read the names on the map there. Downloading maps for no signal is only in the app.

## Map Data and Credits

- Trails and roads: USDA Forest Service MVUM and Forest Service roads, Bureau of Land Management, and map data © OpenStreetMap contributors, © OpenMapTiles, served by OpenFreeMap.
- Topo: USGS The National Map.
- Satellite with no signal: USGS The National Map: Orthoimagery.

The credits for what's showing are listed at the bottom of the **Map** panel. Loading map squares only sends the area being looked at, never anything about you.
