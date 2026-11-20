#!/usr/bin/env bash
# Renders and frames every store screenshot set (4.0): iPhone 6.9", iPad 13", Google Play phone,
# 10-inch and 7-inch tablets. Run from the repo root after `npm ci` in app/:
#   bash store/tools/web-shots/shots.sh /tmp/shots
# Mock data: store/tools/web-shots/fixtures (the Slickrock Saturday ride, the Saturday Crew,
# friends, events and badges; fixtures/store/v4.mjs for 4.0). Never deployed, no real riders.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=$(mkdir -p "$1" && cd "$1" && pwd)
HERE="$ROOT/store/tools/web-shots"
[ -n "${SKIP_BUILD:-}" ] || bash "$HERE/build.sh" "$OUT/build"  # SKIP_BUILD=1 reuses OUT/build
R=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
# FIXTURES=v4 (fixtures/store/v4.mjs): the 3.0 group (v3.mjs: ten riders strung out along the
# trail, events with cover photos, friends out riding) plus Places to Ride near Moab, Activities and
# the weather. CLOSE=1 bunches the riders up for the Ride Mode buttons shot.
SNOW=onmylead.activity=snowmobile
WX="$SNOW,shots.radar,map.weatherRadar.v1,map.weatherForecast.v1"
shots() { # dir width height dpr [clicks that fold Ride Mode's buttons] [clicks before zooming out to the radar]
  mkdir -p "$OUT/raw/$1"
  local Z='@Zoom out,@Zoom out,@Zoom out,@Zoom out'
  FIXTURES=v4 DPR=$4 node "$HERE/shoot.mjs" "$OUT/build/dist" "$OUT/raw/$1" \
    "01-live|/ride/$R/live|$2|$3|||||||$5" "02-activities|/|$2|$3|||||||@Activity: |$SNOW" \
    "03-bluetooth|/ride/$R/live|$2|$3|||||||$5|shots.nearby" \
    "04-radar|/nav|$2|$3|||||||$6$Z|$WX" \
    "05-map-features|/nav|$2|$3|||||||@Map Settings,Every Map Feature,>Snow Depth|$SNOW" \
    "06-places|/places|$2|$3" "07-import|/nav|$2|$3|||||||~Import Waypoints" \
    "09-siren|/ride/$R/live|$2|$3||||||||shots.siren" "10-events|/events-tab|$2|$3"
  CLOSE=1 FIXTURES=v4 DPR=$4 node "$HERE/shoot.mjs" "$OUT/build/dist" "$OUT/raw/$1" "08-status|/ride/$R/live|$2|$3"
}
# Phones: 393 x 798 points (the frame adds the status bar). Ride Mode with its buttons folded,
# Map Mode's panel folded for the radar.
shots phone 393 798 3 '@Hide the message and status buttons' 'Hide,'
shots ipad 1366 1024 2 '' ''
shots t10 1280 800 2 '' ''
shots t7 960 600 2 '' ''
cd "$ROOT"
# Each set is replaced whole, so a shot dropped from the list leaves the store folder too.
rm -f store/app-store/screenshots/*.png store/app-store/screenshots/ipad/*.png store/google-play/screenshots/*/*.png
python3 store/tools/frame_phone.py iphone "$OUT/raw/phone" store/app-store/screenshots
python3 store/tools/frame_phone.py android "$OUT/raw/phone" store/google-play/screenshots/phone
python3 store/tools/frame_tablet.py ipad "$OUT/raw/ipad" store/app-store/screenshots/ipad
python3 store/tools/frame_tablet.py android "$OUT/raw/t10" store/google-play/screenshots/tablet-10
python3 store/tools/frame_tablet.py android "$OUT/raw/t7" store/google-play/screenshots/tablet-7
