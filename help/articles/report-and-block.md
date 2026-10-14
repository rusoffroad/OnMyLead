---
title: Report or Block a Rider
summary: Report a rider or a ride to the OnMyLead team, and block a rider to hide their chat messages. Nobody is told who reported or blocked them.
category: safety-privacy
order: 40
release: "1.0"
updated: 2026-10-14
sources:
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
related: [privacy, ride-chat, group-chat, emergency-and-safety, contact-support]
keywords: [report, block, unblock, harassment, spam, scam, fake account, unsafe, abuse, mute, tablet]
---

If a rider or a ride isn't right, report it to the OnMyLead team. If you'd rather not hear from a rider, block them. Neither one tells the other person it was you.

:::warning
If anyone is in danger, call 911 first.
:::

## Report a Rider

1. Open the ride and tap **Riders**.
2. In the **Going** list, tap the rider.
3. Tap **Report Rider**.
4. Under **What's Wrong**, pick **Harassment**, **Unsafe Riding**, **Spam or Scam**, **Fake Account** or **Something Else**.
5. Add details under **Anything Else (Optional)** if you like.
6. Tap **Send Report**.

You can also press and hold one of the rider's messages in ride chat or group chat, then tap **Report Rider**.

## Report a Ride

1. Open the ride's page.
2. Scroll to the bottom and tap **Report Ride**.
3. Under **What's Wrong**, pick **Unsafe Plan**, **Spam or Scam**, **Offensive Content** or **Something Else**.
4. Add details if you like, then tap **Send Report**.

Reports go to the OnMyLead team, not to the rider or the organizer. OnMyLead looks at every report, and the person reported isn't told who sent it.

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

### What Blocking Doesn't Do

- Announcements and Ride Mode quick replies from them still show, because they carry the plan and safety of a ride you're both on.
- Their Need Help and EMERGENCY alerts always come through.
- It doesn't remove them from a ride or stop them seeing you on a ride you're both on. If you're worried about your safety on a ride, leave the ride or stop sharing your location. See [Share Your Location](/help/location-sharing).

## Unblock a Rider

1. Tap the **You** tab.
2. Under **Settings**, tap **Blocked Riders**.
3. Tap **Unblock** next to the rider.

You can also tap the rider in a ride's **Going** list and tap **Unblock Rider**.
