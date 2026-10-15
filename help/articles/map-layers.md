---
title: Map Layers and Trails
summary: Switch between satellite and topo, show public trails and roads, and tap a trail to see which vehicles can ride it.
category: routes-maps
order: 50
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/components/trail-map-overlay.tsx
  - app/src/components/trail-tiles.tsx
  - app/src/components/trail-tiles.web.tsx
  - app/src/hooks/use-trail-map.ts
  - app/src/core/trails.ts
  - app/src/core/osm-trails.ts
  - app/src/lib/trail-tiles.ts
  - app/src/lib/trail-tiles.web.ts
  - app/src/lib/map-signal.ts
  - app/src/lib/web-map.ts
  - app/src/components/rides-map.tsx
  - app/src/components/route-builder-map.tsx
  - app/src/components/route-builder-map.web.tsx
related: [offline-maps, route-builder, ride-mode, find-a-ride, waypoints-and-planned-stops]
keywords: [layers, topo, topographic, satellite, trails, forest service, mvum, blm, openstreetmap, osm, legal trails, vehicle access, ohv, utv, map type, tablet]
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

- **Trail**: a dashed sand-colored line.
- **Road**: a solid pale line.

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

For an OpenStreetMap track, the card says it was mapped by riders on OpenStreetMap, and that parks and private land need permission or a pass.

:::warning
Map data can be out of date. Always check posted signs and closures before you ride.
:::

## Download a Ride's Map

On a ride with a route, the panel has **Download This Ride's Map**. One tap saves satellite, topo and trails around the route for riding with no signal. This is a Pro feature. See [Free and Pro](/help/free-vs-pro) and [Offline Maps](/help/offline-maps).

The **Offline Maps** link at the bottom of the panel opens all your downloaded maps.

## With No Signal

When your phone loses signal, a **No Signal** tag with **Downloaded Map** appears under the layers button. The map then shows only what's saved on your phone, and the satellite view switches to downloaded USGS aerial photos. See [Offline Maps](/help/offline-maps).

## On the Website

The website's maps show satellite imagery only. The layers button, the topo map, the Forest Service and BLM lines and the trail lookup are in the app. When you build a route on the website, OpenStreetMap trail lines appear once you zoom in close.

## Map Data and Credits

- Trails and roads: USDA Forest Service MVUM, Bureau of Land Management, and map data © OpenStreetMap contributors, © OpenMapTiles, served by OpenFreeMap.
- Topo: USGS The National Map.
- Satellite with no signal: USGS The National Map: Orthoimagery.

The credits for what's showing are listed at the bottom of the **Map** panel. Loading map squares only sends the area being looked at, never anything about you.
