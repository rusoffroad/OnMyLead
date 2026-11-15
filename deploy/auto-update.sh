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

{
  echo "=== $(date -u +%FT%TZ) web build ${want:0:7} (serving ${have:0:7}) ==="
  if WEB_BRANCH=web-live bash ./deploy.sh </dev/null; then
    echo "$want" > .live-build
  else
    # Try again in a minute; the workflow reports the failure to Chris if it lasts.
    echo "deploy failed; will retry"
  fi
} >> "$LOG" 2>&1
