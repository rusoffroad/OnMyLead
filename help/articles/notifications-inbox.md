---
title: See and Clear Your Notifications
summary: The bell on the Rides tab lists the notifications OnMyLead sent you in the last 30 days. Open them, mark them read, or clear one or all.
category: account
order: 25
release: "2.0"
updated: 2026-11-04
sources:
  - app/src/app/inbox.tsx
  - app/src/components/inbox-bell.tsx
  - app/src/core/inbox.ts
  - app/src/lib/inbox.ts
  - app/src/lib/notification-tray.ts
  - app/src/lib/notification-tray.web.ts
  - app/src/app/(tabs)/index.tsx
  - supabase/migrations/20261102100000_notification_inbox.sql
related: [notification-settings, ride-chat, status-buttons, friends, emergency-and-safety]
keywords: [notifications, inbox, bell, alerts, clear, dismiss, badge, unread, mark read, history, missed]
---

Missed a notification, or swiped one away too soon? OnMyLead keeps the ones it sent you, so you can find them again and clear them when you're done.

## Open Your Notifications

Tap the bell at the top right of the **Rides** tab. A red number on the bell shows how many are new.

Notifications are listed newest first under **Today**, **Yesterday** and **Earlier**. Each one has a colored icon, so a rider alert like **Need Help** stands out from chat and ride changes. New ones have a dot.

Several messages from the same chat are kept together in one line, with **+2 More** (or however many) under the latest message, so a busy chat doesn't bury anything else.

## Open One

Tap a notification to go straight to what it's about, the same as tapping it on your lock screen: Ride Mode for a rider's status or a ride going live, the ride's chat for a message, Friends for a friend request, and so on. It's marked read.

To mark everything read without opening it, tap **Mark All Read**.

## Clear Notifications

- **Clear one**: swipe it to the left and tap **Clear**, or swipe all the way to clear it straight away. On onmylead.com, click the **X** on the right of the notification.
- **Clear all**: tap **Clear All** at the top, then **Clear All** again to confirm.

Clearing in OnMyLead also clears the same notifications from your phone or tablet's own notification list, and Clear All resets the number on the OnMyLead app icon.

## What's Kept

- Every notification OnMyLead sent you: ride chat, announcements, status buttons, ride changes, new riders, invites, riding group chat, direct messages, friend requests, badges and Pro Trial reminders.
- What you turned off in [Notification Settings](/help/notification-settings) isn't sent, so it isn't kept either. The same goes for quiet hours (except help alerts) and riders you blocked.
- If a rider cancels a status like **Need Help**, the cancellation replaces it. If someone deletes a chat message, it's removed here too.
- Notifications are kept for 30 days, up to the 100 newest.
- Ride reminders are set on your phone itself, so they don't appear in the list.

Your notifications are private to you, and they're the same on every device you sign in on.

## On the Website

The bell is on the Rides page at onmylead.com too, with the same list. It shows the notifications OnMyLead sent to the app on your phone or tablet, so if you haven't allowed notifications in the app, the list stays empty.

## Notification Settings

To choose what you're told about, tap **Notification Settings** at the bottom of the list. See [Notification Settings](/help/notification-settings).
