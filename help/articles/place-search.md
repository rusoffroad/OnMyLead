---
title: Search for a Place
summary: Find a trailhead, off-road park, town, street address or coordinates for a meeting point, a destination or the map.
category: routes-maps
order: 70
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/place-search.tsx
  - app/src/components/map-search.tsx
  - app/src/hooks/use-place-search.ts
  - app/src/core/places.ts
  - app/src/lib/places.ts
  - app/src/app/ride/new.tsx
  - app/src/app/(tabs)/find.tsx
  - app/src/app/ride/[id]/route.tsx
  - app/src/components/meet-point-map.tsx
  - app/src/components/meet-point-map.web.tsx
related: [create-a-ride, find-a-ride, route-builder, create-a-ride-on-the-website]
keywords: [search, place, address, trailhead, park, town, coordinates, gps coordinates, lat long, find location, meeting point, tablet]
---

Wherever OnMyLead asks for a place, you can type its name instead of hunting on a map: a trailhead, an off-road park, a campground, a town or a street address.

## Where You Can Search

- **Creating a ride**: **Search a Place or Address** sets the meeting point, and **Search a Destination** fills in where the ride ends up. See [Create a Ride](/help/create-a-ride).
- **Find a Ride**: **Search Near a Place** shows rides near the place you pick instead of near you. Tap **Back to Near Me** (or **Clear**) to go back. See [Find a Ride](/help/find-a-ride).
- **Route builder**: **Search** moves the map to a place before you draw. See [Draw a Route](/help/route-builder).

## Search

1. Tap the search box and type at least three letters.
2. Results show as you type. Each one says what it is and where, like "Trailhead in Moab, Utah".
3. Tap the one you want.

What happens next depends on where you searched:

- For a meeting point, the coordinates and place name fill in for you. You can still edit the **Place Name**.
- In the route builder, the map moves to the place and marks it. Nothing is added to your route.

If nothing turns up, try the full name, a street address with the town, or a nearby town.

## Search by Coordinates

Type coordinates as latitude and longitude, like `38.5733, -109.5498`, and pick the result. This works for spots that don't have a name.

## Good to Know

- Search covers places in the United States.
- Results near you, or near where the map is looking, come first.
- Search needs a connection. With no signal you'll see **No signal for place search. Try again with service.**
- Only the words you type and a rough area are sent to the search service, never who you are or your exact location.

## On the Website

The same searches work on onmylead.com. When you create a ride on the website, you can also click the map to drop the meeting point and drag the pin to fine-tune it. See [Create a Ride on the Website](/help/create-a-ride-on-the-website).

## Place Data

Places come from OpenStreetMap (map data © OpenStreetMap contributors), searched through Photon, a free service with no account.
