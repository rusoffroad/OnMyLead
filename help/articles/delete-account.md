---
title: Delete Your Account
summary: Permanently delete your OnMyLead account and its data from the You tab, and what to do about a Pro subscription first.
category: account
order: 80
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/(tabs)/profile.tsx
  - app/src/lib/api.ts
  - supabase/functions/delete-account/index.ts
  - supabase/migrations/20261007000000_init.sql
  - supabase/migrations/20261018000000_pro_entitlements.sql
related: [manage-subscription, sign-in, privacy, contact-support]
keywords: [delete account, remove account, close account, erase data, delete my data, cancel account]
---

You can delete your OnMyLead account yourself, right in the app. It happens straight away and can't be undone.

## Before You Delete

If you pay for OnMyLead Pro, cancel it with Apple too. Apple bills the subscription, so deleting your account doesn't stop it. See [Manage Your Subscription](/help/manage-subscription).

## Delete Your Account

1. Go to the **You** tab.
2. Scroll to the bottom and tap **Delete Account**.
3. Read the message, then tap **Delete Account** to confirm.

You're signed out and taken back to the start.

## What Gets Deleted

- Your account and profile.
- Rides you organize. They're removed for everyone on them.
- Your Garage, trips and riding groups.
- Your messages and location history.

This can't be undone. To ride with OnMyLead again later, you'd make a new account.

## If You See Deletion Requested

Sometimes the app shows **Deletion Requested** instead of signing you out. That means your request was sent and your account and its data will be deleted within 7 days. If you pay for Pro, cancel it in your Apple subscriptions so you aren't billed again.

## Need Help?

If the delete doesn't go through, [Contact Us](/help/contact-support) and pick **Account and Sign-In**.
