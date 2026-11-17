#!/usr/bin/env bash
# Runs every minute from cron on the server (installed once by install-auto-update.sh). When the
# `web-live` branch on GitHub points at a different build than the one being served, it runs
# deploy.sh for that build. `web-live` only moves from the "Update server" workflow, after a merge
# into main (.github/workflows/server.yml, docs/server-updates.md).
# No key or password: it only reads the public repository. Touches nothing outside ~/onmylead.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
REPO=https://github.com/rusoffroad/OnMyLead
LOG=auto-update.log

# One at a time, and keep the log small.
exec 9>.auto-update.lock
flock -n 9 || exit 0
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1000000 ] && tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

want=$(timeout 30 git ls-remote "$REPO" refs/heads/web-live 2>/dev/null | cut -f1)
[ -n "$want" ] || exit 0                       # GitHub unreachable, or no update yet
have=$(cat .live-build 2>/dev/null || true)
[ "$want" = "$have" ] && exit 0

tmp=$(mktemp)
{
  echo "=== $(date -u +%FT%TZ) web build ${want:0:7} (serving ${have:0:7}) ==="
  if WEB_BRANCH=web-live bash ./deploy.sh </dev/null; then
    echo "$want" > .live-build
  else
    # Try again in a minute; the workflow reports the failure to Chris if it lasts.
    echo "deploy failed; will retry"
  fi
} 2>&1 | tee "$tmp" >> "$LOG"
result=$(grep -q '^deploy failed; will retry$' "$tmp" && echo failed || echo deployed)

# What the last try did, at onmylead.com/deploy-status.json, so the "Update server" run can say
# why a build didn't go live without anyone opening the server. Only the deploy's own messages.
if [ -d site ]; then
  why=$(sed 's/\x1b\[[0-9;]*m//g' "$tmp" | grep -m1 'DEPLOY FAILED' | sed 's/^DEPLOY FAILED: //' | tr -d '"\\' | cut -c1-300)
  disk=$(df -Pm . 2>/dev/null | awk 'NR==2 {print $4}')
  printf '{"at":"%s","build":"%s","result":"%s","error":"%s","diskFreeMB":"%s"}\n' \
    "$(date -u +%FT%TZ)" "$want" "$result" "$why" "$disk" > site/deploy-status.json.tmp \
    && mv -f site/deploy-status.json.tmp site/deploy-status.json
fi
rm -f "$tmp"
