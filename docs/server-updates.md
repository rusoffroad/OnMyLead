# Server updates (no Terminal)

Database migrations, server functions and the onmylead.com website go live through the
**Update server** workflow (`.github/workflows/server.yml`). Chris approves each update with one tap;
nobody pastes commands on the Mac any more.

## How an update goes live

1. A pull request merges into `main`. **Build web** builds the website onto the `web-build` branch.
2. **Update server** then compares `main` with the last update it put live (the `server-live` branch)
   and the website build with what the site serves (the `web-live` branch). Its summary lists exactly
   what's new: new migrations, the server functions whose code changed (all of them when
   `supabase/functions/_shared` changed), and whether the website changed. Nothing new: it stops
   there, and nobody is asked anything.
3. Something new: it waits for approval. GitHub notifies Chris (GitHub app, or email if he has that
   on). He opens the run, reads the summary, and taps **Review deployments → production → Approve**.
   A newer merge replaces an update that's still waiting, so there's only ever one to approve.
4. After approval, in this order (each step stops the run if it fails):
   - **Database:** `supabase db push --linked` (a dry run prints the list first). Only migrations the
     live database is missing run; one that already ran is never run again.
   - **Server functions:** `supabase functions deploy <name> --use-api`. A function skips the JWT
     check only when its own `// Deploy:` line in `index.ts` says `--no-verify-jwt` (the webhooks:
     notify-ride-message, ad-conversions, appstore-notifications, play-notifications, contact-form).
     A unit test makes every function have that line.
   - **Website:** moves `web-live` to the approved build. The server checks `web-live` every minute
     (`deploy/auto-update.sh`, from cron) and runs `deploy/deploy.sh` when it moves. The run waits
     until onmylead.com serves the new build (`/help/status.json`).
   - Moves `server-live` to the commit it just put live.

Rules that still apply: migrations stay backward compatible with every app build riders have
(CLAUDE.md Rule 4), and Chris's approval is the production OK (Rule 7). The workflow refuses to run
if the `production` environment loses its required reviewer.

Claude can start an update by hand with **Actions → Update server → Run workflow** (it still waits
for Chris's tap). App builds and store submissions are unchanged: they still run on the Mac.

## One-time setup

1. **Supabase access token:** supabase.com → Account → Access Tokens → Generate new token, named
   `GitHub Update server`.
2. **GitHub environment:** repo Settings → Environments → New environment `production` →
   Required reviewers: `rusoffroad` → Deployment branches: `main` only → add environment secret
   `SUPABASE_ACCESS_TOKEN` (the token from step 1). Optional secret `SUPABASE_DB_PASSWORD`; without
   it the CLI signs in to the database with the access token.
3. **Switch it on:** repo Settings → Secrets and variables → Actions → Variables → `SERVER_UPDATES`
   = `on`. (Off, or missing: the workflow does nothing.)
4. **Server:** once, from the Mac: `ssh rus 'bash ~/onmylead/deploy/install-auto-update.sh'`. It adds
   one line to the server user's crontab and keeps every other line (Basecamp's included). It needs
   no key or password: the server only reads the public repository.

Fewer emails: GitHub Settings → Notifications → Actions → "Only notify for failed workflows". Approval
requests still arrive in the GitHub app.

## When something goes wrong

- The run's log says which step failed; nothing after it ran. Re-run the job after a fix.
- Website didn't switch: on the server, `tail ~/onmylead/deploy/auto-update.log`.
- Turn it off: set `SERVER_UPDATES` to `off`. The old commands still work from the Mac:
  `npx supabase db push --linked`, `npx supabase functions deploy <name>` (with `--no-verify-jwt`
  where the function's `// Deploy:` line says so), `ssh rus 'bash ~/onmylead/deploy/deploy.sh'`.
- Rolling back: see `docs/release-rollback.md`. Pointing `web-live` at an older `web-build` commit
  puts that website back within a minute.
