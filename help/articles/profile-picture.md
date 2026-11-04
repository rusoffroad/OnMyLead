---
title: Add a Profile Picture
summary: Take or choose a photo so riders know who's who. It shows next to your name in rider lists, chat, Messages, Friends and Out Riding.
category: account
order: 21
release: "1.0.3"
updated: 2026-11-04
sources:
  - app/src/components/avatar-editor.tsx
  - app/src/components/rider-photo.tsx
  - app/src/components/convoy.tsx
  - app/src/components/photo-viewer.tsx
  - app/src/lib/avatars.ts
  - app/src/core/avatar.ts
  - app/src/app/ride-name.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/app/admin/users/[id].tsx
  - app/app.json
  - supabase/migrations/20261102000000_profile_photos.sql
related: [ride-name-and-profile, privacy, report-and-block, friends, out-riding]
keywords: [profile picture, profile photo, avatar, picture, photo, selfie, change photo, remove photo, delete photo, camera, photo library, tablet]
---

Add a profile picture so the riders you meet know who's who. It shows in place of your initial wherever riders see you:

- the rider list on a ride page (who's going) and the riders in your riding groups
- ride chat and group chat
- **Messages** and your conversations
- **Friends** and **Out Riding**
- your name at the top of the **You** tab

Until you add one, riders see your initial, the same as before. Riders on the live ride map still show as colored dots, so the leader, tail gunner and anyone who stopped sharing stay easy to spot.

## Add or Change Your Picture

1. Go to the **You** tab and tap your name at the top.
2. Under **Profile Picture**, tap **Take Photo** to use the camera, or **Choose Photo** to pick one from your photo library.
3. Move and zoom the photo so your face (or your machine) sits in the square, then tap **Choose** (or the check mark).
4. The picture saves straight away and the screen says **Picture saved**.

To change it, do the same again: the button says **Choose New Photo**. Your old picture is replaced.

The first time, the app asks to use your camera or your photos. Only the photo you pick is uploaded. If you said no, turn access back on in your device's Settings app under OnMyLead.

:::tip
Every picture is cropped square and made smaller before it's uploaded, so it loads quickly even on one bar of signal.
:::

:::release 2.0
Pictures are kept under 200 KB, and anyone can tap a rider's picture to see it full size.
:::

## On the Website

On onmylead.com, tap your name on the **You** page, then **Choose Photo**. Your browser opens its file chooser; on a phone it also offers the camera. The picture is cropped to the middle square for you.

## Remove Your Picture

1. Go to the **You** tab and tap your name at the top.
2. Under **Profile Picture**, tap **Remove**, then **Remove** again to confirm.

Riders see your initial again.

## Who Can See It

Your picture follows the same rule as your ride name: riders who are signed in to OnMyLead see it next to your name. OnMyLead never shows it to people who aren't signed in, and its web address is a long random one that only signed-in riders are given. Like any photo, someone who has that address could still pass it on. It never shows where you are.

Your Apple, Google or Facebook photo is separate. It only shows if you turn on **Show My Google Profile** (or Apple or Facebook), and your uploaded picture comes first when you have both. See [Your Ride Name and Profile](/help/ride-name-and-profile).

## Keep It Friendly

Pictures that are offensive or break the rules can be removed by the OnMyLead team. You can upload a new one afterwards. If you see a picture that shouldn't be there, report the rider and pick **Inappropriate Photo**. See [Report or Block a Rider](/help/report-and-block).

When you delete your account, your picture is deleted with it.
