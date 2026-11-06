#!/usr/bin/env bash
# Store screenshots: a web export of the app that shows what the iPad and Android apps show, with
# mock data. Never deployed. Usage (repo root, after `npm ci` in app/):
#   bash store/tools/web-shots/build.sh OUT_DIR
#   (or bash store/tools/web-shots/shots.sh OUT_DIR to build, shoot and frame every set)
# The shot list is in shots.sh.
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
cp "$HERE/motion.web.ts" src/lib/motion.web.ts                         # a phone leaning in its mount
sed -i "s/if (Platform.OS === 'web') return <NoSensors \/>;/if (false) return <NoSensors \/>;/" src/app/tilt.tsx
sed -i "s/const tiltOn = Platform.OS !== 'web' \&\& /const tiltOn = /" src/app/nav/index.tsx
sed -i "s/const tiltShown = Platform.OS !== 'web' \&\& /const tiltShown = /" "src/app/ride/[id]/live.tsx"
sed -i "s/if (Platform.OS === 'web') {/if (false) {/" src/app/maps/index.tsx
sed -i "s/{Platform.OS === 'web' ? (/{false ? (/" src/app/ride/new.tsx
sed -i "s/const web = Platform.OS === 'web';/const web = false;/" "src/app/ride/[id]/route.tsx"
# 2.1 shots, switched on per shot by shoot.mjs (localStorage), so one export serves every set:
# shots.nearby = no service with three phones in Bluetooth range (Ride Mode's banner, riders marked
# Via Bluetooth); shots.siren = another rider's EMERGENCY sounding (the full-screen siren).
L="src/app/ride/[id]/live.tsx"
sed -i "s/const nearby = useNearby();/const shotBT = typeof localStorage !== 'undefined' \&\& !!localStorage.getItem('shots.nearby'); const realNearby = useNearby(); const nearby = shotBT ? { ...realNearby, state: 'on' as const, peers: 3 } : realNearby;/" "$L"
sed -i "s/const offlineSince = viewerOfflineSince(lastHeardAt, now);/const offlineSince = shotBT ? now - 600000 : viewerOfflineSince(lastHeardAt, now);/" "$L"
sed -i "s/p \&\& nearby.positions\[m.user_id\]?.recorded_at === p.recorded_at ? t('Via Bluetooth')/p \&\& (shotBT || nearby.positions[m.user_id]?.recorded_at === p.recorded_at) ? t('Via Bluetooth')/" "$L"
sed -i "s/  const calls = useEmergencyCalls();/  const real = useEmergencyCalls(); const calls = typeof localStorage !== 'undefined' \&\& localStorage.getItem('shots.siren') ? [{ id: 'shot', rideId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'x', at: Date.now(), name: 'Marcus' }] : real;/" src/components/emergency-siren.tsx
[ "$(grep -c shotBT "$L")" -ge 3 ] || { echo "live.tsx shot patch missed" >&2; exit 1; }
grep -q shots.siren src/components/emergency-siren.tsx || { echo "siren shot patch missed" >&2; exit 1; }
EXPO_OFFLINE=1 EXPO_PUBLIC_SUPABASE_URL=https://mock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=mock \
  npx expo export --platform web --output-dir "$OUT/dist"
