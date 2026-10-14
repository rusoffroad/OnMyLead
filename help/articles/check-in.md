---
title: Check In
summary: Let the group know you've made it to the meeting spot with one tap, and see who's already there.
category: joining
order: 60
release: "1.0"
updated: 2026-10-14
sources:
  - app/src/app/r/[code].tsx
  - app/src/components/ride-roster.tsx
  - app/src/lib/api.ts
  - supabase/migrations/20261007000000_init.sql
related: [join-a-ride, ride-mode, directions, organizer-controls]
keywords: [check in, checkin, arrived, here, ready, attendance, roll call, meeting spot, tablet]
---

Checking in tells the organizer and the rest of the group that you're at the meeting spot and ready to ride.

## Check In

1. Open the ride page.
2. Tap **I'm Here and Ready**.

The button changes to "Checked in at" and the time you tapped it.

You can check in once you've joined the ride, until the ride ends. Checking in doesn't use your location. It does need a connection, so if the trailhead has no signal, check in before you lose it.

## See Who's Here

On the ride page, tap **Riders**. Riders who checked in show **Here** under their name in the **Going** list. Organizers use this to see who's made it before starting Ride Mode.

:::note
Once you've checked in, you can't undo it.
:::

:::tip
Need help getting to the meeting spot? Directions are on the ride page once you've joined. See [Directions](/help/directions).
:::
