---
title: Ask the Group with a Ride Poll
summary: Leaders post a quick question in ride chat, like a lunch stop or the pace, and every rider votes with one tap.
category: ride-mode
order: 50
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/components/ride-poll.tsx
  - app/src/components/ride-chat.tsx
  - app/src/core/polls.ts
  - app/src/core/pro.ts
  - app/src/app/r/[code].tsx
  - app/src/hooks/use-ride-chat.ts
  - supabase/migrations/20261017420000_ride_polls.sql
related: [ride-chat, free-vs-pro, organizer-controls]
keywords: [poll, vote, voting, question, lunch stop, pace, survey]
screenshots:
  - file: chat.webp
    shows: app/src/components/ride-poll.tsx
---

A ride poll is a quick question in the ride chat with a few choices. Every rider on the ride gets one vote, can change it, and sees the live counts.

![Polls in ride chat](/help/img/chat.webp)

## Who Can Post a Poll

The ride's leader, the organizer and co-organizers can post polls. Every rider on the ride can vote.

Creating a poll: This is a Pro feature. See [Free and Pro](/help/free-vs-pro). On a Free plan, picking **Quick Poll** shows **Create Ride Polls**, marked Pro, instead of the poll form. Voting stays free for everyone.

## Post a Poll

1. Open the ride and tap **Chat**.
2. Under **Send To**, pick **Quick Poll**.
3. Tap a starter to fill it in, or type your own:
   - **Lunch Stop?** (Yes, No)
   - **How's the Pace?** (Too Slow, Just Right, Too Fast)
   - **Saturday or Sunday?**
   - **Morning or Afternoon?**
4. Type or edit the **Question**.
5. Fill in **Choice 1** and **Choice 2**. Tap **Add Choice** for more, or **Remove** to drop one.
6. Tap **Post Poll**.

The poll shows in the chat for everyone, and riders get a pop-up saying "Poll from" your name.

### Poll Limits

- 2 to 5 choices, each different.
- The question can be up to 200 characters.
- Each choice can be up to 60 characters.

## Vote

1. Open the ride and tap **Chat**.
2. Tap a choice. It's marked **Your Vote**.

To change your vote, tap another choice. Each choice shows its count and a bar for its share of the votes, and the leading choice is shaded darker. Under the choices you'll see the total, such as **3 Votes**, or **No Votes Yet**.

## Remove a Poll

The person who posted the poll can tap **•••** next to it and tap **Clear**. The poll and its votes are removed for everyone.
