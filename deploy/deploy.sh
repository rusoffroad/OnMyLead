#!/usr/bin/env bash
# Put the newest OnMyLead web build online, and say clearly whether it worked.
# Normally nobody runs this by hand any more: auto-update.sh runs it when a new update
# arrives (docs/server-updates.md). By hand still works:
#   First time, from the Mac:
#     ssh -t rus 'git clone https://github.com/rusoffroad/OnMyLead ~/onmylead && bash ~/onmylead/deploy/deploy.sh'
#   After that:
#     ssh rus 'bash ~/onmylead/deploy/deploy.sh'
# Everything lives in ~/onmylead and the Docker project "onmylead"; nothing else on the server is touched.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mDEPLOY FAILED: %s\033[0m\n' "$*"; exit 1; }
REPO=https://github.com/rusoffroad/OnMyLead
SUDO=${SUDO-sudo}
# Which build to serve. The "Update server" workflow moves `web-live` after each merge
# (docs/server-updates.md) and auto-update.sh calls this with WEB_BRANCH=web-live. Run by hand, it
# serves the newest build, as before.
WEB_BRANCH=${WEB_BRANCH:-web-build}

say "1/4  Getting the latest setup files from GitHub…"
git -C .. fetch -q origin main || fail "couldn't reach GitHub (try again in a minute)"
git -C .. reset -q --hard origin/main || fail "couldn't update ~/onmylead"
echo "Setup: $(git -C .. log -1 --format=%s)"

if [ ! -f .env ]; then
  [ -t 0 ] || fail "first run needs the Cloudflare tunnel token. Run it with ssh -t (see the top of this file)"
  printf 'Paste the OnMyLead Cloudflare tunnel token, then press Return: '
  read -rs token; echo
  [ ${#token} -gt 40 ] || fail "that doesn't look like a tunnel token"
  umask 077
  printf 'ONMYLEAD_TUNNEL_TOKEN=%s\n' "$token" > .env
  echo "Saved in ~/onmylead/deploy/.env (readable only by you)."
fi

say "2/4  Downloading the web build ($WEB_BRANCH)…"
rm -rf site.new
timeout 300 git clone -q --depth 1 --branch "$WEB_BRANCH" "$REPO" site.new 2>/dev/null \
  || fail "couldn't download the web build. Check the 'Build web' run under the repo's Actions tab"
[ -f site.new/index.html ] || fail "the web build has no index.html"
build=$(git -C site.new log -1 --format=%s)
rm -rf site.new/.git
# Which build this is (help/status.json builtAt), to check below that the site really serves it.
built() { grep -o '"builtAt": *"[^"]*"' 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/'; }
want=$(built < site.new/help/status.json)
[ -n "$want" ] || fail "the web build has no help/status.json"
echo "$build"

# The web container mounts the site folder itself, so the folder is never replaced while it
# serves: the new files are copied into it (hashed build files first, then the pages that point
# at them), then files the new build no longer has are removed. The site never goes blank, and
# a failed try leaves the old site up. (Swapping the folder used to leave the container serving
# a deleted folder, all 404s, until the restart; a failed try then retried every minute and
# took the site down again each time, 2026-11-17.)
restart=""
if [ ! -d site ]; then
  mv site.new site
  restart=1
else
  copy() {  # copy one file over its old copy without a half-written moment
    mkdir -p "site/$(dirname "$1")" && cp -p "site.new/$1" "site/$1.oml-new" && mv -f "site/$1.oml-new" "site/$1"
  }
  (cd site.new && find . -type f ! -name '*.html' ! -name '*.json' ! -name '*.xml' ! -name '*.txt' ! -name '*.webmanifest' | sed 's|^\./||') \
    | while IFS= read -r f; do copy "$f" || exit 1; done || fail "couldn't copy the new build (is the disk full? df -h)"
  (cd site.new && find . -type f \( -name '*.html' -o -name '*.json' -o -name '*.xml' -o -name '*.txt' -o -name '*.webmanifest' \) | sed 's|^\./||') \
    | while IFS= read -r f; do copy "$f" || exit 1; done || fail "couldn't copy the new build (is the disk full? df -h)"
  (cd site && find . -type f | sed 's|^\./||') | while IFS= read -r f; do
    [ "$f" = deploy-status.json ] && continue
    [ -e "site.new/$f" ] || rm -f "site/$f"
  done
  find site -mindepth 1 -type d -empty -delete 2>/dev/null || true
  rm -rf site.new
fi

say "3/4  Starting OnMyLead…"
if ! out=$(timeout 300 $SUDO docker compose up -d 2>&1); then
  echo "$out" | tail -20
  fail "the containers didn't start (see above)"
fi
# The web server's settings files are mounted one by one, so after an update changes them it
# only reads them again on a restart. Unchanged settings: no restart, so no blip.
conf=$(cat docker-compose.yml nginx.conf security-headers.conf | sha256sum | cut -c1-16)
[ -f .config-hash ] && [ "$(cat .config-hash)" != "$conf" ] && restart=1
if [ -n "$restart" ]; then
  timeout 120 $SUDO docker compose restart web >/dev/null 2>&1 || fail "the web server didn't restart"
fi

say "4/4  Checking…"
serving() { timeout 20 $SUDO docker compose exec -T web wget -q -O - http://127.0.0.1:8080/help/status.json 2>/dev/null | built; }
got=""
for _ in $(seq 1 20); do
  got=$(serving)
  [ "$got" = "$want" ] && break
  sleep 2
done
if [ "$got" != "$want" ]; then
  # The container may still hold an old copy of the folder; one restart picks up the right one.
  echo "Serving ${got:-nothing} instead of $want; restarting the web server once."
  timeout 120 $SUDO docker compose restart web >/dev/null 2>&1 || fail "the web server didn't restart"
  for _ in $(seq 1 20); do
    got=$(serving)
    [ "$got" = "$want" ] && break
    sleep 2
  done
fi
[ "$got" = "$want" ] || fail "the web server serves ${got:-nothing} instead of the new build $want. Send Claude the output of: cd ~/onmylead/deploy && sudo docker compose logs --tail 40"
echo "$conf" > .config-hash
# Ride QR codes and links open the iPhone app only while Apple can read this file.
timeout 20 $SUDO docker compose exec -T web wget -q -O - http://127.0.0.1:8080/.well-known/apple-app-site-association 2>/dev/null | grep -q applinks \
  || echo "Warning: the app link file isn't being served, so ride links will open the website instead of the app."
timeout 30 $SUDO docker compose ps --status running --services | grep -qx cloudflared \
  || fail "the tunnel isn't running. Send Claude the output of: cd ~/onmylead/deploy && sudo docker compose logs --tail 40 cloudflared"

printf '\n\033[1;32mDEPLOYED: %s\033[0m\n' "$build"
echo "Open https://onmylead.com to see it."
