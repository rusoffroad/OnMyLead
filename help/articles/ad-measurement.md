---
title: Ad Measurement and Tracking
summary: If you allow it, Meta, Google and TikTok learn when one of our ads brought you to OnMyLead. Never your location, rides or messages. How to say yes or no on each device.
category: safety-privacy
order: 35
release: "3.0"
updated: 2026-11-10
sources:
  - app/src/core/ad-tracking.ts
  - app/src/lib/ad-tracking.ts
  - app/src/lib/ad-tracking.web.ts
  - app/src/components/ad-consent-notice.web.tsx
  - supabase/functions/ad-conversions/index.ts
  - supabase/functions/_shared/ad-conversions.ts
  - app/src/app/privacy.tsx
related: [privacy, getting-started, delete-account]
keywords: [tracking, ads, advertising, ATT, ask app not to track, cookies, meta, facebook, instagram, google, tiktok, advertising id, opt out]
---

OnMyLead advertises on Facebook, Instagram, Google and TikTok. To learn which ads actually bring new riders, OnMyLead can tell those companies when one of their ads led to an install, a new account, a Pro trial or a Pro purchase. It only does this if you say yes, and saying no changes nothing else in the app.

## What Is Sent

- That an install, a new account, a trial start or a Pro purchase happened, and the price for a purchase.
- An identifier the ad company can match to the ad you saw: your device's advertising ID in the app, or their cookie on the website.
- The IP address and app or browser version of the device that sent it.

Never your location, routes, rides, groups, messages, photos, ride name or email address.

## iPhone and iPad

After you sign in, OnMyLead asks once with Apple's prompt: **Allow "OnMyLead" to track your activity across other companies' apps and websites?**

- **Allow:** Meta and TikTok learn when one of our ads brought you here.
- **Ask App Not to Track:** nothing is sent, ever.

To change it later, go to **Settings > Privacy & Security > Tracking** on your iPhone or iPad, or tap **You > Settings > Ad Measurement** in OnMyLead, which opens it for you. The prompt never shows on a map or during a ride.

## Android Phones and Tablets

Ad Measurement is on unless you turn it off. Go to **You > Settings > Ad Measurement** and flip the switch. When it's off, nothing is sent to ad networks. Deleting your advertising ID in Android's settings (**Settings > Privacy > Ads**) also stops it.

## onmylead.com

On your first visit the website shows a cookie notice at the bottom. Nothing from Meta, Google or TikTok loads until you tap **Allow**. Tap **Decline** and none of it loads. To change your choice later, open the [Privacy Policy](/privacy) and use **Ad Cookies on This Website** at the bottom. If your browser sends Global Privacy Control or Do Not Track, the website treats that as Decline and doesn't ask.

## Good to Know

- Google is only told about visits to the website. In the app, only Meta and TikTok are told.
- OnMyLead never shows you ads inside the app and never sells your data.
- Full details are in the [Privacy Policy](/privacy).
