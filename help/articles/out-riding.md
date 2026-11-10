---
title: See Who's Out Riding Nearby
summary: Switch on Out Riding to see which riders are out near you right now, roughly how far away they are, and send them a message.
category: groups
order: 25
release: "1.0.3"
updated: 2026-11-05
sources:
  - app/src/app/out-riding.tsx
  - app/src/app/messages/index.tsx
  - app/src/app/messages/[id].tsx
  - app/src/components/out-riding-card.tsx
  - app/src/components/range-rings.tsx
  - app/src/core/out-riding.ts
  - app/src/lib/out-riding.ts
  - app/src/hooks/use-direct-chat.ts
  - supabase/migrations/20261101700000_out_riding.sql
related: [riding-groups, report-and-block, privacy, notification-settings, location-sharing]
keywords: [online, nearby, who's riding, friends nearby, out riding, park, weekend, direct message, dm, message a rider, inbox, messages, tablet]
---

Heading to a park for the weekend, or just out on the trail? Switch on **Out Riding** and OnMyLead shows you which other riders are out near you right now, like friends showing online in a game. You can message any of them.

Out Riding is off until you switch it on, and other riders never see where you are. They see your ride name and roughly how far away you are, in whole miles.

## Switch On Out Riding

:::until 3.0
1. Go to the **Groups** tab and tap **Out Riding** at the top.
:::
:::release 3.0
1. Go to **Riding Groups** (in **Social**) and tap **Out Riding** at the top.
:::
2. Under **Who Can See Me**, pick one:
   - **Riders I Know**: only your [friends](/help/friends), and riders you've been on a ride with or share a riding group with. This is the default.
   - **Everyone Nearby**: also any other OnMyLead rider who is Out Riding near you and picked **Everyone Nearby** too.
3. Under **Turn Off After**, pick **4 Hours**, **Today** or **This Weekend**.
4. If you like, type where you're riding under **Where You're Riding (Optional)**, like the park's name. Riders who can see you see it.
5. Tap **Go Out Riding**. Allow location if your phone asks.

The **Out Riding** card on the Groups tab turns green and shows who's out within 10 miles.

:::note
OnMyLead only uses your location while the app is open to work out your rough area, and it keeps an area of about a mile, never your exact spot. Out Riding doesn't share your live location. For that, see [Location Sharing](/help/location-sharing).
:::

## See Who's Out Near You

While you're Out Riding, the **Out Near You** list shows each rider with roughly how far away they are (like **Under a Mile** or **About 6 Miles**), where they said they're riding, and whether they're your friend or you've ridden with them. Friends are listed first.

- Tap **10 Mi**, **25 Mi** or **50 Mi** to look farther.
- If you picked **Everyone Nearby**, switch between **Riders I Know** and **Everyone Nearby** to see only your riders or everyone.
- The rings at the top show the same riders by distance. They never show which way anyone is. Riders you know are green.

You only see other riders while you're Out Riding yourself, and you only see riders outside your own riders while they can see you too.

## Message a Rider

1. In the list, tap the blue message button next to a rider (or tap their dot on the rings).
2. Type your message and tap send.

Only the two of you see the conversation. You can start one with a friend, a rider you see Out Riding near you, or a rider you've ridden with. Until they reply, you can send up to 3 messages.

Find all your conversations under **Messages** on the Groups tab or the Out Riding screen. In a conversation:

- **Mute** stops notifications for that conversation.
- **•••** opens **Add Friend**, **Report Rider**, **Block Rider** and **Delete Conversation**. Deleting removes it from your Messages only; the other rider keeps their copy.
- Long press one of their messages to report it. The message goes with your report.

:::tip
Meeting up with someone new? Meet at a trailhead or staging area.
:::

## Add a Rider as a Friend

In the list, tap **•••** next to a rider, then **Add Friend**. Once they accept, they see you whenever you're both Out Riding with **Riders I Know**, and you can message each other any time. See [Add Friends](/help/friends).

## Change or Turn It Off

1. Open **Out Riding** from the Groups tab.
2. Tap **Change** to switch who can see you or where you're riding, or **Turn Off** to stop.

Out Riding also turns itself off at the time you picked, or after 6 hours without opening OnMyLead. Opening the app while it's on updates your rough area.

## Blocking

If you block a rider, neither of you sees the other in Out Riding, their messages are hidden from you, and they can't message you. They aren't told. See [Report or Block a Rider](/help/report-and-block).

## On a Tablet

On a tablet in landscape, or a wide window, your Out Riding status is on the left and the rings and list are on the right. Conversations sit in a readable column in the middle of the screen.
