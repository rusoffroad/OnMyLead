---
title: Create and Manage a Riding Group
summary: Save the people you ride with as a group, invite friends with a link, and invite the whole group to a ride in one tap.
category: groups
order: 10
release: "1.0"
updated: 2026-11-05
sources:
  - app/src/app/(tabs)/groups.tsx
  - app/src/app/groups/new.tsx
  - app/src/app/groups/[id]/index.tsx
  - app/src/app/g/[code].tsx
  - app/src/components/group-invite.tsx
  - app/src/components/invite-card.tsx
  - app/src/core/groups.ts
  - app/src/lib/groups.ts
  - app/src/app/r/[code].tsx
  - supabase/migrations/20261017430000_riding_groups.sql
  - supabase/migrations/20261018000000_pro_entitlements.sql
  - app/src/components/out-riding-card.tsx
  - app/src/components/group-photo.tsx
  - app/src/components/group-photo-editor.tsx
  - app/src/components/home/group-card.tsx
  - app/src/lib/group-photos.ts
  - app/src/core/group-photo.ts
  - supabase/migrations/20261105080000_group_photos.sql
related: [group-chat, follow-leaders, invite-riders, free-vs-pro]
keywords: [crew, group, club, friends, group link, invite group, invite all, members, leave group, delete group, group photo, group picture, crew photo, tablet]
---

A riding group is your regular crew, saved once. When you create a ride, you can invite everyone in the group in one tap instead of sending the invite to each rider. Each group also has its own [Group Chat](/help/group-chat).

Your groups live on the **Groups** tab, on the **Riding Groups** screen. It shows **Your Groups** (the ones you run) and **Groups You’re In** (the ones someone else runs).

:::release 1.0.3
The top of the Groups tab also has **Out Riding**, to see who's out riding near you, **Messages**, your direct messages, and **Friends**. See [See Who's Out Riding Nearby](/help/out-riding) and [Add Friends](/help/friends).
:::

:::note
This is a Pro feature. You need Pro to create a group and to add or remove riders. See [Free and Pro](/help/free-vs-pro). Joining a group with its link, the group chat, inviting a group to your rides and getting the group's ride invites are free for everyone.

:::release 2.0
On the Free plan, the buttons that need Pro carry a small gold **Pro** tag, so you know before you tap. Tapping one shows what Pro includes. During your Pro Trial and on Pro there are no tags.
:::
:::

## Create a Group

1. Tap the **Groups** tab.
2. Tap **New Group**.
3. Type a **Group Name**, like Saturday Crew. Names can be up to 60 characters.
4. Under **Add Riders You’ve Ridden With**, tick the riders you want in the group.
5. Tap **Save Group**.

The list only shows people you have been on a ride with, the ones you ride with most at the top. If nobody shows up yet, save the group anyway and send friends the group link (see below).

A group holds up to 100 riders.

## Invite Friends With the Group Link

The group link is for friends who aren't on OnMyLead yet, or anyone you haven't ridden with. Anyone in the group can share it.

1. On the **Groups** tab, tap the group.
2. Scroll to **Invite by Link**.
3. Tap **Share Group Link**, or tap **Text**, **Email** or **Copy**.

When your friend opens the link, they see the group's name, who runs it and how many riders are in it. They don't see who the riders are until they join.

:::release 2.1
If the group has a group photo, the link shows it at the top too, so your friend can tell it's your crew.
:::

They tap **Join Group**, or **Create a Free Account to Join** if they don't have an account yet.

:::release 1.0.3
The card also shows the **Group Code**, the end of the group's link. The rider who runs the group can tap **Choose Your Own Code** to make it something like SATURDAY-CREW, or type one under **Group Code (Optional)** when creating the group. See [Choose Your Own Code](/help/custom-codes).
:::

:::tip
If a link got shared somewhere it shouldn't, the rider who runs the group can tap **Make a New Link**. The old link stops working, and everyone already in the group stays in.
:::

## Add More Riders

If you run the group:

1. Open the group.
2. Tap **Add Riders You’ve Ridden With**.
3. Tick the riders and tap **Add Riders**.

## Invite Your Group to a Ride

You can invite a group you're in to any upcoming ride you organize or co-organize. There are two ways.

From the group:

1. Open the group.
2. Tap **Invite to a Ride**.
3. Tap **Invite** next to the ride.

From the ride:

1. Open the ride and go to **Riders**.
2. Under **Invite a Group**, tap **Invite All** next to the group.

:::release 2.0
Or plan a new ride for the group: on Home, tap **Plan a Group Ride** on the **Your Group** card. The new ride has that group ticked under **Your Riding Groups**, so everyone is invited when you create it.
:::

Everyone in the group gets a notification and sees the ride under **Ride Invites** on their home screen. They can tap **Join Ride**, with no waiting for approval, or **No Thanks**. Riders who are already on the ride, waiting, or who said no thanks are left alone.

To get these invites, keep **Ride Invites** on in [Notification Settings](/help/notification-settings).

## Add a Group Photo

:::release 2.1
If you made the group, you can give it a photo, like the crew lined up by the trailhead. Everyone in the group sees it at the top of the group page, next to the group's name on the **Riding Groups** screen, on the **Your Group** card on Home and under **Invite a Group** on a ride. It also shows on the group link. Until you add one, the group shows its initials.

1. Open the group.
2. Scroll down to **Group Photo**, below the riders.
3. Tap **Take Photo** to use the camera, or **Choose Photo** to pick one from your photo library. On onmylead.com, **Choose Photo** opens your computer's or phone's file picker.
4. The photo saves straight away and the screen says **Group photo saved**.

The photo is wide (16:9). On an Android phone or tablet you frame it on the crop screen before it saves. On iPhone, iPad and the website the middle of the photo is used, so keep the crew near the center.

To change it, tap **Choose New Photo** (or **Take Photo**). To take it down, tap **Remove**, then **Remove** again. Tap the photo at the top of the group page to see it full size.

Only the rider who made the group can add, change or remove its photo. Anyone with the group link can see it, so keep it friendly: the OnMyLead team removes photos that break the rules.
:::

## Rename a Group

If you run the group, open it, tap the group's name, type the new name and tap **Save Name**.

## Remove a Rider, Leave or Delete a Group

- **Remove a rider:** if you run the group, tap **Remove** next to the rider. They stop getting the group's ride invites. You can add them back later.
- **Leave a group:** open the group and tap **Leave Group**. The group link brings you back if you change your mind.
- **Delete a group:** if you run the group, tap **Delete Group**. The group goes away for everyone in it. Rides you already invited it to stay as they are.

## Who Can See a Group

A group's name and who is in it are only visible to the rider who runs it and the riders in it. The group link only shows the name, who runs it and how many riders are in it.

:::release 2.1
The group link also shows the group photo, if the group has one.
:::

If your Pro ends, your groups stay. Everyone in them can still chat, and you can still invite the group to your rides. Creating new groups and adding or removing riders needs Pro again.
