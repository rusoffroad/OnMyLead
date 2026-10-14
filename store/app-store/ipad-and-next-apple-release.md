# iPad Screenshots and the Next Apple Release

Written 2026-10-14 by the "Google Play and iPad Store Prep" thread. Version 1.0 (build 2) is with
Apple for review (`help/release.json`). Nothing here touches that submission: every step below
happens on a new build, and nothing is uploaded or submitted without Chris's typed OK in the Mac
thread (`CLAUDE.md` Rule 7).

## 1. Which Version Number

| 1.0 state when the next build is ready | Next build |
|---|---|
| Still in review | Don't upload. Wait, unless Apple rejects 1.0. |
| Rejected | Same version **1.0**, `ios.buildNumber` **"3"**, fix what Apple asked, resubmit |
| Approved and released | Version **1.0.1** (or **1.1.0** if it carries iPad and Android-era features riders will notice), `ios.buildNumber` **"3"** |

Recommended default: **1.1.0, build 3**, because iPad support is a new device, not a bug fix.

## 2. The Version Bump Pull Request

One small PR, made by the thread that ships the next Apple build, before the Mac builds:

- [ ] `app/app.json`: `expo.version` → `1.1.0` (or `1.0.1`), `expo.ios.buildNumber` → `"3"`.
      Build numbers only go up; never reuse 2.
- [ ] If the build turns on iPad: `expo.ios.supportsTablet` → `true` (the iPad and Tablet Layouts
      thread owns that change and the rotation settings).
- [ ] `help/release.json`: add the new entry to `versions` (`version`, `build: "3"`, `commit`,
      `status: "in_review"`, `submitted`) when the Mac submits it, and move "iPad" out of
      `unreleased` once that version is live, so iPad steps in the Help Center publish.
- [ ] `store/app-store/listing.md`: Devices → "iPhone and iPad"; What's New text; review notes
      (section 5 below); remove "iPad is off, so no iPad screenshots".
- [ ] `docs/feature-parity.md`: Release column for the features the build carries.

## 3. iPad and Android Tablet Screenshots (done 2026-10-14)

Made after the tablet layouts merged (PR #105). All landscape, because sideways is where the
tablet layouts show the most: Ride Mode keeps the riders sidebar, the full map and the status
buttons on one screen, which upright leaves only a sliver of map between the two panels.

| Set | Size | Folder |
|---|---|---|
| iPad (13-inch; Apple scales it for every iPad) | 2732 × 2048 | `store/app-store/screenshots/ipad/` |
| Google Play 10-inch tablet | 2560 × 1600 | `store/google-play/screenshots/tablet-10/` |
| Google Play 7-inch tablet | 1920 × 1200 | `store/google-play/screenshots/tablet-7/` |

| # | Screen | Caption |
|---|---|---|
| 01 | Ride Mode: riders sidebar, live map, status buttons | Everyone on One Live Map |
| 02 | Ride page, Riders tab: invite card beside the ride | Invite Riders With a Code or QR |
| 03 | Create a Ride | Plan the Ride on the Big Screen |
| 04 | Route builder beside the map | Routes That Follow the Trail |
| 05 | Find a Ride: list beside the map | Find Rides Near You |
| 06 | Riding group chat | Chat With Your Riding Group |
| 07 | Offline maps | Save Maps for Places With No Signal |
| 08 | Ride page, Chat tab with polls | Ride Chat and Quick Polls |

Upload in file order. Review copies are in the project folder `onmylead/app-store/screenshots/ipad/`
and `onmylead/google-play/screenshots/`.

**How they are made.** The real screens from the shared code, exported for web with mock data
(Slickrock Saturday, the Saturday Crew) by `store/tools/web-shots/build.sh`, which swaps the
website's stand-ins for what the apps show (the live map on satellite, saved offline maps, no
"get the app" card or website-only lines). `store/tools/web-shots/shoot.mjs` captures them at
1366 × 1024 (iPad), 1280 × 800 (10-inch) and 960 × 600 (7-inch) points at 2×, Mountain time, and
`store/tools/frame_tablet.py` adds the caption band and the device frame. To redo a set after a
screen changes, run those three steps; then compare against a real iPad and Android tablet once a
tablet build exists, and re-shoot anything that differs.

## 4. Apple Checks for an iPad Build

- [ ] `supportsTablet: true` and all four orientations on iPad (needed for Split View and Slide
      Over; `UIRequiresFullScreen` stays off). Phones can keep portrait.
- [ ] Launch screen and app icon look right on iPad (Expo generates the iPad icon sizes).
- [ ] Ride Mode on an iPad with no GPS (Wi-Fi only) still opens the map and lets the rider follow
      the ride without sharing (tracker F20). Apple reviewers often test on Wi-Fi iPads.
- [ ] Sign in with Apple, purchases and Restore work on iPad (TestFlight on a real iPad, or the
      simulator for layout only).
- [ ] Real-device check on an iPad before submitting (`docs/development-standards.md` section 6).

## 5. App Store Connect Changes for That Version

- [ ] Upload the iPad screenshots (13-inch) next to the existing 6.9-inch iPhone set.
- [ ] What's New, for example: "OnMyLead now runs on iPad, with a big live map, the riders list in
      a sidebar and ride details beside the map."
- [ ] Review notes: add one line: "On iPad, Ride Mode shows the riders list in a sidebar next to
      the map; iPads without GPS can follow the ride without sharing."
- [ ] App Privacy answers stay the same unless the build collects something new.
- [ ] Submit for review only after Chris types OK in the Mac thread. Release: automatic after
      approval, US only, same as 1.0.

## 6. Order of Work

1. Apple decides on 1.0 (Chris forwards Apple's email to the Mac thread if there are questions).
2. The iPad and Tablet Layouts thread merges its layouts and `supportsTablet`.
3. This thread renders the iPad and Android tablet screenshots (section 3).
4. Version bump PR (section 2), merged.
5. The Mac builds 1.1.0 (3), installs it on Chris's iPhone and an iPad for the device check, and
   uploads it to TestFlight.
6. Chris types OK; the Mac submits.
