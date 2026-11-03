---
title: Events
summary: Find rallies, poker runs and ride weekends, see the agenda and join the group rides. Pro riders post events with photos, co-hosts and Ride Managers.
category: joining
order: 60
release: "2.0"
updated: 2026-11-03
sources:
  - app/src/app/events/index.tsx
  - app/src/app/events/new.tsx
  - app/src/components/events/event-or-ride.tsx
  - app/src/app/e/[code].tsx
  - app/src/components/events/parts.tsx
  - app/src/components/events/sheets.tsx
  - app/src/components/events/part-of-event.tsx
  - app/src/components/home/events-card.tsx
  - app/src/core/events.ts
  - app/src/lib/events.ts
  - supabase/migrations/20261102950000_events.sql
related: [home-screen, join-a-ride, create-a-ride, organizer-controls, free-vs-pro, report-and-block]
keywords: [event or public ride, difference, event vs ride, event, events, rally, poker run, concert, raffle, show, meetup, ride weekend, agenda, schedule, co-host, ride manager, going, interested, rsvp, event link]
---

Events are the big days: a rally, a poker run, a club weekend or a meetup. An event has its dates, a place, photos, an **Agenda** of what's happening and when (group rides, poker runs, concerts, raffles, shows, food), and the **Group Rides** you can join. Anyone can see events. Pro riders create them.

## Event or Public Ride?

They're different things, and an event can hold public rides.

- A **Public Ride** is one ride on one day: a leader, a meeting point and a time. Anyone nearby finds it in **Find a Ride**, joins it, and you ride together in Ride Mode. See [Find a Ride](/help/find-a-ride) and [Create a Ride](/help/create-a-ride).
- An **Event** is a bigger gathering, like a rally, poker run or ride weekend. It has dates, a place, photos, an agenda and **Going** or **Interested**, and it can hold several group rides that you join one by one.

Just riding? Create a Public Ride. Running a rally or a weekend? Create an Event and add its rides to it.

In the app, **Event or Public Ride?** on Events, Find a Ride, Create a Ride and Create an Event opens the same explanation. Tap **What's the Difference?** to open it and **Hide** to close it. It's the same on iPhone, iPad, Android and the website.

## Find an Event

1. On the **Rides** tab, tap the gold **Events** card (under Create a Ride, Find a Ride and Map Mode).
2. **Coming Up** lists public events, soonest first. With location allowed, it shows the ones within your distance (the same distance as Public Rides Near You); tap the distance chip to change it.
3. Tap an event to open it.

**Yours** lists the events you host, co-host, or said you're going or interested in, including ones from the last 30 days.

Event links look like **onmylead.com/e/** followed by a code. Anyone can open one, even without the app; on the website, names of riders only show once you sign in. On Android the link opens in the app. On iPhone and iPad it opens on onmylead.com for now.

## On an Event's Page

- **Going** and **Interested** tell the hosts you're coming (tap again to take it back). The count is public; the names of riders going show only to signed-in riders.
- **Share** sends the event's link.
- **Directions** opens the place in Apple Maps or Google Maps.
- **Agenda** shows each day in time order. Group rides and poker runs are marked red, raffles, contests and shows gold, everything else blue.
- **Group Rides** lists the event's rides, with their label (like **Day 1: Easy Group**), time, area, how many are going and the **Ride Manager**. Tap **See Ride and Join** to open the ride and join it as usual. A private ride shows **Invite Only: Ask a Host** unless you're already on it.

A ride that's part of an event shows **Part of** and the event's name at the top of its page.

## Create an Event (Pro)

1. Open **Events** and tap **Create an Event**. On Free, the button carries a small gold **Pro** tag and opens the Pro prompt.
2. Give it a name and details, and pick **Public** (shows in Events for everyone) or **Link Only** (only people with the link).
3. Under **When**, pick the first day and the start time. For more than one day, tap **Several Days** and pick the last day (up to 31 days).
4. Under **Where**, search a place or tap the map, and check the **Place Name**. Everyone who sees the event sees this place, so pick a public spot like a venue, park, campground or trailhead.
5. Add a website or ticket link if there is one, and tap **Create Event**.

The event opens, ready for the rest.

## Add Photos, the Agenda and Group Rides

Hosts see extra buttons on the event's page:

- **Add Photos** picks up to 12 photos (on iPhone, iPad and Android you can also **Take a Photo**). The app shrinks each one before it uploads. The first photo is the cover; tap a photo to **Make It the Cover** or **Remove Photo**.
- **Agenda > Add**: pick what it is (Group Ride, Poker Run, Concert, Raffle, Show, Contest, Food, Vendors, Meetup or Other), its name, the day, the start time and, if you like, an end time, where and details. Tap an item to change or remove it.
- **Group Rides > Add**: tap **Create a New Ride for This Event**, or add a ride you already organize (with an optional label). A ride can be in one event at a time. Removing a ride from the event doesn't cancel the ride.
- **Edit Details** changes the name, dates, place and the rest.

## Ride Managers

Each group ride can have a Ride Manager, someone who runs that ride for you. On the ride's card, tap the person button and pick a rider from your friends, the event's hosts and riders you've ridden with.

- The Ride Manager becomes a **Co-Organizer** of the ride: they can approve riders, set roles and run the ride like any co-organizer. See [Organizer Controls](/help/organizer-controls).
- If they aren't on the ride yet, they get a ride invite first, and become Co-Organizer when they join.
- Picking someone else, or **No Ride Manager**, puts the old manager back to Rider.
- Only a host who organizes (or co-organizes) the ride can pick its manager.

## Co-Hosts

The person who created the event can **Add Co-Host** (up to 10). Co-hosts edit the event, its photos and agenda, and add the rides they organize. They can't delete the event or add other co-hosts. A co-host can **Step Down** at any time. Co-hosting is free on every plan.

## Cancel or Delete

- **Cancel Event** keeps the event on its link marked **Cancelled**, and nobody can say they're going. Its group rides aren't cancelled; cancel them on their own pages if needed. **Bring the Event Back** undoes it.
- **Delete Event** (the creator only) deletes the event, its photos and agenda for good. Its group rides stay.

## Report an Event

Signed-in riders can tap **Report This Event** at the bottom of the page. See [Report and Block](/help/report-and-block). If the OnMyLead team hides an event, only its hosts can still see it, with the reason.

## On a Tablet

On iPad and Android tablets (and wide browser windows), Events shows two or three events per row, and an event's page puts the details on the left and the agenda, group rides and who's going on the right.
