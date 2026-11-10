---
title: Find Places to Ride With Scout
summary: Scout shows off-road parks, OHV areas, trail systems, trailheads and motocross tracks near you, up to 1,000 miles away.
category: joining
order: 15
release: "2.1"
updated: 2026-11-10
sources:
  - app/src/components/scout/scout.tsx
  - app/src/components/scout/mile-slider.tsx
  - app/src/app/spot/[id].tsx
  - app/src/app/spot/suggest.tsx
  - app/src/app/(tabs)/find.tsx
  - app/src/core/spots.ts
  - app/src/lib/spots.ts
  - app/src/components/rides-map-chrome.tsx
  - supabase/migrations/20261104170000_riding_spots.sql
related: [find-a-ride, create-a-ride, directions, place-search]
keywords: [scout, discover, explore, places to ride, parks, offroad parks, off-road parks, ohv, orv, atv park, trails near me, trailheads, motocross, mx track, riding areas, distance, miles]
---

Scout finds places to ride near you: off-road parks, OHV areas, trail systems, trailheads and motocross tracks. It looks 250 miles around you to start, and you can change that from 10 to 1,000 miles.

## Open Scout

:::until 3.0
1. Tap the **Find** tab.
:::
:::release 3.0
1. Tap the **Rides** tab.
:::
2. Tap **Places to Ride** at the top. (**Rides** takes you back to public rides.)
3. Allow location if asked. If location is off, tap **Use My Location**, or search a town or park instead.

Places show on the map as teal signs, with a picture of the kind of place (a flag on a peak for an off-road park, a quad for an OHV area, a forked trail for a trail system, a signpost for a trailhead and a checkered flag for a motocross track), and in a list under it (beside it on a tablet or a wide screen), nearest first. Each place shows what kind it is, where it is, how far away it is and how many public rides are coming up there.

## Change How Far Scout Looks

Under **How Far to Look**, drag the slider, tap along it, or tap **-** and **+** to move one step: 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750 or 1,000 miles. The list and the circle on the map update when you let go. Scout remembers the distance on this device for next time.

## Look Somewhere Else

Planning a trip? Tap **Look Around a Town or Park**, type a place and pick it from the results. Scout shows **Places Near** that place. Tap **Back to Near Me** to look around you again.

## Show Only Some Kinds of Places

Under the slider, tap a kind, such as **Off-Road Parks** or **Trailheads**, to show only that kind. Tap more than one to see each of them. Tap a kind again to turn it off. Each chip shows how many places of that kind Scout found.

## Open a Place

Tap a place in the list, or tap its sign on the map and then **Open Place**. Its page shows:

- what kind of place it is, where it is and how far away it is;
- **Create a Ride Here**, which starts a public ride with the meeting point already on the place;
- its website, when we have one;
- **Directions** in your maps app (see [Directions](/help/directions));
- **Public Rides Here**: public rides meeting within 15 miles that you can join;
- a short description, when the source has one.

:::note
Place details come from the US Forest Service, the Bureau of Land Management and OpenStreetMap (© OpenStreetMap contributors), plus places riders suggested. Each page says where its details came from. Check the rules, hours, fees and which vehicles are allowed with the park or agency before you go.
:::

## Suggest a Place We're Missing

1. At the bottom of the Scout list, tap **Know a Place We're Missing?**
2. Enter the name and pick what kind of place it is.
3. Show us where it is: search for it, tap the map, or tap **I'm There Now** if you're standing at it.
4. Add the website and anything we should know if you like, then tap **Send Suggestion**.

You need to be signed in to suggest a place. We check every suggestion before it shows in Scout. Riders never see who suggested a place.

## On a Tablet or the Website

On an iPad, an Android tablet or a wide browser window, the slider, the filters and the list sit on the left and the map fills the rest of the screen. Tap **Full Map** to make the map fill the whole screen. On the website, Scout is at onmylead.com under **Find** once you sign in.
