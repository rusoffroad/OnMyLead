---
title: Frequently Asked Questions
summary: Quick answers about free rides, the Pro Trial, privacy, editing rides, iPhone, iPad and Android, updates, and the website.
category: troubleshooting
order: 20
release: "1.0"
updated: 2026-11-05
sources:
  - app/src/app/ride/[id]/edit.tsx
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
  - app/src/core/app-versions.ts
  - app/src/components/update-required.tsx
  - app/src/components/app-notices.tsx
  - app/src/lib/app-update.ts
  - app/src/core/nearby.ts
related: [troubleshooting, free-vs-pro, privacy, location-sharing, contact-support]
keywords: [no service, bluetooth, questions, faq, release notes, what's new, update, update required, update available, version, how many rides, cost, price, free, iphone, website, tablet]
---

## Is OnMyLead Free?

Yes. Free accounts create one ride each calendar month and can join as many rides as they like, and the safety features are always free. [OnMyLead Pro](/help/free-vs-pro) adds unlimited rides and more.

:::release 2.0
From version 2.0, Free also includes 8 hours of Map Mode a month, and joining a ride and following the leader stay free and unlimited on every device. Using OnMyLead on an iPad, an Android tablet or the website, and extras like map layers, drawing routes, waypoints and directions, are part of Pro.
:::

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

:::until 2.1
Not after it's created. Tap **Copy This Ride** to make a new ride with the same details and route, pick the new day, then cancel the old ride. See [Edit, Cancel or Delete a Ride](/help/edit-cancel-or-delete-a-ride).
:::
:::release 2.1
Yes, until the ride goes live. On the ride page, tap **Edit Ride Details** in the **You're Organizing** card, change the day, time or meeting point and save. Everyone on the ride gets a notification, and the ride page shows what changed. See [Edit, Cancel or Delete a Ride](/help/edit-cancel-or-delete-a-ride).
:::

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

:::until 2.1
No. Positions only update when a phone has a connection. [Offline maps](/help/offline-maps) keep the map and route on your screen, and riders without service show where they were last seen.
:::

:::release 2.1
Yes, for riders close to you. With no service, OnMyLead phones on the same ride pass spots, status taps, EMERGENCY and Ride Mode messages to each other over Bluetooth, about 100 to 300 feet between phones in the open, and each phone passes them along the group, up to six phones down the line. Riders out of Bluetooth range show where they were last seen, and the first phone to get signal sends everything it heard to OnMyLead. It's on by default. See [Share With Nearby Riders With No Service](/help/bluetooth-sharing), and download the ride's [offline map](/help/offline-maps) before you go.
:::

:::release 2.0
## Why Does the App Ask Me to Agree to a Safety Agreement?

Riding is risky, and OnMyLead can't keep you safe on its own. Before you use the app, you agree that you ride at your own risk, won't use your phone while moving, and only ride where it's allowed. You're asked once, and again only if the agreement changes. See [The Rider Safety and Liability Agreement](/help/rider-safety-agreement).
:::

## Can I Use OnMyLead on an iPad or Android Phone?

Yes. OnMyLead is in the App Store for iPhone and iPad, and on Google Play for Android phones and tablets. On a tablet the map fills the screen, see [Use OnMyLead on a Tablet](/help/use-onmylead-on-a-tablet). You can also plan a ride on the website at onmylead.com, see [Create a Ride on the Website](/help/create-a-ride-on-the-website).

 iPhone and Android riders can join the same ride, see each other on the map and chat together.

:::release 2.1
## Does OnMyLead Work With CarPlay?

Yes, on iPhone. Open Ride Mode on your phone, connect to your car and tap **OnMyLead** on the car screen. See [Use OnMyLead on CarPlay](/help/carplay). OnMyLead doesn't support Android Auto.
:::

## How Do I See What Changed in an Update?

Every version's changes are listed in the [Release Notes](/help/release-notes), newest first, with when it reached the App Store and Google Play. To get the latest version, update OnMyLead from the App Store or Google Play.

:::release 1.0.3
## The App Says "Please Update OnMyLead". What Do I Do?

We show this when your version has a problem that's fixed in a newer one. Tap **Update Now** to open the App Store (iPhone and iPad) or Google Play (Android), then update OnMyLead. Your rides, groups and settings stay as they are.

On a ride with no signal? Tap **Not Now**. Ride Mode, Help and SOS and everything else keep working, and the app asks again the next time you open it.

You might also see:

- **Update Available** at the top of the home screen when a newer version is out. Tap **Update**, or close the card with the X.
- **About This Version**, an amber card at the top of the home screen, when we know about a problem in your version. It says what's wrong and what to do until the fix arrives.
:::

:::release 2.0
## How Do I Know When There's a New Version?

OnMyLead checks the App Store (iPhone and iPad) or Google Play (Android) for you. When a newer version is out, an **Update Available** card shows at the top of the home screen. Tap **Update** to go straight to OnMyLead in the store, or close the card with the X and it won't show again for that version. The check needs a signal and runs at most twice a day, so the card can take a few hours to appear after an update comes out.
:::

## How Many Waypoints Can I Add?

Each rider can add up to 100 waypoints to a ride. See [Waypoints and Planned Stops](/help/waypoints-and-planned-stops).
