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
# 3.0 shots. The satellite pictures (home map header, Map Mode banner, ride cards) come from the
# Esri World Imagery export instead of Mapbox Static Images, so the build needs no Mapbox token.
H="src/core/home.ts"
python3 - "$H" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
old = "  if (!token.startsWith('pk.') || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return null;"
new = ("  { const mpp = 78271.517 / 2 ** zoom, R = 6378137, x = at.lng * Math.PI / 180 * R,"
       " y = Math.log(Math.tan(Math.PI / 4 + at.lat * Math.PI / 360)) * R,"
       " w = Math.min(640, Math.round(widthPt)), h = Math.min(640, Math.round(heightPt));"
       " return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox='"
       " + [x - w / 2 * mpp, y - h / 2 * mpp, x + w / 2 * mpp, y + h / 2 * mpp].join(',')"
       " + '&bboxSR=3857&imageSR=3857&size=' + w * 2 + ',' + h * 2 + '&format=jpg&f=image'; }")
open(p, 'w').write(s.replace(old, new))
PY
grep -q arcgisonline "$H" || { echo "static map shot patch missed" >&2; exit 1; }
# Map Mode's corner buttons sit just above the panel, however tall it is (the 3.0 fix, which is not
# on main yet, measures the panel the same way; drop these lines once it is).
N="src/app/nav/index.tsx"
sed -i "s/  const open = fold.open;/  const open = fold.open; const [shotPanelH, setShotPanelH] = useState(0);/" "$N"
sed -i "s/{ right: 12, bottom: open ? 340 : 180 }/{ right: 12, bottom: Math.max(open ? 340 : 180, shotPanelH + 12) }/" "$N"
sed -i "s/bottom={wide ? 12 : open ? 330 : 170}/bottom={wide ? 12 : Math.max(open ? 330 : 170, shotPanelH + 2)}/" "$N"
sed -i "s/\[120, 60, open ? 360 : 200, 60\]/[120, 60, Math.max(open ? 360 : 200, shotPanelH + 20), 60]/" "$N"
sed -i "s/        {...fold.panHandlers}/        {...fold.panHandlers} onLayout={(e) => { if (!wide \&\& !floating) setShotPanelH(e.nativeEvent.layout.height); }}/" "$N"
[ "$(grep -c -i shotPanelH "$N")" -ge 5 ] || { echo "Map Mode offset shot patch missed" >&2; exit 1; }
[ "$(grep -c shotBT "$L")" -ge 3 ] || { echo "live.tsx shot patch missed" >&2; exit 1; }
grep -q shots.siren src/components/emergency-siren.tsx || { echo "siren shot patch missed" >&2; exit 1; }
EXPO_OFFLINE=1 EXPO_PUBLIC_SUPABASE_URL=https://mock.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=mock \
  npx expo export --platform web --output-dir "$OUT/dist"
