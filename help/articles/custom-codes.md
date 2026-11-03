---
title: Choose Your Own Code
summary: Give your ride, riding group or friend link a code that's easy to say, like MOAB-2026, instead of the one OnMyLead made.
category: joining
order: 32
release: "1.0.3"
updated: 2026-11-03
sources:
  - app/src/core/share-code.ts
  - app/src/components/share-code-field.tsx
  - app/src/components/share-code-editor.tsx
  - app/src/components/invite-card.tsx
  - app/src/app/ride/new.tsx
  - app/src/app/groups/new.tsx
  - app/src/app/groups/[id]/index.tsx
  - app/src/app/friends.tsx
  - supabase/migrations/20261101900000_custom_share_codes.sql
related: [invite-riders, create-a-ride, riding-groups, friends, join-a-ride, qr-codes]
keywords: [custom code, own code, invite code, ride code, group code, friend code, vanity code, change code, pick code, link]
---

Every ride, riding group and friend link has a code: it's the end of the link (onmylead.com/r/MOAB-2026) and what riders type to open it. OnMyLead makes one for you, like 7F3A9C21. You can type your own instead, so it's easy to say out loud at the trailhead.

:::release 2.0
Choosing your own code is a Pro feature. See [Free and Pro](/help/free-vs-pro). On a Free account, every ride, group and friend link still gets its own code that works, and the code box shows a **Pro** tag.
:::

## What a Code Can Be

- 6 to 20 letters and numbers
- Dashes between words, like SATURDAY-CREW (a space turns into a dash as you type)
- Capital or small letters both work: moab-2026 opens the same ride as MOAB-2026

Codes that pass for OnMyLead itself (like ONMYLEAD or SUPPORT) and rude words aren't allowed.

As you type, OnMyLead checks the code. A green **Available** means you can use it. **Another ride already uses this code** means someone got there first, so try another.

## A Ride's Code

- **When you create it:** under **Invite Code**, type it in **Your Own Code (Optional)**. Leave it empty to get one made for you. See [Create a Ride](/help/create-a-ride).
- **Later:** on the ride's invite card, tap **Choose Your Own Code**, type the new code and tap **Save Code**. Only the ride's organizers see this, and only before the ride ends.

On a private ride, anyone with the code can join, so pick one that's hard to guess.

## A Riding Group's Code

- **When you create it:** type it in **Group Code (Optional)**.
- **Later:** open the group, scroll to **Invite by Link** and tap **Choose Your Own Code**. Only the rider who runs the group sees this.

## Your Friend Link

On the Friends screen, under **Your Friend Link**, tap **Choose Your Own Code**. See [Add Friends](/help/friends).

## What Happens to the Old Code

When you change a code, the old link, QR code and code stop working, the same as **Make a New Link**. Riders already on the ride or in the group stay in, and your friends stay friends. Send the new link to anyone who still needs it.

It works the same on iPhone, iPad, Android phones, Android tablets and onmylead.com.
