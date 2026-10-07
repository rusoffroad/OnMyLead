# OnMyLead

OnMyLead is a vehicle-agnostic group ride app: plan a ride, invite people with a link, and keep the
group together on the trail. It is a group ride platform that happens to include maps, not
another navigation app.

Product spec: https://claude.ai/code/artifact/03353396-d9f4-48a7-a5ae-1fd232165bf5

## What's here (stage 1: the core ride loop)

| Area | Where |
| --- | --- |
| Ride Bubble, timed sharing, fuel range, join and waitlist rules (pure TypeScript, unit tested) | `app/src/core/` |
| Database schema, privacy rules, join/leave/start/end functions | `supabase/migrations/` |
| Privacy and joining tests against real Postgres | `supabase/tests/` |
| Mobile and web app (Expo Router) | `app/src/app/` |

Screens: sign in (Apple, Google, Facebook, phone or email), home with your rides and public
rides, create a ride, ride page that works signed out as a link preview, join and waitlist,
check-in, organizer controls (start and end Ride Mode, Leader and Sweep, approvals), Ride
Mode (live group map, Ride Bubble alerts, status buttons, Regroup Here, SOS sheet), personal
location sharing with a timer, and a read-only family link page.

Privacy is enforced in the database, not only in the app:

- Exact meeting points are only readable by joined riders; public pages get a point rounded to about a mile.
- A rider's live position is readable only while they have an active share that covers the viewer.
- Shares stop at their timer, when revoked, when the rider leaves, or when the organizer ends the ride.

## Running it

1. **Backend.** Create a Supabase project. Run `supabase/migrations/*.sql` in the SQL editor
   (or `supabase db push` with the Supabase CLI). Under Authentication > Providers, turn on
   Apple, Google, Facebook, Phone and Email as wanted, and add `onmylead://auth-callback`
   and your web URL to the redirect allow list.
2. **App config.** `cp app/.env.example app/.env` and fill in the project URL and anon key.
3. **Run.** In `app/`: `npm install`, then `npx expo start`. Background location and maps
   need a development build (`npx eas-cli@latest build --profile development`), not Expo Go.
4. **Web.** `npx expo export --platform web` builds the link preview and family link pages
   as a single-page app; host it anywhere and set `EXPO_PUBLIC_WEB_URL`.

## Tests

```bash
cd app && npx vitest run          # Ride Bubble, sharing, fuel, joining
cd app && npx tsc --noEmit && npx eslint src
# Database privacy tests (needs a local Postgres; creates and drops a scratch database):
PGHOST=localhost PGUSER=postgres ./supabase/tests/run_local.sh
```

## Next stages

Garage with build costs, Trip Planner, fuel range card, Starlink page, RUS Offroad product
links, post-ride summary and ride card, then the AI assistant (Rider Pro) and subscriptions.
