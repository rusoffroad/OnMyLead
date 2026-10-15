# iOS End-to-End Checklist

Run before every App Store upload, on the exact commit being built. **Sim** = iOS Simulator is
enough. **iPhone** = needs Chris's real iPhone (GPS, background location, camera, real push,
purchases sheet). Use a second account (simulator or the Android emulator) wherever a step needs
another rider. Mark each line Pass / Fail / Skipped with a note, and stop the upload on any Fail.

Build under test: version ______ build ______ commit ______ date ______

## Launch and Account
- [ ] Sim: cold launch shows the full splash logo, then Home (Create a Ride, Join, Find).
- [ ] Sim: sign in with email + password; sign out; sign in again with Sign in with Apple (iPhone).
- [ ] Sim: You tab opens Ride Name, Notifications, Directions App, Subscription, Help.

## Rides
- [ ] Sim: Create a Ride (Private, Mapped route with Follow Trails, meeting point from place search).
- [ ] Sim: ride page shows Details, Map, Riders, Chat; Ride Day weather; directions card opens Apple Maps.
- [ ] Sim: second account joins with the ride link (onmylead.com/r/…) and lands on the ride.
- [ ] iPhone: second account joins by scanning the QR code with the camera.
- [ ] Sim: I Approve Riders ride: request shows, approve works, rider is told.

## Ride Mode and Location
- [ ] iPhone: Start Ride Mode; both riders' dots move; leader colored; Ride Bubble updates.
- [ ] iPhone: lock the screen 5 minutes while moving; the other rider still sees fresh updates.
- [ ] iPhone: send the app to background, then force-quit and reopen; sharing resumes on its own.
- [ ] iPhone: sharing stops when the timer ends and when the ride ends.
- [ ] iPhone: hand the lead to the other rider and back; set a tail gunner.
- [ ] iPhone: Need Help and Mechanical Issue reach the leader (push + spoken alert); Regroup Here.
- [ ] Sim: the Emergency sheet opens (do not place a 911 call).

## Chat, Polls, Groups
- [ ] iPhone: ride chat to everyone and to the leader only; keyboard opens and dismisses; sends.
- [ ] Sim: create a poll (Pro or trial) and vote from the other account.
- [ ] Sim: Riding Groups: create a group, group chat, invite the group to a ride, open a group link.

## Notifications
- [ ] iPhone: chat push arrives with the app open, in background and fully closed.
- [ ] iPhone: tapping each push opens the right ride or chat; Back from there returns Home.
- [ ] iPhone: quiet hours and per-topic switches stop the matching pushes.

## Maps and Pro
- [ ] Sim: Satellite, Topo and Trails layers load; route and waypoints draw.
- [ ] iPhone: download an offline area, turn on Airplane Mode, the map still shows the area.
- [ ] iPhone: Pro screen shows $4.99/month and $29.99/year from the App Store sheet; cancel the
  sheet without buying. Restore Purchases runs without error.

## Wrap-Up
- [ ] Sim: Cancel Ride (riders get push + email), then Delete Ride; it leaves every list.
- [ ] Sim: Sign Out returns to the signed-out Home.
- [ ] iPad (Sim): Ride Mode sidebar and ride page split layout in portrait and landscape.
