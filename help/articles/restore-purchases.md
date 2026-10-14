---
title: Restore Purchases
summary: Bring your OnMyLead Pro subscription back after getting a new iPhone, reinstalling the app, or signing in again.
category: pro
order: 60
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/subscription.tsx
  - app/src/app/pro.tsx
  - app/src/lib/purchases.ts
  - app/src/core/purchases.ts
  - supabase/functions/appstore-verify/index.ts
related: [subscribe-to-pro, manage-subscription, promo-codes, sign-in]
keywords: [restore, restore purchase, new phone, reinstall, lost pro, pro missing, subscription not showing]
---

If you pay for OnMyLead Pro but your plan shows Free, for example on a new iPhone or after reinstalling the app, use **Restore Purchases**. It finds your Pro subscription with Apple and turns Pro back on.

## Restore Your Subscription

1. Sign in to your OnMyLead account.
2. On the **You** tab, under **Settings**, tap **Subscription**.
3. Tap **Restore Purchases**.
4. If Apple asks, sign in with the Apple Account you used to buy Pro.

When it works, the app says **Your Pro subscription is restored.** and your plan shows **Pro**.

You can also tap **Restore Purchases** at the bottom of the Pro screen.

## If It Says No Purchase Was Found

The app says **No OnMyLead Pro purchase found for this Apple ID.** when the Apple Account on this iPhone has no active OnMyLead Pro subscription. Check that:

- You're signed in to the same Apple Account you used to subscribe.
- The subscription is still active. Look in iPhone **Settings** > your name > **Subscriptions**.
- You have signal.

## One Subscription, One Account

An Apple subscription gives Pro to one OnMyLead account at a time. If you restore it while signed in to a different OnMyLead account, Pro moves to that account. Make sure you're signed in to the account you want Pro on before you tap **Restore Purchases**.

:::note
Restore Purchases works in the iPhone app only. Once Pro is on your account, it also works when you use OnMyLead on the website.
:::
