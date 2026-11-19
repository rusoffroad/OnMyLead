---
title: Switch Activities
summary: Use OnMyLead for offroad, motorcycle, road trip or snowmobile rides. Each activity has its own colors, buttons, rides, events and places.
category: getting-started
order: 35
release: "4.0"
updated: 2026-11-19
sources:
  - app/src/core/activities.ts
  - app/src/lib/activity.ts
  - app/src/components/home/activity-switcher.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/ride-controls.tsx
  - supabase/migrations/20261121300000_activities.sql
  - app/src/core/activity-layers.ts
  - app/src/hooks/use-activity-map.ts
  - app/src/lib/activity-map.ts
  - app/src/components/activity-splash.tsx
  - app/src/components/activity-map-layers.tsx
  - app/src/components/home/snow-card.tsx
  - supabase/migrations/20261121550000_activity_places.sql
related: [home-screen, status-buttons, find-a-ride, events, scout]
keywords: [activity, mode, offroad, motorcycle, road trip, snowmobile, sled, car, rv, switch, colors, snow, avalanche, twisty roads, byways, campgrounds, splash]
---

OnMyLead isn't only for offroad. Pick the activity you're riding today and the app changes to match: its colors, the words on Home, the buttons in Ride Mode, and the rides, events and places you see.

The activities are **Offroad**, **Motorcycle**, **Road Trip** and **Snowmobile**.

## Switch Your Activity

1. On Home, tap the colored button at the top, next to the bell. It shows the activity you're in.
2. Pick an activity.

The app shows a short picture of the activity, then redraws in its color. Tap the picture to skip it. With **Reduce Motion** on, it fades in without moving. Your pick is saved and follows your account to your other devices the next time you open the app there.

## What Changes

- **Colors.** Each activity has its own color on Home's buttons, the Join a Ride card and the edges of every card, so you always know where you are. Offroad keeps OnMyLead's red. Motorcycle is orange, Road Trip is gold and Snowmobile is ice blue. **EMERGENCY** and **Need Help** stay red in every activity.
- **Rides, events and places.** Public rides on Home and Find a Ride, and events, show the ones for your activity. **Places to Ride** searches for your activity's kind of place:
  - **Offroad:** off-road parks, OHV areas, trail systems, trailheads and motocross tracks, as before.
  - **Snowmobile:** snowmobile areas from the Forest Service.
  - **Motorcycle:** scenic drives, campgrounds and motocross tracks.
  - **Road Trip:** scenic drives and campgrounds.
- **The map.** Each activity adds its own **Map Features** (below).
- **New rides and events.** A ride or event you create is for the activity you're in.
- **Ride Mode buttons.** The Ride Mode panel is the same in every activity. Under **More**, the **Tell the Group** sheet shows the activity at the top, leaves out buttons that don't fit and adds its own:
  - **Motorcycle:** adds **Rest Stop**, and leaves out **Stuck**.
  - **Road Trip:** adds **Food Stop** and **Restroom Stop**, and leaves out **Stuck**.
  - **Snowmobile:** adds **Warming Up** and **Belt Broke**, and leaves out **Flat Tire**.

A ride keeps the activity it was created for. When you join someone's Snowmobile ride, you get the Snowmobile buttons in its Ride Mode, whatever your own activity is.

## Your Activity's Map

On every map in the app, tap the round map button in the top-left corner. Your activity's features are at the top of **Map Features**, under the activity's name. They're on until you switch one off, and they're part of Pro, like the other Map Features. Offroad has none, so its map is exactly as before. The map in your car (CarPlay) doesn't change.

**Snowmobile**

- **Snow on the Ground:** where there's snow today, drawn as a white frost over the map. From NOAA's daily snow analysis, in the lower 48 states.
- **Sled Trails:** Forest Service trails groomed or managed for snowmobiles, in ice blue with their names when you zoom in.
- **Avalanche Danger:** today's danger from the local avalanche center, colored by the danger scale and labeled with the zone's name.
- **Snow Depth Stations:** the measured snow depth at mountain weather stations (NRCS SNOTEL) in the western states, and how much it changed since the day before.
- **Falling Snow:** snow falls on the map when it's snowing where the map is. On iPhone, iPad and Android only, not the website.

**Motorcycle**

- **Twisty Roads:** the paved roads with the most curves, worked out on your device from the roads on screen. Gentle sweepers are light orange, curvy stretches orange and tight corners deep red. Zoom in to see more of them, since the map only carries smaller roads closer in.

**Road Trip**

- **Scenic Byways:** national and state scenic byways from the US Department of Transportation, in gold.
- **Campgrounds:** campgrounds and RV parks from OpenStreetMap, with names when you zoom in.

These features need a signal. With no service, the map shows only what you saved for offline use.

:::warning
Avalanche Danger and Snow Near You are a quick look, not a forecast. Always read the full avalanche forecast from your local center before you ride, and carry the right gear.
:::

## Snow Near You

In Snowmobile, Home shows a **Snow Near You** card when location is on for OnMyLead. It shows:

- the snow on the ground where you are,
- the snow forecast for the next 24 hours, and the temperature now,
- whether it's snowing now,
- today's avalanche danger from your local avalanche center. Tap it to open that center's full forecast.

The card shows only where there's something to say, and it never asks for location by itself. The snow comes from NOAA and the National Weather Service, so it covers the United States.

## What Stays the Same

- Your friends, riding groups and messages are the same in every activity.
- **EMERGENCY** reaches every OnMyLead rider nearby over Bluetooth, whatever their activity.
- Pro covers every activity, including each activity's Map Features. Nothing extra to buy.

:::note
Everything you made before activities existed (rides, events and places) is Offroad.
:::
