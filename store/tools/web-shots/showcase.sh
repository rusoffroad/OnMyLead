#!/usr/bin/env bash
# The onmylead.com showcase screens for 3.0 (app/public/showcase/*-3.webp, customize-home.webp,
# photo-crop.webp), from the same screenshot build as the store sets. Run shots.sh first, then:
#   bash store/tools/web-shots/showcase.sh OUT_DIR   (the same OUT_DIR)
# The site shows the -3 files once SHOWCASE_REDESIGN_3 is on (app/src/constants/site.ts).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=$(cd "$1" && pwd)
HERE="$ROOT/store/tools/web-shots"
R=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
RAW="$OUT/raw/showcase"
mkdir -p "$RAW"
run() { DPR=2 node "$HERE/shoot.mjs" "$OUT/build/dist" "$RAW" "$@"; }
# How a Group Ride Works and the feature panels: 393 x 852 points (786 x 1704).
FIXTURES=v3 run "group-map-3|/ride/$R/live|393|852|||||||@Hide the message and status buttons" \
  "find-3|/find|393|852" "navigate-3|/nav|393|852" "vehicle-3|/garage/dddddddd-dddd-4ddd-8ddd-dddddddddddd|393|852"
CLOSE=1 FIXTURES=v3 run "live-3|/ride/$R/live|393|852"
# New in OnMyLead 3.0 cards: 393 x 798 points (786 x 1596).
FIXTURES=v3 run "home-3|/|393|798" "map-mode-3|/nav|393|798" "rides-3|/find|393|798||How Far Will You Go?" \
  "events-3|/events-tab|393|798" "customize-home|/|393|798|||||||Customize Home" "photo-crop|/social/new|393|798|||||||^Add Photo"
CLOSE=1 FIXTURES=v3 run "ride-mode-3|/ride/$R/live|393|798"
NO_OUT=1 FIXTURES=v3 run "social-3|/social-tab|393|798"
python3 - "$RAW" "$ROOT/app/public/showcase" <<'PY'
import sys
from pathlib import Path
from PIL import Image
raw, dest = Path(sys.argv[1]), Path(sys.argv[2])
for f in sorted(raw.glob('*.png')):
    Image.open(f).convert('RGB').save(dest / (f.stem + '.webp'), quality=80, method=6)
    print('saved', dest / (f.stem + '.webp'))
PY
