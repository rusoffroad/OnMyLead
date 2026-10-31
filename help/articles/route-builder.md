---
title: Draw a Route
summary: Tap the map to lay down your ride's route. It snaps to trails for you, and every rider sees it in Ride Mode.
category: routes-maps
order: 10
release: "1.0"
updated: 2026-10-31
sources:
  - app/src/app/ride/[id]/route.tsx
  - app/src/app/r/[code].tsx
  - app/src/app/ride/new.tsx
  - app/src/components/route-builder-map.tsx
  - app/src/components/route-builder-map.web.tsx
  - app/src/components/map-search.tsx
  - app/src/components/trail-map-overlay.tsx
  - app/src/hooks/use-route-draft.ts
  - app/src/hooks/use-remembered-toggle.ts
  - app/src/core/route.ts
  - app/src/core/route-legs.ts
  - app/src/core/trail-router.ts
  - app/src/core/osm-trails.ts
  - app/src/core/pro.ts
  - app/src/lib/api.ts
  - app/src/lib/trail-tiles.ts
  - app/src/lib/trail-tiles.web.ts
related: [import-gpx, waypoints-and-planned-stops, map-layers, create-a-ride, ride-mode, place-search]
keywords: [route builder, draw route, map a route, trail snapping, follow trails, straight line, undo, route miles, mapped ride, edit route]
---

A route is the line your group will follow. Once it's saved, every rider on the ride sees it on the ride page and in Ride Mode, with everyone placed along it. You draw it by tapping points on a satellite map, and OnMyLead follows the trails between your taps for you.

Drawing a route is free. Bringing one in from a GPX file is covered in [Import a GPX Route](/help/import-gpx).

## Who Can Draw the Route

The ride's organizer and any co-organizers can build or change the route, until the ride has ended or been cancelled. Everyone else on the ride sees the finished route but can't change it. See [Organizer Controls](/help/organizer-controls).

## Open the Route Builder

When you create a ride and pick **Mapped** under **The Route**, the route builder opens as soon as the ride is created.

To open it later:

1. Open the ride and tap the **Map** tab.
2. Tap **Build the Route**. If the ride already has a route, tap **Edit Route**. For a Freeride, tap **Map a Route Anyway**.

:::note
A Freeride that gets a saved route becomes a mapped ride.
:::

## Draw Your Route

The map opens at the ride's meeting point.

1. Tap the map where the ride starts. That's point 1, shown in green. To get there fast, tap **Search** at the top and type a trailhead, park or town.
2. Tap further along the trail. The route follows the trail between your two taps.
3. Keep tapping along the way. Each new point is numbered, and the last one is shown in white.
4. Watch the miles add up at the top of the panel at the bottom of the screen.
5. Tap **Save Route** when you're done.

After you save, you're taken back to the ride. Only riders on this ride can see the route.

### Follow Trails or Straight Line

Two choices in the panel decide how the next points are joined:

- **Follow Trails**: each tap lands on the nearest trail or road, and the line between taps runs along it. While it works this out you'll see a dashed straight line and **Finding the trail…**.
- **Straight Line**: draws straight from point to point. Use it for open ground, a wash or a park nobody has mapped.

You can switch between them as you go. Points you already placed keep the way they were drawn. The app remembers your choice for next time.

If no mapped trail joins two points, that part is drawn as a straight line and the app tells you so. Add a point on the trail, or zoom in and try again. Points very far apart are also joined with a straight line, so tap more often on long stretches.

:::tip
Trails come from OpenStreetMap, so snapping works best where riders have mapped the trails. Zooming in before you tap helps each point land on the trail you meant.
:::

### Fix Mistakes

- **Undo** takes back the last point.
- Drag any numbered point to move it. If the line next to it was following a trail, it snaps again.
- **Clear** removes every point. Nothing is saved until you tap **Save Route**.

To see more of the map, swipe the panel down or tap its handle. It folds down to the miles and an **Undo** button.

## Search for a Place

To jump the map to a trailhead, park, forest or town before you draw:

1. Tap **Search** at the top of the screen.
2. Type a name, an address or coordinates.
3. Tap a result. The map moves there and marks it.

Searching only moves the map. Nothing is added to your route. See [Search for a Place](/help/place-search).

## Check Who Can Ride a Trail

While drawing, a tap adds a point, so press and hold a trail line instead to see its name and which vehicles it's open to. You can also turn trail lines on or off and switch to a topo map with the layers button. See [Map Layers and Trails](/help/map-layers).

## Change or Remove a Route

1. Open the ride, tap the **Map** tab, and tap **Edit Route**.
2. Move, add or undo points, then tap **Save Route**.

To take the route off the ride, tap **Clear**, confirm, then tap **Remove Route**.

When you save a route, the ride's listed miles update to match it.

## On the Website

You can build the route at onmylead.com too, using the same steps:

- Click the map instead of tapping, and drag a point to move it.
- Press Ctrl+Z (Cmd+Z on a Mac) to undo the last point.
- Trail lines and their names appear once you zoom in close, and **Follow Trails** snaps to them the same way.
- On a wide screen, the tools panel sits beside the map.

On a tablet held sideways, the tools panel sits beside the map; swipe it up or tap **Hide** to fold it. Held upright, it floats in the bottom corner of the map.

The website's map has the same layers button: switch to **Topo**, turn trail lines on or off, and see trail names and closed trails in red. A click adds a point while you draw, so to see a trail's card, click its line on a route you aren't editing (an imported GPX route). See [Map Layers and Trails](/help/map-layers). A route you save on the website is in the app as soon as you save it.

## No Signal

Once you've opened a ride with a route, the route is saved on your phone, so it's still there without signal. With no signal, **Follow Trails** can only use trail data already saved on your phone, so in other places it draws straight lines. Saving a route needs a connection.

## Map Data

Trail lines and snapping use map data © OpenStreetMap contributors, © OpenMapTiles, served by OpenFreeMap. Snapping is worked out on your phone or in your browser. Your taps aren't sent to a routing service.
