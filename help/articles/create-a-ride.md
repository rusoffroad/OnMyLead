---
title: Create a Ride
summary: Pick public or private, set the day, time and meeting point, choose a mapped route or freeride, and share your new ride.
category: rides
order: 10
release: "1.0"
updated: 2026-10-31
sources:
  - app/src/app/ride/new.tsx
  - app/src/app/(tabs)/index.tsx
  - app/src/components/invite-card.tsx
  - app/src/core/entitlements.ts
  - app/src/core/pro.ts
  - app/src/components/pro-gate.tsx
  - app/src/core/time.ts
  - app/src/core/calendar.ts
  - app/src/components/ride-date-picker.tsx
  - app/src/components/date-calendar.tsx
  - app/src/lib/api.ts
  - supabase/migrations/20261018000000_pro_entitlements.sql
related: [create-a-ride-on-the-website, invite-riders, route-builder, approvals-and-waitlist, edit-cancel-or-delete-a-ride, free-vs-pro]
keywords: [new ride, plan a ride, start a ride, organize, host, meeting point, meet up, public ride, private ride, freeride, tablet]
screenshots:
  - file: create.webp
    shows: app/src/app/ride/new.tsx
---

You lead. Create a ride, tell everyone where and when to meet, and OnMyLead gives you a link, a code and a QR code to share. Public rides show up for riders nearby. Private rides are only for the people you invite.

![The Create a Ride screen](/help/img/create.webp)

## Create Your Ride

1. On the **Rides** tab, tap **Create a Ride**.
2. Under **What Kind of Ride?**, tap **Public** (open to anyone, found by riders near you or in your state) or **Private** (only friends you invite by link, text or email).
3. Type a **Ride Name**.
4. Under **When**, pick the day (see [Pick the Day](#pick-the-day) below).
5. Type the time in **Meet At**, for example "8:00 am" or "2:30 pm".
6. Set the **Meeting Point**. You can search in **Search a Place or Address**, tap **Use My Current Location**, or paste **Coordinates** like "38.57, -109.55".
7. Add a **Place Name** if you like, such as "Gas station on Main St".
8. Under **The Route**, tap **Mapped** (you draw the route or import a GPX file next) or **Freeride** (no set route, everyone follows the leader).
9. Under **Who's Riding**, pick the **Vehicles Welcome**.
10. Tap **Create Public Ride** or **Create Private Ride**.

If you picked **Mapped**, the route builder opens right away so you can draw the trail. See [Build a Route](/help/route-builder). Once the ride is saved you land on its page, ready to invite riders.

:::tip
Only riders who have joined see the exact meeting spot. Public pages show the general area, within about a mile.
:::

## Pick the Day

:::until 1.0.1
Under **When**, tap **Today**, **Tomorrow** or any day in the next two weeks.
:::

:::release 1.0.1
Under **When**, tap **Today**, **Tomorrow**, **Sat** or **Sun** for the coming weekend. For any other day, tap **Calendar**.

:::until 1.0.2
Pick the day from the month calendar. Use the arrows to go to another month. You can schedule a ride for any day from today up to a year out.
:::

:::release 1.0.2
Then either type the date or pick it on the calendar:

- **Type a Date:** tap the box and type the month, day and year, such as 06/12/2027. The number pad is enough; the slashes go in for you. The calendar jumps to that day.
- **Tap a day:** use the arrows to go to another month, or tap the month's name (such as "November 2026") to choose a year and month, then tap the day.

You can schedule a ride for any day from today up to three years out, so rides next year and the year after are fine. Past days and days further out are greyed out.
:::

The day you picked shows under **When**, with how far away it is, such as "In 8 Weeks". Tap **Done** to fold the calendar away.

On a tablet, the calendar sits in the same form, with bigger day buttons.
:::

## Public Ride Options

A public ride is listed in its state so riders can find it. The **State** fills in from the meeting point. If it's wrong (it can happen near a border), tap **Change State** and pick the right one.

Public rides also have a **Joining** choice:

- **Anyone Can Join**
- **I Approve Riders**

See [Approvals and the Waitlist](/help/approvals-and-waitlist) for how requests work. Private rides don't have this choice: anyone holding your invite link or code can join.

## Limit Who Can Come

Under **Who's Riding**, set **Max Vehicles**, **Max Riders** or both. Leave them empty for no limit. When the ride is full, new riders go on a waitlist. See [Approvals and the Waitlist](/help/approvals-and-waitlist).

## Invite a Riding Group

If you're in a riding group, an **Invite a Group** section shows up. Pick one or more groups under **Your Riding Groups**. Everyone in them gets a notification and sees the ride on their Rides tab, and they join with one tap. See [Riding Groups](/help/riding-groups).

## Add More Details

Tap **Add Route, Difficulty and More** to fill in any of these:

- **Description**
- **Departure Time** and **Expected Finish** (used to check your ride against sunset, see [Ride Day and Weather](/help/ride-day-and-weather))
- **Destination**, which anyone who can see the ride sees, with directions in Apple Maps or Google Maps
- **Route Length (Miles)**, used to warn riders whose fuel range is too short (see [Fuel Range](/help/fuel-range))
- **Difficulty**: Easy, Moderate, Hard or Extreme
- **Experience**: Beginner, Intermediate, Advanced or Expert
- **What to Bring**, **Required Equipment** and **Fuel**
- **Instructions for Joined Riders**, which only riders on the ride see
- **Ride Bubble**: Standard, Tight Trail, Desert or Highway (see [Ride Bubble](/help/ride-bubble))

## After You Create It

Your ride page opens with a card that has the invite code, a QR code and buttons to share it. See [Invite Riders](/help/invite-riders). You're also the ride's organizer and leader. See [Organizer Controls](/help/organizer-controls).

## How Many Rides You Can Create

Free accounts create one ride each month. Joining rides is always free and unlimited. On Free, the top of the Create a Ride screen shows **Rides Created This Month** so you know where you stand. When you've used this month's free ride, the app tells you the date your next one opens (the first of the month, UTC). Creating more rides than that is a Pro feature. See [Free and Pro](/help/free-vs-pro).

:::note
A ride counts toward the month you create it, even if you later cancel or delete it. Copying a ride or using **Ride Again** also creates a new ride.
:::

Pro bought on Android through Google Play lifts the monthly limit the same way, on every device you sign in to.
