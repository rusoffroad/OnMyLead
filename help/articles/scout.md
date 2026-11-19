---
title: Find Places to Ride With Scout
summary: Scout shows off-road parks, OHV areas, trail systems, trailheads and motocross tracks near you, up to 1,000 miles away.
category: joining
order: 15
release: "2.1"
updated: 2026-11-19
sources:
  - app/src/core/activities.ts
  - app/src/components/scout/scout.tsx
  - app/src/components/scout/mile-slider.tsx
  - app/src/app/spot/[id].tsx
  - app/src/app/spot/suggest.tsx
  - app/src/app/(tabs)/find.tsx
  - app/src/core/spots.ts
  - app/src/lib/spots.ts
  - app/src/components/rides-map-chrome.tsx
  - supabase/migrations/20261104170000_riding_spots.sql
  - supabase/migrations/20261119100000_places_to_ride.sql
  - app/src/app/places.tsx
  - app/src/components/scout/place-parts.tsx
  - app/src/components/home/places-card.tsx
  - app/src/components/spot-pin.tsx
  - app/src/components/spot-pin-art.ts
related: [find-a-ride, create-a-ride, directions, place-search, navigation-mode, home-screen]
keywords: [favorite places, favorites, saved places, reviews, rider reviews, park phone number, park hours, park address, open in map mode, scout, discover, explore, places to ride, parks, offroad parks, off-road parks, ohv, orv, atv park, trails near me, trailheads, motocross, mx track, riding areas, distance, miles]
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

:::release 4.0
You can also tap the **Places to Ride** card on Home, under **Create a Ride** and **Events and Group Rides**. It opens the same search on its own page. It says **New** until you open it the first time.
:::

:::until 4.0
Places show on the map as teal signs, with a picture of the kind of place (a flag on a peak for an off-road park, a quad for an OHV area, a forked trail for a trail system, a signpost for a trailhead and a checkered flag for a motocross track), and in a list under it (beside it on a tablet or a wide screen), nearest first.
:::
:::release 4.0
Places show on the map as pins, coloured by the kind of place with a white picture of what you ride there: red with a 4x4 for an off-road park, blue with an ATV for an OHV area, green with a pine tree for a trail system, green with a trail sign for a trailhead and gold with a dirt bike for a motocross track. They're also in a list under the map (beside it on a tablet or a wide screen), nearest first.

Places to Ride looks for the kind of place your [activity](/help/activities) rides: ice blue with a snowflake for a snowmobile area, orange with a winding road for a scenic drive, and brown with a tent for a campground. Snowmobile shows snowmobile areas; Motorcycle shows scenic drives, campgrounds and motocross tracks; Road Trip shows scenic drives and campgrounds. Offroad shows the same places as before. **Suggest a Place** offers the kinds for your activity.
:::
 Each place shows what kind it is, where it is, how far away it is and how many public rides are coming up there.

## Change How Far Scout Looks

Under **How Far to Look**, drag the slider, tap along it, or tap **-** and **+** to move one step: 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750 or 1,000 miles. The list and the circle on the map update when you let go. Scout remembers the distance on this device for next time.

## Look Somewhere Else

Planning a trip? Tap **Look Around a Town or Park**, type a place and pick it from the results. Scout shows **Places Near** that place. Tap **Back to Near Me** to look around you again.

## Show Only Some Kinds of Places

Under the slider, tap a kind, such as **Off-Road Parks** or **Trailheads**, to show only that kind. Tap more than one to see each of them. Tap a kind again to turn it off. Each chip shows how many places of that kind Scout found.

:::release 4.0
## Favorite Places

Save the places you like so they're easy to find again:

1. Open a place and tap **Save** (the heart) next to its name. It changes to **Saved**. Tap it again to take it off.
2. To see them all, tap **Favorites** at the start of the chips in Places to Ride. Your favorites show on the map and in the list, newest saved first, however far away they are. Tap **Favorites** again to go back to places near you.

You need to be signed in to save favorites. They're saved to your account, so they're the same on your phone, tablet and onmylead.com.
:::

## Open a Place

:::until 4.0
Tap a place in the list, or tap its sign on the map and then **Open Place**. Its page shows:

- what kind of place it is, where it is and how far away it is;
- **Create a Ride Here**, which starts a public ride with the meeting point already on the place;
- its website, when we have one;
- **Directions** in your maps app (see [Directions](/help/directions));
- **Public Rides Here**: public rides meeting within 15 miles that you can join;
- a short description, when the source has one.
:::

:::release 4.0
Tap a place in the list, or tap its pin on the map and then **Open Place**. Its page is the place's profile:

- what kind of place it is, where it is, how far away it is, and **Save** to add it to your Favorite Places;
- **Directions** in your maps app (see [Directions](/help/directions)), **Call** when we have the park's phone number, **Website** when it has one, and **Share** to send the place's link;
- **Create a Ride Here**, which starts a public ride with the meeting point already on the place;
- **Open in Map Mode**, which opens Map Mode centred on the place so you can look at the trails and terrain around it (see [Navigate Offroad and Map Your Own Trails](/help/navigation-mode));
- **Trails**, for off-road parks whose trails we draw: miles of mapped trails, how many trails, how many are closed now and how many at each level (the park's own ratings);
- the park's **Address**, **Phone**, **Hours**, **Fees**, **Season** and **Website**, when we have them (tap the address for directions or the phone number to call);
- **Rider Reviews** from OnMyLead riders (see below), and **Reviews on Google**, which opens the place on Google Maps;
- **Public Rides Here**: public rides meeting within 15 miles that you can join;
- **About**: a short description, when we have one.

Under it, the page says where the details came from and when they were last checked. Spot something wrong? Tap **Suggest an Edit** to tell us.

## Rider Reviews

Ridden there? Tell other riders how it was:

1. On the place's page, tap **Write a Review** (you need to be signed in).
2. Tap the stars (1 to 5).
3. Add a few words if you like: the trails, how hard they are, crowds, the staff, what to bring.
4. Under **Photos**, tap **+** to add up to 4 photos.
5. Tap **Save Review**.

You can write one review for each place. Tap **Edit Your Review** to change it, or **Delete Review** to remove it and its photos. Everyone can see your review, your ride name and your photos. Reviews that break the rider rules are hidden; you'll see a note on yours if that happens. You can't see reviews from riders you've blocked.
:::

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

:::release 4.0
Places to Ride shows the places for your activity. A place can be listed for more than one, like a forest with OHV trails in summer and snowmobile trails in winter. See [Switch Activities](/help/activities).
:::
