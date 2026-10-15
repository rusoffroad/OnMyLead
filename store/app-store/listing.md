# OnMyLead: App Store Listing, Privacy Answers and Review Notes

Written 2026-10-13 by the "App Store launch" thread. Everything below is ready to paste into App Store Connect. Character counts are checked against Apple's limits.

## App Information

| Field | Value |
|---|---|
| Name (30) | OnMyLead |
| Subtitle (30) | Group Rides That Stay Together |
| Bundle ID | com.rusoffroad.onmylead.app |
| SKU | onmylead-ios |
| Primary language | English (U.S.) |
| Primary category | Navigation |
| Secondary category | Travel |
| Content rights | Does not contain third-party content that needs rights (map data is OpenStreetMap under ODbL, credited in the app) |
| Privacy Policy URL | https://onmylead.com/privacy |
| Support URL | https://onmylead.com/support |
| Marketing URL | https://onmylead.com |
| Copyright | 2026 RUS Offroad LLC |
| License agreement | Apple's standard EULA (the Terms of Use link in the app points to it) |
| Devices | iPhone and iPad |
| Price | Free, with in-app subscriptions |

## Promotional Text (170)

Plan the ride, share one code, and see your whole group on one live map. Regroup, Need Help and EMERGENCY are one tap away, even with gloves on.

## Description (4000)

OnMyLead keeps a group ride together. Side-by-sides, Jeeps, dirt bikes, ATVs or trucks: the leader creates the ride, riders join with a code, a link or a QR code, and everyone sees each other on one map until the ride ends.

PLAN THE RIDE
• Create a ride in seconds with a meeting point, a time and an optional route
• Draw a route that follows the trail, or import a GPX file
• Check every rider's fuel range against the route before you leave
• Ride Day card with the weather, sunrise and sunset for the meeting area
• Make a ride public so others can find it on the map, or keep it private with a code

ON THE TRAIL
• Ride Mode puts the live group map and big status buttons on one screen
• Regroup Here, Need Help, Mechanical Issue and EMERGENCY reach the whole group with one tap, with lights showing who has seen it
• Ride Bubble tells the leader when someone falls behind
• Leader, sweep and tail gunner roles, and hand the lead to another rider
• Planned stops and waypoints for fuel, lunch and hazards
• Ride chat to everyone or to the leader only, with quick polls
• Offline maps keep the map and route on screen when you lose service, and each rider's dot shows how old their last position is

AFTER THE RIDE
• Ride summary and a shareable ride card
• Ride Again with the same crew and route

RIDING GROUPS
• Keep your regular crew in a group with its own chat
• Invite the whole group to a ride in one tap
• Follow a leader to hear about their next ride

YOUR PRIVACY
• Your location is shared only with the ride you join, only while you are sharing, and sharing always ends
• Public rides show a rounded meeting area, never your exact spot
• Report or block any rider

ALSO INSIDE
• Garage for your machines, mods and fuel range
• Trip Planner checklists you reuse
• Starlink dish status and battery run time

OnMyLead is free. Free accounts create one ride a month and join as many as they like, and the safety features are always free. Every new account gets 30 days of OnMyLead Pro with no payment and no automatic charge.

OnMyLead Pro adds unlimited rides, GPX import, offline maps, saved riding groups, polls, full ride history and premium ride cards: $4.99 a month or $29.99 a year (US prices). Payment is charged to your Apple Account at confirmation. Subscriptions renew automatically unless turned off at least 24 hours before the end of the current period, and you can manage or cancel them in your Apple Account settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://onmylead.com/privacy

OnMyLead is not an emergency service. In an emergency, call 911 or your local emergency number first.

Made by RUS Offroad.

## Keywords (100)

offroad,trail,overland,sxs,utv,atv,jeep,dirt bike,convoy,group ride,ride leader,caravan,4x4,gps,map

(99 characters. The app name and category are indexed already, so they are not repeated.)

## What's New (version 1.0)

The first release of OnMyLead.

## Age Rating answers

- Messaging and chat: Yes (ride chat and group chat between riders)
- User-generated content: Yes (ride details, messages, photos), with Report and Block
- Location sharing with other users: Yes
- Everything else (violence, mature themes, gambling, medical, alcohol and so on): None
- Unrestricted web access: No
- Expected rating: 13+. The Terms already say 13 and older.

## App Privacy ("nutrition label") answers

Tracking: **No.** No data is used to track people across other companies' apps or sites, and there is no advertising.

| Data type | Collected | Linked to the user | Used for |
|---|---|---|---|
| Email Address | Yes | Yes | App Functionality |
| Name (the ride name) | Yes | Yes | App Functionality |
| Precise Location | Yes | Yes | App Functionality |
| Photos | Yes (Garage photos the rider picks) | Yes | App Functionality |
| Other User Content (messages, rides, routes, polls) | Yes | Yes | App Functionality |
| Purchase History | Yes | Yes | App Functionality |
| User ID | Yes | Yes | App Functionality |
| Device ID (push token) | Yes | Yes | App Functionality |
| Product Interaction | Yes | Yes | Analytics |
| Customer Support (Contact Us messages: name, reply email, message) | Yes | Yes | App Functionality |
| Crash Data | Yes | No | App Functionality |
| Performance Data | Yes | No | App Functionality |

Social sign-in only passes the name, email and profile photo the rider allows, covered by the rows above.

Not collected: phone number, physical address, payment info, contacts, health, fitness, browsing or search history, sensitive info, audio, advertising data. The app's privacy manifest (app.json, `ios.privacyManifests`) matches this table.

## In-App Purchases (submit with version 1.0)

Subscription group "OnMyLead Pro", both at level 1:
- `com.rusoffroad.onmylead.pro.monthly`, 1 month, $4.99, display name "Pro Monthly"
- `com.rusoffroad.onmylead.pro.annual`, 1 year, $29.99, display name "Pro Annual"

No Apple introductory offer (OnMyLead's own 30-day trial never charges). Each product needs a review screenshot: use the Pro screen (a screenshot of the Pro screen from the build). 

## App Review Information

- Sign-in required: Yes
- Sign-in options in the app: email and password, an email link, Sign in with Apple, Google and Facebook. The demo account uses email and password.
- Demo account: **appreview@rusoffroad.com** with a password set when the account is created (created on the Mac with Chris's OK, email confirmed, comped Pro so every screen is open, plus one sample ride the reviewer can open). The password is only on the Mac in ~/Developer/OnMyLead-private/app-review-login.txt; fill it in App Store Connect only, never in GitHub.
- Contact: Chris, RUS Offroad LLC, the support email and a phone number Chris chooses.

Review notes (paste as is):

> OnMyLead is a group ride app for off-road riders. Sign in with the demo account above. It already has Pro and one upcoming ride, "App Review Test Ride".
>
> To try the core flow: open the ride from Home, tap Start Ride, then Enter Ride Mode. Your dot appears on the group map; the status buttons (Regroup Here, Need Help, EMERGENCY) send a message to the group. EMERGENCY only alerts riders on the ride; it does not contact emergency services, and the app says so.
>
> Background location: Ride Mode keeps sharing the rider's position with their group while the phone is locked on a handlebar or dash mount, because riders cannot look at the phone while driving. Sharing only runs while the rider has turned it on for a ride, always has a timer, and stops when the timer runs out or the ride ends. A blue location indicator shows while it runs.
>
> Local network: the Starlink page (You > Starlink) optionally connects to a Starlink dish on its own Wi-Fi at 192.168.100.1 to show its status. Nothing else on the local network is contacted. It is not needed to review the app.
>
> Subscriptions: OnMyLead Pro (monthly and annual) is bought on the Pro screen (You > Subscription). Every new account gets a free 30-day Pro trial that needs no payment and never converts to a paid subscription. Restore Purchases and Manage Subscription are on the same screen.
>
> User content: riders can report a ride or a rider and block a rider (Riders list on a ride, or press and hold a chat message). Reports reach the owner's dashboard and are reviewed within 24 hours. Accounts can be deleted from You > Delete Account.
>
> Sign in with Apple is offered next to Google and Facebook sign-in. A rider's Apple, Google or Facebook profile is shown to other riders only if they turn on the Show My Profile switch for that account in the You tab, and only to riders who share a ride or group with them.
>
> Contact Us (You > Contact Us, and onmylead.com/contact) sends a message to the developer.
>
> CarPlay is not included in this version.

## Screenshots

6.9-inch iPhone set (1320 x 2868): `store/app-store/screenshots/` in this repo, uploaded in file order 01 to 08. Apple scales these down for every smaller iPhone, so no other sizes are needed. iPad is off, so no iPad screenshots.

## Export compliance

`ITSAppUsesNonExemptEncryption` is false in app.json: the app only uses HTTPS through Apple's own networking, so uploads skip the encryption question.
