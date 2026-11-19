---
title: Switch Activities
summary: Use OnMyLead for offroad, motorcycle, road trip or snowmobile rides. Each activity has its own colors, buttons, rides, events and places.
category: getting-started
order: 35
release: "4.1"
updated: 2026-11-19
sources:
  - app/src/core/activities.ts
  - app/src/lib/activity.ts
  - app/src/components/home/activity-switcher.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/ride-controls.tsx
  - supabase/migrations/20261121300000_activities.sql
related: [home-screen, status-buttons, find-a-ride, events, scout]
keywords: [activity, mode, offroad, motorcycle, road trip, snowmobile, sled, car, rv, switch, colors]
---

OnMyLead isn't only for offroad. Pick the activity you're riding today and the app changes to match: its colors, the words on Home, the buttons in Ride Mode, and the rides, events and places you see.

The activities are **Offroad**, **Motorcycle**, **Road Trip** and **Snowmobile**.

## Switch Your Activity

1. On Home, tap the colored button at the top, next to the bell. It shows the activity you're in.
2. Pick an activity.

The app redraws in that activity's color. Your pick is saved and follows your account to your other devices the next time you open the app there.

## What Changes

- **Colors.** Each activity has its own color on Home's buttons, the Join a Ride card and the edges of every card, so you always know where you are. Offroad keeps OnMyLead's red. Motorcycle is orange, Road Trip is gold and Snowmobile is ice blue. **EMERGENCY** and **Need Help** stay red in every activity.
- **Rides, events and places.** Public rides on Home and Find a Ride, events, and Places to Ride show the ones for your activity.
- **New rides and events.** A ride or event you create is for the activity you're in.
- **Ride Mode buttons.** The Ride Mode panel is the same in every activity. Under **More**, the **Tell the Group** sheet shows the activity at the top, leaves out buttons that don't fit and adds its own:
  - **Motorcycle:** adds **Rest Stop**, and leaves out **Stuck**.
  - **Road Trip:** adds **Food Stop** and **Restroom Stop**, and leaves out **Stuck**.
  - **Snowmobile:** adds **Warming Up** and **Belt Broke**, and leaves out **Flat Tire**.

A ride keeps the activity it was created for. When you join someone's Snowmobile ride, you get the Snowmobile buttons in its Ride Mode, whatever your own activity is.

## What Stays the Same

- Your friends, riding groups and messages are the same in every activity.
- **EMERGENCY** reaches every OnMyLead rider nearby over Bluetooth, whatever their activity.
- Pro covers every activity. Nothing extra to buy.

:::note
Everything you made before activities existed (rides, events and places) is Offroad.
:::
