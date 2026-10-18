---
title: Create a Ride on the Website
summary: Plan a ride on onmylead.com from your computer, drop the meeting point on a map, and find it in the app on your phone as soon as you save.
category: rides
order: 20
release: web
updated: 2026-10-18
sources:
  - app/src/app/ride/new.tsx
  - app/src/components/meet-point-map.web.tsx
  - app/src/components/showcase.web.tsx
  - app/src/app/sign-in.tsx
  - app/src/components/route-builder-map.web.tsx
  - app/src/components/get-the-app.web.tsx
  - app/src/components/ride-date-picker.tsx
related: [create-a-ride, route-builder, waypoints-and-planned-stops, invite-riders, sign-in]
keywords: [website, web, computer, desktop, laptop, browser, onmylead.com, plan on the web, big screen, tablet]
screenshots:
  - file: web-route.webp
    shows: app/src/components/route-builder-map.web.tsx
---

You can plan a ride on the big screen at onmylead.com. It's the same ride as one made in the app: the ride, its route and its stops show up in the OnMyLead app on your phone or tablet as soon as you save. Ride Mode and live tracking stay in the app.

![Drawing a route on onmylead.com](/help/img/web-route.webp)

## Create a Ride on the Web

1. Go to onmylead.com and click **Create a Ride on the Web**.
2. Sign in with your OnMyLead account if you aren't already. You go straight to Create a Ride after signing in.
3. Pick **Public** or **Private** under **What Kind of Ride?**
4. Fill in the **Ride Name**, the day under **When**, and the **Meet At** time. Click **Calendar** to pick any day from today up to a year out.
5. Set the **Meeting Point**: type a park, trailhead, town or address in **Search a Place or Address** (just above the map) and pick it, or click the satellite map to drop the pin, then drag the pin to fine-tune it. You can also use your location or type coordinates, and the pin moves there.
6. Under **The Route**, pick **Mapped** or **Freeride**.
7. Fill in anything else you want, then click **Create Public Ride** or **Create Private Ride**.

The rest of the form works the same as in the app. See [Create a Ride](/help/create-a-ride) for every option.

## Draw the Route on the Web

If you picked **Mapped**, the route builder opens after you create the ride. Click along the trail and the route follows it. Drawing a route is free. Importing a GPX file is a Pro feature. See [Build a Route](/help/route-builder) and [Free and Pro](/help/free-vs-pro).

To find a trailhead or park by name while you draw, click **Search** at the top of the map and pick a result. The map jumps there.

You can also add numbered planned stops for fuel, lunch or camp. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).

:::release 1.0.1
The waypoints map has the same **Search**, so you can jump to a place before you click to drop a stop.
:::

## Share It

After saving, your ride page shows the invite code, a QR code and share buttons, the same as in the app. See [Invite Riders](/help/invite-riders).

:::note
Free accounts create one ride each month, whether on the website or in the app. See [Free and Pro](/help/free-vs-pro).
:::

:::tip
When someone opens a ride link on a computer, the page shows the ride's QR code. They can scan it with their phone's camera to open the ride on their phone.
:::

:::note
Stuck while planning? Click **Help** at the top of onmylead.com to open these guides.
:::
