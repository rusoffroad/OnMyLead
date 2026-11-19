---
title: Weather Radar and Forecast
summary: See rain and snow on the radar over the map in Ride Mode and Map Mode, and the forecast and weather alerts for where you are.
category: routes-maps
order: 52
release: "4.0"
updated: 2026-11-19
sources:
  - app/src/components/map-weather.tsx
  - app/src/core/weather.ts
  - app/src/lib/weather.ts
  - app/src/hooks/use-map-weather.ts
  - app/src/hooks/use-trail-map.ts
  - app/src/components/mapbox-map.tsx
  - app/src/components/mapbox-map.web.tsx
  - app/src/components/trail-map-overlay.tsx
related: [map-layers, ride-mode, navigation-mode, ride-day-and-weather, free-vs-pro]
keywords: [weather, radar, weather radar, doppler, rain, snow, storm, thunderstorm, forecast, hourly forecast, 7 day forecast, weather alerts, warnings, flash flood, winter storm, red flag, noaa, national weather service, nws, temperature]
---

OnMyLead can show the weather right on the map you're riding with: **Weather Radar** draws the rain and snow falling now, and **Forecast Where You Are** shows the temperature, the next hours, 7 days and any official weather alerts.

## Turn Them On

1. In Ride Mode or Map Mode, tap the round **Map Settings** button in the top-left corner of the map.
2. Under **Weather**, tap **Weather Radar**, **Forecast Where You Are**, or both.

Both start off. Your choices are remembered and synced to your other devices, like the rest of Map Settings.

## Weather Radar

Weather Radar paints rain and snow over the map, from light (blue) to heavy (red), with a small key under the Map Settings button. It shows on every map that has Map Settings: Ride Mode, Map Mode, the route builder and the waypoint map. Your route, the riders and the trails stay on top, so you can see which way a storm is moving compared to where you're headed.

- It updates every 5 minutes while the map is open.
- It needs service. With no signal the radar goes away, so old rain is never shown as now.
- Weather Radar is part of OnMyLead Pro, like the other Map Settings. On Free the switch carries the **Pro** tag. See [Free and Pro](/help/free-vs-pro).
- It shows on the Mapbox maps (every map in the app and on the website). It doesn't show on CarPlay.

## Forecast Where You Are

With the forecast on, a round button with the temperature sits under Map Settings in Ride Mode and Map Mode, with the chance of rain or snow this hour under it. A yellow edge and dot mean there's an official weather alert where you are.

Tap it to open **Weather**:

- Any **alerts** first, such as a Flash Flood Warning or Winter Weather Advisory, from the National Weather Service.
- **Now**: the temperature, what's coming (for example "Rain and Snow Likely by 2 PM"), the chance of rain or snow and the wind.
- **The next 12 hours**, hour by hour.
- **7 days**, day and night.

The forecast is free for everyone.

:::tip
The last forecast your phone loaded is saved, so it still shows with no service, marked with how old it is. It refreshes every 20 minutes, and when you've moved about 6 miles.
:::

## Where It Comes From

Both come from the U.S. government: the radar from NOAA's national radar mosaic and the forecast and alerts from the National Weather Service. They cover the United States only.

The forecast is for where your phone is (when you've allowed location), or the middle of the map if not. Your spot is rounded to about 3 miles before it's sent, and only to ask for the forecast; nothing else about you goes with it.

## On a Tablet and the Website

It works the same on iPhone, iPad, Android phones and tablets, and onmylead.com. On a tablet held sideways, the Weather sheet opens on the right so the map stays in view.
