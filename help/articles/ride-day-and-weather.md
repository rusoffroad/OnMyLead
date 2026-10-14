---
title: Ride Day and Weather
summary: See the forecast for the meeting area and check whether your ride gets back before sunset, right on the ride page.
category: rides
order: 60
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/ride-day.tsx
  - app/src/core/ride-day.ts
  - app/src/lib/forecast.ts
  - app/src/app/r/[code].tsx
related: [create-a-ride, directions, fuel-range, emergency-and-safety]
keywords: [weather, forecast, rain, wind, temperature, sunset, sunrise, daylight, dark, countdown, storm, tablet]
---

The **Ride Day** card on the ride page shows the weather for the meeting area and how your ride lines up with daylight, so nobody gets surprised by a storm or the last miles in the dark.

## Where to Find It

Open the ride page. **Ride Day** is in the **Details** section. It shows on upcoming and live rides.

## The Forecast

Ride Day shows the meet day's forecast:

- The conditions, such as Clear, Partly Cloudy, Rain or Thunderstorms
- The high and low temperature
- The chance of rain
- The wind speed, and gusts when they're much stronger than the wind

The forecast shows up about two weeks before the ride. Until then the card says when it will appear. The forecast is for the ride's general meeting area, not the exact spot.

:::tip
The last forecast your phone loaded is saved, so it still shows at a trailhead with no signal. It only updates when you have a connection.
:::

### Weather Warnings

Ride Day adds a heads-up when the forecast calls for:

- Thunderstorms (watch for lightning and flash floods in washes)
- A 60% or higher chance of rain
- Gusts of 35 mph or more
- A high of 100°F or more
- A low of 32°F or below

## Daylight Check

Ride Day shows sunrise and sunset at the meeting area, with a bar that shows when the ride runs against the daylight.

If the ride has a **Back By** time (the **Expected Finish** you set when creating the ride), Ride Day tells you:

- How long before sunset the group is back
- When it's cutting it close: back less than 45 minutes before sunset
- When the group will be back after dark, with a reminder to bring lights

If there's no finish time, the card says to add a Back By time so it can check it against sunset.

## Countdown

At the top of an upcoming ride's page, a tag counts down to the meeting time, such as "Tomorrow", "In 4 Days" or "Starts in 25 min".
