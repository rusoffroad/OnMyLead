---
title: Share a Family Link
summary: Send a read-only web link so family at home can see where you are, without the app or an account. It stops working when sharing ends.
category: safety-privacy
order: 20
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/app/share.tsx
  - app/src/app/f/[token].tsx
  - app/src/lib/api.ts
  - app/src/core/sharing.ts
  - supabase/migrations/20261007000000_init.sql
related: [location-sharing, privacy, emergency-and-safety]
keywords: [family, spouse, partner, home, check in, follow me, location link, web link, someone without the app]
---

A family link is a web link you can text to someone at home. They open it in any web browser, with no app and no account, and see your last known location and when sharing ends. It's free on every plan.

## Send a Family Link

1. Tap the **You** tab.
2. Under **On the Trail**, tap **Share My Location**.
3. Turn on **Family Link**.
4. Under **For How Long**, pick how long to share. If you pick **Until I Turn It Off (Max 24 Hours)**, tap **Share** to confirm.
5. Your iPhone's share sheet opens with a message like "Follow my location until 5:30 PM" and the link. Pick Messages, or any app, and send it.

You can pick riders under **Who Can See You** at the same time, or send just the family link.

## What They See

The link opens a simple page with:

- Your ride name.
- **Last update:** when your phone last sent its location.
- **Sharing ends:** when the link stops working.
- **Open in Maps:** opens your last location in Google Maps.

The page checks for a new location every 30 seconds. If your phone hasn't sent a location yet, it says **No location received yet.**

:::warning
The page shows your last update, not a guaranteed live position. With no service on the trail, **Last update** stays at the last time your phone got through. Tell your family what time you expect to be back, and what to do if they don't hear from you.
:::

## Stop or Extend the Link

The family link lasts exactly as long as the share it belongs to.

1. Tap the **You** tab, then **Share My Location**.
2. Find the card that says **Includes a family link**.
3. Tap **Add 1 Hour** to keep it going, or **Stop** to end it now.

Once the share ends, the link shows **No Longer Shared** and **This location link has ended.** Your location can't be seen from it again.

:::note
Anyone who has the link can see your location until the share ends, so only send it to people you trust.
:::
