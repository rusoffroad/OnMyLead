---
title: 3D Terrain
summary: See the satellite map on the real shape of the land in Ride Mode and Map Mode, with contour lines and peak heights in feet, and tilt and turn it.
category: routes-maps
order: 52
release: "2.1"
updated: 2026-11-13
sources:
  - app/src/components/mapbox-map.tsx
  - app/src/components/mapbox-map.web.tsx
  - app/src/components/group-mapbox-map.tsx
  - app/src/components/nav-mapbox-map.tsx
  - app/src/components/trail-map-overlay.tsx
  - app/src/core/terrain.ts
  - app/src/hooks/use-trail-map.ts
  - app/src/lib/terrain.ts
  - app/src/lib/terrain-offline.ts
  - app/src/hooks/use-panel-fold.ts
related: [map-layers, offline-maps, ride-mode, navigation-mode]
keywords: [3d, 3d map, terrain, elevation, contour, contour lines, topo, peaks, mountains, tilt, pitch, mapbox, hills, ridges, tablet]
---

3D Terrain shows the satellite map draped over the real shape of the land, so you can see ridges, canyons and climbs before you ride them. Contour lines and peak heights are drawn on top, along with every trail layer.

## Turn On 3D Terrain

1. Open Ride Mode or Map Mode.
2. Tap the round **Map Settings** button (two sliders) in the top-left corner of the map.
3. Under **Map Style**, tap **3D Terrain**.

The map tilts to show the land in 3D. To lay it flat again, tap **Satellite** or **Topo** under **Map Style**.

Your choice is remembered and used in Ride Mode and Map Mode. Other maps, like the route builder and Find a Ride, show plain satellite while 3D Terrain is picked.

3D Terrain is a map style, so like the other map styles it's a Pro feature. See [Free and Pro](/help/free-vs-pro).

## Move Around in 3D

- **Tilt**: drag up or down with two fingers. The further you tilt, the steeper the land is drawn: looking straight down it's true to life, and at the steepest tilt hills and canyons stand up to three times their real height, so a ridge reads at a glance. Tilt back and it settles down again.
- **Turn**: twist with two fingers. The compass in the corner shows north; tap it to face north again.
- **Zoom and pan**: pinch and drag, as on any map.

On the website, right-drag or hold Ctrl and drag to tilt and turn (two fingers on a touch screen), or use the zoom, compass and tilt buttons in the bottom-left corner. Tilting further raises the land there too.

## What's on the Map

- **Contour lines**: thin white lines, with every fifth line heavier and labeled in feet when you zoom in.
- **Peaks**: mountain names with their height in feet.
- **Trails and roads**: the same public trail, road, closure and rider trail lines as the flat maps. See [Map Layers and Trails](/help/map-layers).
- **Your ride**: rider dots, the route, waypoints, planned stops and the regroup pin in Ride Mode; your recording, followed trail, Track Line and the distance finder in Map Mode.

Follow Me and Center on Me work the same as on the flat map.

## With No Signal

3D Terrain needs a signal, or an area saved for it ahead of time. In [Offline Maps](/help/offline-maps), add **3D Terrain** to a download. With no signal, the 3D map shows over saved areas; anywhere else the app shows the flat downloaded map instead, so you always have a map.

## On iPhone, iPad, Android and the Website

3D Terrain works the same on iPhone, iPad, Android phones and tablets, and on the website in Ride Mode and Map Mode. Every map in the app is drawn by Mapbox from 2.1, so the other maps look the same as this one, just flat. See [Map Layers and Trails](/help/map-layers).
