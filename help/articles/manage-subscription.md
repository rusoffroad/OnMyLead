---
title: Manage or Cancel Your Subscription
summary: Change between monthly and annual or cancel OnMyLead Pro in your Apple Account settings, and see what happens when Pro ends.
category: pro
order: 40
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/subscription.tsx
  - app/src/app/pro.tsx
  - app/src/components/pro-plan.tsx
  - app/src/lib/purchases.ts
  - app/src/core/entitlements.ts
  - app/src/core/pro.ts
  - app/src/app/(tabs)/profile.tsx
  - supabase/migrations/20261018000000_pro_entitlements.sql
  - store/app-store/listing.md
  - supabase/migrations/20261027000000_play_billing.sql
  - app/src/core/purchases.ts
related: [subscribe-to-pro, free-vs-pro, restore-purchases, delete-account]
keywords: [cancel, cancel subscription, change plan, switch to annual, downgrade, renew, renewal, refund, stop paying]
---

OnMyLead Pro is billed by Apple, so you change or cancel it in your Apple Account settings. The app takes you straight there.

## Cancel or Change Your Plan in the App

1. On the **You** tab, under **Settings**, tap **Subscription**.
2. Tap **Manage Subscription**.
3. Apple's subscription screen opens. Choose a different plan, or cancel your subscription.

If you pay for Pro, the Pro screen also has a **Manage Subscription** button where the plans usually are.

:::release android
## Cancel or Change It on Android

On Android, Pro is billed by Google Play. **Manage Subscription** opens Google Play's subscription page for OnMyLead, where you can change plans or cancel. You can also do it in the **Play Store** app: tap your profile picture, then **Payments & Subscriptions** > **Subscriptions** > **OnMyLead**.

If you bought Pro on a different kind of device (on an iPhone while you're on Android, or the other way round), **Manage Subscription** tells you which store bills it and opens that store's subscription page. Cancel it there.
:::

## Cancel or Change It in iPhone Settings

1. Open the **Settings** app on your iPhone.
2. Tap your name at the top.
3. Tap **Subscriptions**.
4. Tap **OnMyLead**, then choose a plan or cancel.

:::warning
To avoid being charged for the next period, cancel at least 24 hours before your current period ends. The subscription renews automatically until you turn it off.
:::

## Check When It Renews

On the **Subscription** screen, **Your Plan** shows **Pro** and the date it renews or ends.

## What Happens When Pro Ends

When a subscription you cancelled reaches the end of the period you paid for, your account moves to Free. Nothing is deleted:

- **Rides:** every ride you created stays. Free accounts create one new ride a month.
- **Routes:** routes you already imported from GPX stay and stay editable. Importing a new GPX file needs Pro.
- **Offline maps:** maps already on your phone keep working. Downloading new map areas needs Pro.
- **Riding groups:** your groups stay, with their chats, and you can still invite them to your rides. Creating a group or adding and removing riders needs Pro.
- **Polls:** polls already sent can still be voted on. Creating a new poll needs Pro.
- **Ride history:** Home shows your last 5 past rides. The rest are saved, and show again if you upgrade.
- **Trips:** your trips stay. Free plans one active trip at a time.

See [Free and Pro](/help/free-vs-pro) for the full comparison.

## Good to Know

- Deleting your OnMyLead account does not cancel the Apple subscription. Cancel it in your Apple subscriptions too, so you aren't billed again. See [Delete Your Account](/help/delete-account).
- If your plan says **Complimentary Pro**, it was given to you by OnMyLead and isn't billed by Apple, so there's nothing to cancel.

:::release android
- Deleting your OnMyLead account doesn't cancel a Google Play subscription either. Cancel it in Google Play too.
- On Android, **Your Plan** also says which store bills your Pro.
:::
- Subscriptions can only be managed on iPhone. On the website, the Subscription screen says so.
