---
title: Add Friends
summary: Add riders as friends so you see each other when you're out riding nearby and can message any time.
category: groups
order: 26
release: "1.0.3"
updated: 2026-11-03
sources:
  - app/src/app/friends.tsx
  - app/src/app/friend/[code].tsx
  - app/src/components/add-friend-button.tsx
  - app/src/components/ride-roster.tsx
  - app/src/components/out-riding-card.tsx
  - app/src/core/friends.ts
  - app/src/lib/friends.ts
  - supabase/migrations/20261101800000_friends.sql
  - app/src/components/share-code-editor.tsx
related: [out-riding, report-and-block, privacy, notification-settings, riding-groups]
keywords: [friends, add friend, friend request, friend link, friend code, buddy, riding buddy, who's riding, message a friend, dm, remove friend, tablet]
---

Add the riders you ride with as **friends**. Friends see each other in [Out Riding](/help/out-riding) when they're out near each other, and can message each other any time.

Being friends never shares where you are. In Out Riding, friends see your ride name and roughly how far away you are, in whole miles, the same as any rider you know.

## Open Friends

Go to the **Groups** tab and tap **Friends** near the top. The row shows how many friends you have, how many are out riding, and any friend requests waiting for you.

:::release 2.0
Tap a friend's picture to see it full size, or their name in **Social** to see their profile, rides, badges and posts. See [Like, Comment and Post in Social](/help/social).
:::

## Add a Friend

There's no search by name, so nobody can look you up. You can add a rider in any of these ways:

- **Riders you know**: on the Friends screen, **Riders You Know** lists riders you've been on a ride with or share a riding group with. Tap **Add**.
- **On a ride**: on the ride's page, tap a rider in the **Going** list, then **Add Friend**. You can also tap **Message** there.
- **In Out Riding**: tap **•••** next to a rider, then **Add Friend**.
- **In a conversation**: tap **•••** at the top, then **Add Friend**.
- **With your friend link**: anyone else, like a buddy you met at the trailhead, can add you with your friend link (below).

They get a notification and see your request at the top of their Friends screen. You're friends once they tap **Accept**. If they had already asked you, adding them makes you friends straight away.

## Share Your Friend Link

1. On the Friends screen, find **Your Friend Link**. It shows your friend code. Want one that's easy to say, like MOAB-RIDER? Tap **Choose Your Own Code**. See [Choose Your Own Code](/help/custom-codes).
2. Tap **Share Friend Link**, or **Text**, **Email** or **Copy**.
3. When your buddy opens the link (or types your code under **Got a Friend Code?** and taps **Look Up**), they see your name and tap **Add Friend**. They need to be signed in to OnMyLead.
4. Accept their request on your Friends screen.

To stop an old link working, tap **Make a New Link**. Your friends stay friends.

## Answer a Friend Request

Requests waiting for you are at the top of the Friends screen under **Friend Requests**. Tap **Accept** or **Decline**. Declining just removes the request; the other rider isn't told.

## See Friends Out Riding

On the Friends screen, friends who are out near you are listed first, in green, with roughly how far away they are, like **Out Riding, About 3 Miles**. You only see this while you're Out Riding yourself, and only for friends within 50 miles. Tap a friend, or the blue message button, to message them.

In Out Riding, friends show up when you've both switched it on with **Riders I Know** (or **Everyone Nearby**). They're listed first and marked **Friend**.

## Message a Friend

Tap the blue message button next to a friend. You can message a friend any time, Out Riding or not. See [See Who's Out Riding Nearby](/help/out-riding) for muting, reporting and deleting conversations.

## Cancel a Request or Remove a Friend

- Under **Requests You Sent**, tap **Cancel**.
- Next to a friend, tap **✕**, then **Remove**. They aren't told.

## Limits

To keep requests friendly, you can send up to 30 friend requests a day, and ask the same rider at most twice a week.

## Blocking

If you block a rider, you stop being friends and any request between you is removed. Neither of you can send a new one. See [Report or Block a Rider](/help/report-and-block).

## Notifications

Friend requests, and requests someone accepted, come as notifications. Tapping one opens **Friends**. Turn them off under **Friend Requests** in [Notification Settings](/help/notification-settings).

## On a Tablet

On a tablet in landscape, or a wide window, your friend link and **Got a Friend Code?** are on the left, and your requests, friends and riders you know are on the right.
