#!/usr/bin/env bash
# Rebuilds the last good OnMyLead version as a NEW, higher version, for when a store release is
# broken. Neither store accepts an older version or a lower build number, so "rolling back" means
# shipping the old code again under new numbers. See docs/release-rollback.md.
#
# Runs on Chris's Mac (it has the signing keys, app/.env and google-services.json), from the
# "Phone build and server updates" thread. It only PREPARES the build: it checks out the good code
# in a separate folder, gives it the new numbers and installs packages. Building, uploading and
# submitting stay the normal release steps and need Chris's typed OK (CLAUDE.md Rule 7).
#
# Usage:  scripts/release/rebuild-good-version.sh <good version or commit> <new version> [folder]
#   e.g.  scripts/release/rebuild-good-version.sh 1.0.2 1.0.4
#
# The good code is found, in order: the commit recorded for that version in help/release.json
# `versions`; a git tag app-v<version>; otherwise the commit on main that set app/app.json to that
# version (asks before using it, because later merges may have gone into that version too).
# Works with the macOS bash 3.2 and needs git and node.
set -euo pipefail

good="${1:-}"; new="${2:-}"
if [ -z "$good" ] || [ -z "$new" ]; then
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
root=$(git rev-parse --show-toplevel)
cd "$root"
dest="${3:-$HOME/Developer/OnMyLead-rollback-$new}"

echo "Fetching main..."
git fetch --quiet origin main --tags

# Small JSON and version helpers in node (no jq on a stock Mac).
js() { node -e "$1" "${@:2}"; }
newer() { # exit 0 when $1 > $2
  js 'const p=(v)=>v.split(".").map(Number);const a=p(process.argv[1]),b=p(process.argv[2]);for(let i=0;i<3;i++){const d=(a[i]||0)-(b[i]||0);if(d)process.exit(d>0?0:1)}process.exit(1)' "$1" "$2"
}
app_json_at() { git show "$1:app/app.json"; }
field() { # field <commit> <expo.path>
  app_json_at "$1" | js 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let o=JSON.parse(s).expo;for(const k of process.argv[1].split("."))o=o?.[k];console.log(o??"")})' "$2"
}

if ! printf '%s' "$new" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then echo "New version must look like 1.0.4." >&2; exit 2; fi

# 1. The good commit.
commit=""; how=""
if git rev-parse --quiet --verify "$good^{commit}" >/dev/null 2>&1 && ! printf '%s' "$good" | grep -Eq '^[0-9]+(\.[0-9]+){0,2}$'; then
  commit=$(git rev-parse "$good^{commit}"); how="the commit you gave"
else
  recorded=$(git show origin/main:help/release.json | js 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=(JSON.parse(s).versions||[]).filter(x=>x.version===process.argv[1]&&x.commit);console.log(v.length?v[v.length-1].commit:"")})' "$good")
  if [ -n "$recorded" ] && git rev-parse --quiet --verify "$recorded^{commit}" >/dev/null; then
    commit=$(git rev-parse "$recorded^{commit}"); how="help/release.json (the commit that was built for $good)"
  elif git rev-parse --quiet --verify "refs/tags/app-v$good" >/dev/null; then
    commit=$(git rev-parse "app-v$good^{commit}"); how="tag app-v$good"
  else
    for c in $(git log --first-parent --reverse --format=%H origin/main -- app/app.json); do
      if [ "$(field "$c" version)" = "$good" ]; then commit="$c"; break; fi
    done
    [ -n "$commit" ] || { echo "Couldn't find version $good. Give the commit instead." >&2; exit 1; }
    how="the commit that set app/app.json to $good (no build commit was recorded)"
    echo
    echo "No build commit is recorded for $good, so this uses the version bump commit:"
    git log -1 --format='  %h %ad %s' --date=short "$commit"
    echo "Merges after it but before the next bump are NOT included:"
    next=$(git log --first-parent --reverse --format=%H "$commit..origin/main" -- app/app.json | head -1)
    git log --first-parent --format='  %h %s' "$commit..${next:-origin/main}" | head -20
    printf 'Use %s? [y/N] ' "$(git rev-parse --short "$commit")"
    read -r ok; [ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Stopped."; exit 1; }
  fi
fi

# 2. New numbers: above everything main (and so both stores) has seen.
main_version=$(field origin/main version)
main_build=$(field origin/main ios.buildNumber)
main_code=$(field origin/main android.versionCode)
newer "$new" "$main_version" || { echo "New version $new must be higher than main's $main_version." >&2; exit 1; }
build=$((main_build + 1)); code=$((main_code + 1))

# 3. A separate folder, so the normal checkout is untouched.
[ ! -e "$dest" ] || { echo "$dest already exists. Remove it or pass another folder." >&2; exit 1; }
git worktree add --detach "$dest" "$commit" >/dev/null
js 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.expo.version=process.argv[2];j.expo.ios.buildNumber=process.argv[3];j.expo.android.versionCode=Number(process.argv[4]);fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' \
  "$dest/app/app.json" "$new" "$build" "$code"
for f in .env google-services.json; do
  if [ -f "$root/app/$f" ]; then cp "$root/app/$f" "$dest/app/$f"; fi
done
echo "Installing packages..."
(cd "$dest/app" && npm ci --no-audit --no-fund >/dev/null)

cat <<DONE

Ready: $dest
  Code:     $(git log -1 --format='%h %s' "$commit")  (from $how)
  Numbers:  version $new, iOS build $build, Android versionCode $code

Next (each needs Chris's typed OK in the Mac thread):
  1. Build and test both apps from $dest/app exactly as a normal release
     (docs/android-build.md, docs/ios-e2e-checklist.md).
  2. Upload: Google Play as a staged rollout; App Store with phased release on and, if riders are
     stuck, an expedited review request.
  3. Send the cloud thread this to merge on main, so main never reuses these numbers:
     app/app.json version $new, ios.buildNumber "$build", android.versionCode $code;
     help/release.json versions + help/release-notes.json entries for $new ("same as $good").
  4. When $new is live: Admin Dashboard > Releases > Minimum Version = $new.
  5. Afterwards: git worktree remove "$dest"
DONE
