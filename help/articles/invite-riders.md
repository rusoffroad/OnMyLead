---
title: Invite Riders
summary: Send your ride by text, email or any app, copy its link, show a QR code, or invite a whole riding group in one tap.
category: joining
order: 30
release: "1.0"
updated: 2026-10-15
sources:
  - app/src/components/invite-card.tsx
  - app/src/components/group-invite.tsx
  - app/src/components/ride-qr-sheet.tsx
  - app/src/core/discovery.ts
  - app/src/core/ride-link.ts
  - app/src/app/r/[code].tsx
  - app/src/app/ride/new.tsx
  - app/src/app/groups/[id]/index.tsx
  - supabase/migrations/20261017430000_riding_groups.sql
related: [join-a-ride, qr-codes, riding-groups, create-a-ride, approvals-and-waitlist]
keywords: [invite, share, send, text, sms, email, link, copy link, invite code, invite group, crew, friends, tablet]
---

Every ride has a link, an invite code and a QR code. Send any of them and your friends can open the ride and join.

## Find the Invite Card

Right after you create a ride, its page opens with the invite card at the top. Later, open the ride page and tap **Riders** to find the **Invite Riders** card.

Anyone on a ride can share it, not just the organizer. On a public ride, anyone who can see the ride page can share it. On a private ride, only riders who have joined see the invite card.

## Send the Invite

On the invite card, tap:

- **Share Invite** to send it with any app on your phone
- **Text** to open a new text message
- **Email** to open a new email
- **Copy Link** to copy the ride's link, then paste it anywhere

The message includes the ride name, the link and the invite code. When your friend taps the link, the ride opens in OnMyLead if they have it, or on onmylead.com with a button to get the app.

On Android, ride and riding group links open straight in the OnMyLead app once it's installed.

## Share the Code

The **Invite Code** is shown in big letters on the card. Friends can type it on the **Rides** tab under **Join a Ride**. See [Join a Ride](/help/join-a-ride).

## Show a QR Code

Tap **Show QR Code** (or the small QR code) to show it full screen, so riders at the trailhead can scan it off your phone. See [QR Codes](/help/qr-codes).

## Invite a Riding Group

Organizers can invite everyone in a riding group at once. Each rider gets a notification and sees the ride on their **Rides** tab, and they join with one tap.

From the ride page:

1. Open the ride page and tap **Riders**.
2. On the invite card, under **Invite a Group**, tap **Invite All** next to the group.

From the group:

1. On the **Groups** tab, open the group.
2. Tap **Invite to a Ride**.
3. Tap the ride. It lists the upcoming rides you organize.

You can also pick groups under **Invite a Group** when you create the ride. See [Create a Ride](/help/create-a-ride).

:::note
Invited riders skip approval, even on a ride where you approve riders. Saving a riding group is a Pro feature, but inviting a group you're already in to your ride is not. See [Riding Groups](/help/riding-groups) and [Free and Pro](/help/free-vs-pro).
:::

## Public or Private?

- **Public** rides can also be found by riders near you or in your state on the Find tab.
- **Private** rides are only found by people you send the link, QR code or code to. Anyone holding them can join, so share them only with people you want on the ride.
