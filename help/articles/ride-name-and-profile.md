---
title: Your Ride Name and Profile
summary: Pick the ride name other riders see on the map, the rider list and in chat, and choose whether to show your Apple, Google or Facebook profile.
category: account
order: 20
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/app/ride-name.tsx
  - app/src/core/profile.ts
  - app/src/app/(tabs)/profile.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/core/social-profile.ts
  - app/src/lib/social-profile.ts
  - app/src/components/social-tag.tsx
  - app/src/components/ride-roster.tsx
  - app/src/app/groups/[id]/index.tsx
  - supabase/migrations/20261013500000_rider_names.sql
  - supabase/migrations/20261022000000_social_profiles.sql
related: [sign-in, getting-started, privacy, report-and-block]
keywords: [nickname, display name, username, change name, profile photo, social profile, google profile, facebook profile, apple profile, tablet]
---

Your ride name is how the group knows you. It shows on the group map, the rider list and in ride chat. A nickname works fine.

## Pick or Change Your Ride Name

1. Go to the **You** tab and tap your name at the top. If you haven't picked one yet, it says **Pick Your Ride Name**. You can also tap **Pick Your Ride Name** on the **Rides** tab.
2. Type your name in **Ride Name**.
3. Check the preview at the top. It shows your pin on the map and a chat line, the way the group sees you.
4. Tap **Save Name**. The button changes to **Name Saved**.

Until you pick a name, other riders see you as Rider.

:::tip
Keep it to 24 characters or fewer so it fits on the map. Extra spaces are tidied up when you save.
:::

## Where Your Name Comes From at First

If you created your account with your name, or signed in with Apple, Google or Facebook, your ride name may already be filled in from that. You can change it any time.

## Show Your Apple, Google or Facebook Profile

If you signed in with Apple, Google or Facebook, you can let the riders you ride with see that account's name and photo. It helps people recognize who joined.

1. Go to the **You** tab.
2. Under **Account**, find **Show My Google Profile** (or **Show My Apple Profile** or **Show My Facebook Profile**, depending on how you signed in).
3. Turn the switch on.

When it's on, your photo replaces your initial, and a line like "Your Name on Google" shows under your ride name in a ride's rider list and in your riding groups.

When it's off, nobody else sees it. It's off until you turn it on.

### Who Can See It

- Only riders who have been on a ride with you or share a riding group with you.
- Never strangers browsing public rides.
- Never someone you've blocked, or who has blocked you.

The name and photo come from the account you signed in with, and the app keeps them up to date each time you open the **You** tab. You can only turn the setting on or off.

If you signed in with email only, this setting doesn't appear.

## Your Email

Under **Account** on the **You** tab, **Email** shows the email on your account. Only you see it.
