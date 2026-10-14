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

## 3. iPad Screenshot Plan

**Size.** App Store Connect needs one iPad set at the 13-inch size: **2048 × 2732** portrait
(2064 × 2752 also accepted). Apple scales it down for the 11-inch and smaller iPads. Landscape
(2732 × 2048) is allowed, but use portrait for all eight so the set looks the same as the iPhone
set; add landscape shots only where a split view reads better (Ride Mode with the sidebar).

**How they are made.** The same way as the iPhone set: the real screens rendered from the shared
code in the web export with the mock data riders see in the iPhone set (Slickrock Saturday, the
Saturday Crew), at iPad size **1024 × 1366 points × 2** (the 12.9/13-inch iPad), inside a plain
iPad frame with the same caption band and red trail line. Rendered only after the iPad and Tablet
Layouts thread merges, so each shows the tablet layout, never a stretched phone screen.

| # | Screen | Caption | What the tablet layout must show |
|---|---|---|---|
| 01 | Ride Mode, live map (landscape if the sidebar only shows there) | Everyone on One Live Map | Full map with the riders sidebar open |
| 02 | Ride Mode, status buttons | Regroup With One Tap | Map plus the buttons panel side by side |
| 03 | Create a Ride | Plan the Ride on the Big Screen | Two-column form |
| 04 | Ride page, Riders tab with invite card | Invite Riders With a Code or QR | Details beside the map |
| 05 | Route builder | Routes That Follow the Trail | Large map with the route tools panel |
| 06 | Riding group chat | Chat With Your Riding Group | Group list and chat side by side |
| 07 | Offline maps | Save Maps for Places With No Signal | List and map preview |
| 08 | Ride Day card | Ride Day Weather and Daylight | Ride page split view |

Files go in `store/app-store/screenshots/ipad/` (01 to 08, 2048 × 2732) with review copies in the
project folder `onmylead/app-store/screenshots/ipad/`. Android tablet screenshots for Google Play
(7-inch 1200 × 1920 and 10-inch 1600 × 2560, or landscape) are rendered in the same pass from the
same screens with an Android tablet frame, into `store/google-play/screenshots/tablet-7/` and
`tablet-10/`.

**Waits on:** the iPad and Tablet Layouts thread merging (tracker D02, D03). The coordinator tells
this thread when.

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
