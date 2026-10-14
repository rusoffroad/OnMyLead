# Google Play

Everything for the OnMyLead listing on Google Play (one app for Android phones and tablets,
package `com.rusoffroad.onmylead.app`).

| File | What it is |
|---|---|
| `listing.md` | Store listing text, data safety, content rating, target audience, permission declarations and subscription products, ready to paste |
| `play-console-checklist.md` | What happens in Play Console after the developer account exists, in order, and who does each step |
| `feature-graphic.png` | 1024 × 500 feature graphic (`tools/feature_graphic.py`) |
| `screenshots/phone/` | 8 phone screenshots, 1080 × 1920, upload in file order (`tools/frame_android.py`) |

The phone screenshots reuse the App Store screens (`store/app-store/screenshots/`) in an Android
frame, so both stores show the same app. When the App Store set changes, run
`python3 store/google-play/tools/frame_android.py` from the repo root. Once the Android build runs
on a real phone, compare against it; any screen that differs on Android is re-shot there.
Tablet screenshots come after the tablet layouts (`store/app-store/ipad-and-next-apple-release.md`).
