---
title: Use Ride Chat
summary: Message everyone on the ride or just the leader, post announcements, and clear or resolve your own messages.
category: ride-mode
order: 40
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/components/ride-chat.tsx
  - app/src/components/message-alerts.tsx
  - app/src/hooks/use-ride-chat.ts
  - app/src/core/chat.ts
  - app/src/app/r/[code].tsx
  - app/src/app/ride/[id]/live.tsx
  - supabase/migrations/20261010000000_chat_summary_fuel.sql
  - supabase/migrations/20261012000000_chat_leader_push.sql
  - supabase/migrations/20261018600000_message_clear_resolve.sql
related: [ride-polls, status-buttons, notification-settings, report-and-block, organizer-controls]
keywords: [chat, message, messages, leader only, announcement, pinned, clear message, delete message, resolved, pop-up, notifications, tablet]
screenshots:
  - file: chat.webp
    shows: app/src/components/ride-chat.tsx
---

Every ride has its own chat for the riders on it. Use it to plan before the ride and check in after. Only riders who have joined the ride can read or post in it.

![Ride chat with polls](/help/img/chat.webp)

:::warning
Don't type while driving or riding. In Ride Mode, use the one-tap quick replies instead. See [Send a Status or Quick Reply](/help/status-buttons).
:::

## Open Ride Chat

1. Open the ride from the **Rides** tab.
2. Tap **Chat** in the row of sections under the ride's name.

Tap **Ride Chat** at the top of the card to hide or show the messages. Hidden, it shows the message count and the latest message. The chat shows the newest 30 messages. To see older ones, tap the button above them, such as **Show 12 Earlier**.

## Send a Message

1. Under **Send To**, pick who it's for:
   - **Everyone:** every rider on the ride.
   - **Leader Only:** only you and the ride's leader see it. The leader's name is shown on the option.
2. Type in the **Message** box.
3. Tap **Send to Everyone** or **Send to Leader**.

Your message shows in the chat straight away as **Sending…**, then **Sent**. If it doesn't go through, it stays as **Not Sent** with **Retry** and **Remove**.

Messages can be up to 500 characters. If you send more than 10 messages in a minute, you're asked to wait a minute.

:::note
The ride's leader is every rider with the Leader role. If nobody has been given that role, the organizer leads. Leader-only messages are kept private by the server, not just hidden in the app. If you're the leader, you won't see the **Leader Only** option.
:::

## Post an Announcement

Organizers and co-organizers can post an announcement for the whole group.

1. Under **Send To**, pick **Announcement (Pinned, Read Aloud)**.
2. Type in the **Announcement** box.
3. Tap **Post Announcement**.

The newest announcement is pinned near the top of the ride page. In Ride Mode it shows as a yellow banner and is read aloud, so riders don't have to look at their phones. Tap the banner to hear it again.

## Clear or Resolve Your Own Message

1. Tap **•••** next to a message you sent.
2. Choose one:
   - **Mark Resolved:** the message gets a green **Resolved** tag for everyone. Tap **Reopen** to undo it. Marking your latest announcement resolved takes it off the pinned spot.
   - **Clear:** removes the message from the ride chat for everyone. Tap **Clear** again to confirm. This can't be undone.

Only the person who sent a message can clear it or mark it resolved.

## Quick Replies in Chat

Quick replies sent from Ride Mode, like **On My Way**, also show in the ride chat in italics.

## Message Pop-Ups

When a new message arrives on a ride you're on, a pop-up slides in at the top of the screen, whatever screen you're on.

- Tap the pop-up to open the ride.
- Tap **Dismiss** to close it. When several are waiting, it shows **+2 More** and **Dismiss All**.
- Pop-ups close on their own after a few seconds, and announcements stay up a little longer.
- If the sender clears a message or marks it resolved before you see it, its pop-up goes away.

Pop-ups and notifications follow your choices in **Notifications**. See [Notification Settings](/help/notification-settings).

## Report or Block Someone in Chat

Press and hold someone else's message, then tap **Report Rider** or **Block Rider**. See [Report or Block a Rider](/help/report-and-block).
