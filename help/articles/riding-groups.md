---
title: Create and Manage a Riding Group
summary: Save the people you ride with as a group, invite friends with a link, and invite the whole group to a ride in one tap.
category: groups
order: 10
release: "1.0"
updated: 2026-10-14
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
related: [group-chat, follow-leaders, invite-riders, free-vs-pro]
keywords: [crew, group, club, friends, group link, invite group, invite all, members, leave group, delete group]
---

A riding group is your regular crew, saved once. When you create a ride, you can invite everyone in the group in one tap instead of sending the invite to each rider. Each group also has its own [Group Chat](/help/group-chat).

Your groups live on the **Groups** tab, on the **Riding Groups** screen. It shows **Your Groups** (the ones you run) and **Groups You’re In** (the ones someone else runs).

:::note
This is a Pro feature. You need Pro to create a group and to add or remove riders. See [Free and Pro](/help/free-vs-pro). Joining a group with its link, the group chat, inviting a group to your rides and getting the group's ride invites are free for everyone.
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

When your friend opens the link, they see the group's name, who runs it and how many riders are in it. They don't see who the riders are until they join. They tap **Join Group**, or **Create a Free Account to Join** if they don't have an account yet.

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

Everyone in the group gets a notification and sees the ride under **Ride Invites** on their home screen. They can tap **Join Ride**, with no waiting for approval, or **No Thanks**. Riders who are already on the ride, waiting, or who said no thanks are left alone.

To get these invites, keep **Ride Invites** on in [Notification Settings](/help/notification-settings).

## Rename a Group

If you run the group, open it, tap the group's name, type the new name and tap **Save Name**.

## Remove a Rider, Leave or Delete a Group

- **Remove a rider:** if you run the group, tap **Remove** next to the rider. They stop getting the group's ride invites. You can add them back later.
- **Leave a group:** open the group and tap **Leave Group**. The group link brings you back if you change your mind.
- **Delete a group:** if you run the group, tap **Delete Group**. The group goes away for everyone in it. Rides you already invited it to stay as they are.

## Who Can See a Group

A group's name and who is in it are only visible to the rider who runs it and the riders in it. The group link only shows the name, who runs it and how many riders are in it.

If your Pro ends, your groups stay. Everyone in them can still chat, and you can still invite the group to your rides. Creating new groups and adding or removing riders needs Pro again.
