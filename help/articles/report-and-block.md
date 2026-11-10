---
title: Report or Block a Rider
summary: Report a rider or a ride to the OnMyLead team, and block a rider to hide their chat messages. Nobody is told who reported or blocked them.
category: safety-privacy
order: 40
release: "1.0"
updated: 2026-11-10
sources:
  - app/src/app/e/[code].tsx
  - app/src/components/report-sheet.tsx
  - app/src/components/ride-roster.tsx
  - app/src/components/ride-chat.tsx
  - app/src/components/message-alerts.tsx
  - app/src/app/groups/[id]/chat.tsx
  - app/src/app/blocked.tsx
  - app/src/app/r/[code].tsx
  - app/src/core/blocks.ts
  - app/src/core/pro.ts
  - app/src/lib/blocks.ts
  - supabase/migrations/20261018200000_reports.sql
  - supabase/migrations/20261020000000_blocked_riders.sql
  - app/src/app/out-riding.tsx
  - app/src/app/messages/[id].tsx
  - supabase/migrations/20261101700000_out_riding.sql
  - app/src/app/report-rider.tsx
  - app/src/app/(tabs)/profile.tsx
  - app/src/core/moderation.ts
  - app/src/app/sign-in.tsx
  - supabase/migrations/20261102800000_abuse_reports.sql
related: [privacy, ride-chat, group-chat, emergency-and-safety, contact-support]
keywords: [report, block, unblock, harassment, threats, spam, scam, fake account, unsafe, abuse, mute, tablet, suspended, banned]
---

If a rider or a ride isn't right, report it to the OnMyLead team. If you'd rather not hear from a rider, block them. Neither one tells the other person it was you.

:::warning
If anyone is in danger, call 911 first.
:::

:::release 2.0
## Report a Rider From the You Tab

1. Tap the **You** tab.
2. Under **Help**, tap **Report a Rider**.
3. Tap the rider. The list shows riders you've messaged, added as friends, ridden with or share a group with, and riders you blocked. Type in **Search** to find one by name.
4. Pick what's wrong, add details if you like, and tap **Send Report**.

Riders you've never ridden with or messaged aren't listed, so nobody can look riders up by name.
:::

## Report a Rider

1. Open the ride and tap **Riders**.
2. In the **Going** list, tap the rider.
3. Tap **Report Rider**.
:::until 1.0.3
4. Under **What's Wrong**, pick **Harassment**, **Unsafe Riding**, **Spam or Scam**, **Fake Account** or **Something Else**.
:::
:::release 1.0.3
:::until 2.0
4. Under **What's Wrong**, pick **Harassment**, **Unsafe Riding**, **Spam or Scam**, **Fake Account**, **Inappropriate Photo** or **Something Else**.
:::
:::
:::release 2.0
4. Under **What's Wrong**, pick **Harassment**, **Threats**, **Unsafe Riding**, **Spam or Scam**, **Fake Account**, **Inappropriate Photo** or **Something Else**.
:::
5. Add details under **Anything Else (Optional)** if you like.
6. Tap **Send Report**.

:::release 1.0.3
To close the report without sending it, swipe it down or tap **Cancel**.
:::

You can also press and hold one of the rider's messages in ride chat or group chat, then tap **Report Rider**.

:::release 1.0.3
From a direct message, tap **•••** then **Report Rider**, or press and hold one of their messages. The message goes with your report. In Out Riding, tap **•••** next to a rider. See [See Who's Out Riding Nearby](/help/out-riding).
:::

:::release 2.0
## Report a Post or Comment

In Social, tap **⋯** on a post and tap **Report This Post**, or tap **Report** under a comment. Pick what's wrong, add details if you like, and tap **Send Report**. You can also report a rider from their profile. When three different riders report the same post or comment, it's hidden until the OnMyLead team looks at it. See [Like, Comment and Post in Social](/help/social).
:::

## Report a Ride

1. Open the ride's page.
2. Scroll to the bottom and tap **Report Ride**.
3. Under **What's Wrong**, pick **Unsafe Plan**, **Spam or Scam**, **Offensive Content** or **Something Else**.
4. Add details if you like, then tap **Send Report**.

Reports go to the OnMyLead team, not to the rider or the organizer. OnMyLead looks at every report, and the person reported isn't told who sent it.

:::release 2.0
## What Happens After You Report a Rider

- The OnMyLead team is emailed about every report straight away.
- Your messages with the rider are saved with the report: your direct messages, and what either of you wrote in the last 30 days in a group chat or ride chat you share. Only the OnMyLead team can read them, and only to look into your report. Deleting a message or leaving a group afterwards doesn't remove the copy.
- If the rider broke the rules, OnMyLead can suspend their account for 1, 7, 30 or 90 days, or ban it for good. They're signed out within the hour and can't sign in until the suspension ends.
- You aren't told what action was taken, and they aren't told who reported them.

If you see **This account is suspended** when you sign in, your account was suspended for breaking the rider rules. If you think it's a mistake, [contact us](/help/contact-support).
:::

:::release 2.0
## Report an Event

On an event's page, scroll down and tap **Report This Event** (you need to be signed in, and it isn't shown to the event's hosts). Pick what's wrong (**Spam or Scam**, **Fake Event**, **Offensive Content**, **Inappropriate Photo**, **Unsafe Plan** or **Something Else**), add a note if you like, and tap **Send Report**. It goes to the OnMyLead team as a report about the event's host, with the event attached. The host isn't told who sent it. The team can hide the event or take down a photo.
:::

## Block a Rider

Blocking hides a rider's chat from you.

1. Open the ride and tap **Riders**.
2. In the **Going** list, tap the rider.
3. Tap **Block Rider**.
4. Tap **Block** to confirm.

You can also block from:

- Ride chat or group chat: press and hold their message, then tap **Block Rider**.
- A report: tap **Block This Rider**, or **Also Block This Rider** after you send it.

### What Blocking Does

- You don't see their messages or polls in ride chat or group chat.
- You don't get chat notifications or pop-ups from them.
- They aren't told, and they can't see that you blocked them.

:::release 1.0.3
- Neither of you sees the other in Out Riding, their direct messages are hidden from you, and they can't message you.
- If you were friends, you aren't anymore, and any friend request between you is removed. Neither of you can send a new one.
:::

### What Blocking Doesn't Do

- Announcements and Ride Mode quick replies from them still show, because they carry the plan and safety of a ride you're both on.
- Their Need Help and EMERGENCY alerts always come through.
- It doesn't remove them from a ride or stop them seeing you on a ride you're both on. If you're worried about your safety on a ride, leave the ride or stop sharing your location. See [Share Your Location](/help/location-sharing).

## Unblock a Rider

1. Tap the **You** tab.
2. Under **Settings**, tap **Blocked Riders**.
3. Tap **Unblock** next to the rider.

You can also tap the rider in a ride's **Going** list and tap **Unblock Rider**.
