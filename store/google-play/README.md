# Google Play

Everything for the OnMyLead listing on Google Play (one app for Android phones and tablets,
package `com.rusoffroad.onmylead.app`).

| File | What it is |
|---|---|
| `listing.md` | Store listing text, data safety, content rating, target audience, permission declarations and subscription products, ready to paste |
| `play-console-checklist.md` | What happens in Play Console after the developer account exists, in order, and who does each step |
| `feature-graphic.png` | 1024 × 500 feature graphic (`tools/feature_graphic.py`) |
| `screenshots/phone/` | 8 phone screenshots, 1080 × 1920, upload in file order |

Every set (phone, `screenshots/tablet-7/` 1920 × 1200 and `screenshots/tablet-10/` 2560 × 1600)
is rendered from the same screens as the App Store sets, so both stores show the same app:
`bash store/tools/web-shots/shots.sh OUT_DIR` rebuilds, shoots and frames all of them
(`store/tools/frame_phone.py`, `store/tools/frame_tablet.py`). Google Play takes the first 8 of
the 10. Once the Android build runs on a real phone, compare against it; any screen that differs
on Android is re-shot there.
