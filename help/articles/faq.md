---
title: Frequently Asked Questions
summary: Quick answers about free rides, the Pro Trial, privacy, editing rides, iPhone, iPad and Android, and the website.
category: troubleshooting
order: 20
release: "1.0"
updated: 2026-10-31
sources:
  - supabase/migrations/20261018000000_pro_entitlements.sql
  - app/src/core/pro.ts
  - app/src/components/pro-plan.tsx
  - app/src/components/pro-gate.tsx
  - app/src/lib/entitlements.ts
  - app/src/lib/purchases.web.ts
  - app/src/app/r/[code].tsx
  - app/src/lib/api.ts
  - app/src/app/(tabs)/find.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/app/ride-name.tsx
  - app/src/core/sharing.ts
  - app/src/core/waypoints.ts
  - app/app.json
related: [troubleshooting, free-vs-pro, privacy, location-sharing, contact-support]
keywords: [questions, faq, how many rides, cost, price, free, iphone, website, tablet]
---

## Is OnMyLead Free?

Yes. Free accounts create one ride each calendar month and can join as many rides as they like, and the safety features are always free. [OnMyLead Pro](/help/free-vs-pro) adds unlimited rides and more.

## I Deleted the Ride I Made This Month. Can I Make Another on Free?

No. A ride counts when it's created, so cancelling or deleting it doesn't give it back, and copying a ride or using **Ride Again** counts as a new ride. Your next free ride opens on the 1st of next month (UTC).

## Will I Be Charged When My Pro Trial Ends?

No. The [Pro Trial](/help/pro-trial) needs no payment and never turns into a paid subscription. Your account moves to Free, and your rides, routes, groups and maps stay.

## My Pro Trial Ended Mid-Month and I Can't Create a Ride. Why?

Rides you created during the trial count toward that month's one free ride.

## Can I Buy Pro or Use a Promo Code on the Website?

No. Subscribing, **Restore Purchases** and promo codes work only in the app on your phone or tablet. Pro bought in the app also works when you sign in on the website.

## Does Deleting My Account Cancel My Pro Subscription?

No. Apple bills Pro, so also cancel it in your Apple subscriptions so you aren't billed again. See [Manage Your Subscription](/help/manage-subscription).

If you bought Pro on Android, Google Play bills it: cancel it in Google Play too.

## Can I Change My Ride's Time or Meeting Point?

Not after it's created. Tap **Copy This Ride** to make a new ride with the same details and route, pick the new day, then cancel the old ride. See [Edit, Cancel or Delete a Ride](/help/edit-cancel-or-delete-a-ride).

## My Ride Still Says Live. How Do I End It?

Rides don't end on their own. The organizer taps **End Ride for Everyone** on the ride page. Ending a ride stops everyone's location sharing for that ride.

## Why Can't I See the Exact Meeting Spot?

Only riders who have joined see it. Before you join, you see the general area, within about a mile. See [Privacy](/help/privacy).

## Why Isn't My Ride Showing on Find?

Find lists only public rides that are upcoming or live. Private rides never appear there, and rides drop off a few hours after their meeting time. See [Find a Ride](/help/find-a-ride).

## Why Do Other Riders See Me as "Rider"?

You haven't picked a ride name yet. Tap **Pick Your Ride Name** on the Rides tab, or your name at the top of **You**. See [Your Ride Name and Profile](/help/ride-name-and-profile).

## Does "Until I Turn It Off" Sharing Ever End?

:::until 1.0.2
Yes. Personal shares stop by themselves after 24 hours. A ride share set to **Until I Leave the Ride** ends when the ride ends or you leave it. See [Share Your Location](/help/location-sharing).
:::

:::release 1.0.2
Only when you stop it. Sharing with chosen riders or a family link set to **Until I Turn It Off** has no time limit: tap the **You** tab, then **Share My Location**, then **Stop Sharing**. A ride share set to **Until I Turn It Off** also ends when the ride ends or you leave it. If you'd rather it end on its own, tap **Pick an End Date** instead. See [Share Your Location](/help/location-sharing).
:::

## Does Live Tracking Work With No Cell Service?

No. Positions only update when a phone has a connection. [Offline maps](/help/offline-maps) keep the map and route on your screen, and riders without service show where they were last seen.

## Can I Use OnMyLead on an iPad or Android Phone?

Yes. OnMyLead is in the App Store for iPhone and iPad, and on Google Play for Android phones and tablets. On a tablet the map fills the screen, see [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet). You can also plan a ride on the website at onmylead.com, see [Create a Ride on the Website](/help/create-a-ride-on-the-website).

 iPhone and Android riders can join the same ride, see each other on the map and chat together.

## How Many Waypoints Can I Add?

Each rider can add up to 100 waypoints to a ride. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
