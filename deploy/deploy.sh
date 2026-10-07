#!/usr/bin/env bash
# Put the newest OnMyLead web build online, and say clearly whether it worked.
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

say "2/4  Downloading the newest web build…"
rm -rf site.new
git clone -q --depth 1 --branch web-build "$REPO" site.new 2>/dev/null \
  || fail "no web build yet. Check the 'Build web' run under the repo's Actions tab"
[ -f site.new/index.html ] || fail "the web build has no index.html"
build=$(git -C site.new log -1 --format=%s)
rm -rf site.new/.git site.old
[ -d site ] && mv site site.old
mv site.new site
rm -rf site.old
echo "$build"

say "3/4  Starting OnMyLead…"
if ! out=$($SUDO docker compose up -d 2>&1); then
  echo "$out" | tail -20
  fail "the containers didn't start (see above)"
fi

say "4/4  Checking…"
ok=""
for _ in $(seq 1 20); do
  if $SUDO docker compose exec -T web wget -q -O /dev/null http://127.0.0.1:8080/r/TEST 2>/dev/null; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || fail "the web server isn't answering. Send Claude the output of: cd ~/onmylead/deploy && sudo docker compose logs --tail 40"
$SUDO docker compose ps --status running --services | grep -qx cloudflared \
  || fail "the tunnel isn't running. Send Claude the output of: cd ~/onmylead/deploy && sudo docker compose logs --tail 40 cloudflared"

printf '\n\033[1;32mDEPLOYED: %s\033[0m\n' "$build"
echo "Open https://onmylead.com to see it."
