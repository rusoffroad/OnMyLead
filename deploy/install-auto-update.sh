#!/usr/bin/env bash
# One-time setup on the server, so approved website updates go live without anyone running a command:
#   ssh rus 'bash ~/onmylead/deploy/install-auto-update.sh'
# Adds one line to this user's crontab (keeping every other line, including Basecamp's) that runs
# auto-update.sh every minute. Running it again changes nothing. To undo:
#   ssh rus 'crontab -l | grep -v onmylead-auto-update | crontab -'
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
command -v flock >/dev/null || { echo "flock is missing (sudo apt-get install -y util-linux)"; exit 1; }
sudo -n true 2>/dev/null || { echo "this user needs passwordless sudo for docker (it already has it if deploy.sh runs without asking)"; exit 1; }
line="* * * * * bash $dir/auto-update.sh >/dev/null 2>&1 # onmylead-auto-update"
current=$(crontab -l 2>/dev/null || true)
if grep -q 'onmylead-auto-update' <<<"$current"; then
  echo "Already installed."
else
  { [ -n "$current" ] && printf '%s\n' "$current"; printf '%s\n' "$line"; } | crontab -
  echo "Installed: the server now checks for approved website updates every minute."
fi
# What's being served now counts as live, so the first check doesn't redeploy the same build.
if [ ! -f "$dir/.live-build" ]; then
  git ls-remote https://github.com/rusoffroad/OnMyLead refs/heads/web-live | cut -f1 > "$dir/.live-build" || true
fi
echo "Log: $dir/auto-update.log"
