#!/usr/bin/env bash
# Store screenshots: a web export of the app that shows what the iPad and Android apps show, with
# mock data. Never deployed. Usage (repo root, after `npm ci` in app/):
#   bash store/tools/web-shots/build.sh OUT_DIR
#   DPR=2 WAIT=9000 node store/tools/web-shots/shoot.mjs OUT_DIR/dist RAW_DIR "01-live|/ride/<id>/live|1366|1024" ...
# The exact shot list is in store/app-store/ipad-and-next-apple-release.md.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=$(mkdir -p "$1" && cd "$1" && pwd)
HERE="$ROOT/store/tools/web-shots"
rm -rf "$OUT/app" "$OUT/dist"
mkdir -p "$OUT/app"
(cd "$ROOT/app" && tar --exclude=node_modules -cf - .) | (cd "$OUT/app" && tar xf -)
ln -s "$ROOT/app/node_modules" "$OUT/app/node_modules"
cd "$OUT/app"
# The web build's stand-ins become the app's screens:
cp "$HERE/group-map.web.tsx" src/components/group-map.web.tsx          # live map on satellite, like the apps
cp "$HERE/offline-maps.web.ts" src/lib/offline-maps.web.ts             # three saved maps
cp src/components/get-the-app.tsx src/components/get-the-app.web.tsx   # no "get the app" card in the app
sed -i "s/if (Platform.OS === 'web') {/if (false) {/" src/app/maps/index.tsx
sed -i "s/{Platform.OS === 'web' ? (/{false ? (/" src/app/ride/new.tsx
sed -i "s/const web = Platform.OS === 'web';/const web = false;/" "src/app/ride/[id]/route.tsx"
EXPO_OFFLINE=1 EXPO_PUBLIC_SUPABASE_URL=https://mock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=mock \
  npx expo export --platform web --output-dir "$OUT/dist"
