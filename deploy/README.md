# Putting OnMyLead online at onmylead.com

OnMyLead runs on the same Lightsail server as Basecamp but is completely separate from it: its own folder
(`~/onmylead`), its own Docker project (`onmylead`), its own network and its own Cloudflare tunnel. No port is opened
on the server; visitors reach it only through the tunnel, the same way Basecamp is reached.

How an update reaches the site:
1. A change is merged into `main` on GitHub.
2. GitHub builds the web version (the **Build web** workflow) and saves the finished files on the `web-build` branch.
3. The **Update server** workflow moves the `web-live` branch to that build.
4. `deploy/auto-update.sh` on the server notices within a minute and runs `deploy/deploy.sh`, which downloads it and serves it.

## One-time setup

**1. GitHub**
After merging, **Actions → Build web** runs on its own; wait for the green check.

**2. Cloudflare: a new tunnel for OnMyLead**
1. If onmylead.com isn't in Cloudflare yet: **Add a domain** → onmylead.com → Free plan, then change the domain's
   nameservers at the registrar to the two Cloudflare shows.
2. **Zero Trust → Networks → Tunnels → Create a tunnel** → Cloudflared → name it `onmylead`.
3. Copy the token from the install command (the long string after `--token`). You don't need to install anything.
4. **Published application routes → Add**: hostname `onmylead.com`, service `http://web:8080`.
   Add a second route for `www.onmylead.com` the same way.
5. Leave Cloudflare Access off for these hostnames: the site is public, and the app has its own sign-in.

**3. Server: first deploy** (from the Mac; it asks for the tunnel token once)
```
ssh -t rus 'git clone https://github.com/rusoffroad/OnMyLead ~/onmylead && bash ~/onmylead/deploy/deploy.sh'
```

**4. Supabase: allow sign-in from the site**
Authentication → URL Configuration: Site URL `https://onmylead.com`; add redirect URL `https://onmylead.com/auth-callback`.

## Updating later
Nothing to run. After a merge, the **Update server** workflow moves the `web-live` branch; the server checks it every minute and deploys it (`auto-update.sh`, installed once
with `ssh rus 'bash ~/onmylead/deploy/install-auto-update.sh'`). See `docs/server-updates.md`.

By hand still works: `ssh rus 'bash ~/onmylead/deploy/deploy.sh'` serves the newest build.

## Removing it
```
ssh rus 'crontab -l | grep -v onmylead-auto-update | crontab -; cd ~/onmylead/deploy && sudo docker compose down && rm -rf ~/onmylead'
```
then delete the `onmylead` tunnel in Cloudflare. Basecamp is not affected either way.
