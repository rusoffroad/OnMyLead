# Server updates (no Terminal)

Database migrations, server functions and the onmylead.com website go live through the
**Update server** workflow (`.github/workflows/server.yml`), automatically after each merge into
`main`. Nobody approves or pastes anything: Chris's standing OK (2026-11-15) is "just auto approve
them i dont want to have to do anything", so merging into `main` is the production OK.

## How an update goes live

1. A pull request merges into `main`. **Build web** builds the website onto the `web-build` branch.
2. **Update server** then compares `main` with the last update it put live (the `server-live` branch)
   and the website build with what the site serves (the `web-live` branch). Its summary lists exactly
   what's new: new migrations, the server functions whose code changed (all of them when
   `supabase/functions/_shared` changed), and whether the website changed. Nothing new: it stops
   there, and nobody is asked anything.
3. Something new: it puts it live right away, one update at a time (a newer merge waits for the
   running one and never cuts it off), in this order (each step stops the run if it fails):
   - **Database:** `supabase db push --linked` (a dry run prints the list first). Only migrations the
     live database is missing run; one that already ran is never run again.
   - **Server functions:** `supabase functions deploy <name> --use-api`. A function skips the JWT
     check only when its own `// Deploy:` line in `index.ts` says `--no-verify-jwt` (the webhooks:
     notify-ride-message, ad-conversions, appstore-notifications, play-notifications, contact-form).
     A unit test makes every function have that line.
   - **Website:** moves `web-live` to the new build. The server checks `web-live` every minute
     (`deploy/auto-update.sh`, from cron) and runs `deploy/deploy.sh` when it moves. The run waits
     until onmylead.com serves the new build (`/help/status.json`).
   - Moves `server-live` to the commit it just put live.

Because a merge goes straight to production, every pull request that touches `supabase/` must be
safe to go live the moment it merges: migrations stay backward compatible with every app build
riders have (CLAUDE.md Rule 4), and CI's database tests must pass first. A run that fails emails
Chris, so check its result after merging.

Claude can start an update by hand with **Actions → Update server → Run workflow**. App builds and store submissions are unchanged: they still run on the Mac.

## One-time setup

1. **Supabase access token:** supabase.com → Account → Access Tokens → Generate new token, named
   `GitHub Update server`.
2. **GitHub environment:** repo Settings → Environments → New environment `production` →
   Deployment branches: `main` only (no required reviewers) → add environment secret
   `SUPABASE_ACCESS_TOKEN` (the token from step 1). Optional secret `SUPABASE_DB_PASSWORD`; without
   it the CLI signs in to the database with the access token.
3. **Switch it on:** repo Settings → Secrets and variables → Actions → Variables → `SERVER_UPDATES`
   = `on`. (Off, or missing: the workflow does nothing.)
4. **Server:** once, from the Mac: `ssh rus 'bash ~/onmylead/deploy/install-auto-update.sh'`. It adds
   one line to the server user's crontab and keeps every other line (Basecamp's included). It needs
   no key or password: the server only reads the public repository.

Fewer emails: GitHub Settings → Notifications → Actions → "Only notify for failed workflows".

## When something goes wrong

- The run's log says which step failed; nothing after it ran. Re-run the job after a fix.
- Website didn't switch: on the server, `tail ~/onmylead/deploy/auto-update.log`.
- Turn it off: set `SERVER_UPDATES` to `off`. The old commands still work from the Mac:
  `npx supabase db push --linked`, `npx supabase functions deploy <name>` (with `--no-verify-jwt`
  where the function's `// Deploy:` line says so), `ssh rus 'bash ~/onmylead/deploy/deploy.sh'`.
- Rolling back: see `docs/release-rollback.md`. Pointing `web-live` at an older `web-build` commit
  puts that website back within a minute.
