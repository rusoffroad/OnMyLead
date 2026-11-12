import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { storeLink } from '@/lib/found-us';
import { APP_STORE_URL, COMPANY, PLAY_STORE_URL, PRO_PRICES, RUS_URL, SHOWCASE_3D_TERRAIN, SHOWCASE_COMMENT_REPLIES, SHOWCASE_EMERGENCY_SIREN, SHOWCASE_GROUP_PHOTOS, SHOWCASE_INTERSECTION_ZOOM, SHOWCASE_LEADER_TRACKLINE, SHOWCASE_MAP_FEATURES, SHOWCASE_NO_SERVICE, SHOWCASE_PARK_TRAILS, SHOWCASE_PHOTO_CROP, SHOWCASE_REDESIGN_3, SHOWCASE_SPREAD_RULER, TRIAL_DAYS } from '@/constants/site';
import type { SocialProvider } from '@/core/auth-link';
import { FREE_MAP_HOURS } from '@/core/pro';
import { REFERRAL_PRICE, referralsSwitchedOn } from '@/core/referrals';
import { useAppSettings } from '@/lib/app-settings';
import { useSocialProviders } from '@/lib/session';

/**
 * onmylead.com for signed-out visitors: what the app does on iPhone, iPad and Android, how a group ride works, and what
 * Free and Pro include. Plain HTML and CSS (this file only builds for the web), so the page can
 * use real headings, links and media queries. Signed-in riders on the web get the app instead.
 *
 * The photos in /showcase/photos are U.S. Bureau of Land Management pictures from the Imperial
 * Sand Dunes and Johnson Valley, which are in the public domain (sources in showcase/photos/SOURCES.md).
 */
/**
 * True once an iPad or Android tablet build is in a store. Until then the tablet section stays
 * hidden, so the site never offers a device riders can't get yet.
 */
const TABLETS_LIVE = true;

type Route = '/sign-in' | '/ride/new' | '/terms' | '/rider-agreement' | '/privacy' | '/support' | '/contact';

export function Showcase() {
  // Only the sign-in choices that are switched on, so the page never promises one that isn't.
  const signUpWith = signUpChoices(useSocialProviders('ios'));
  // Refer a Friend shows only while the owner has it switched on (Admin > Settings).
  const referralsOn = referralsSwitchedOn(useAppSettings().settings.flags);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // The header sits clear over the hero photo and turns solid once the page moves.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 24);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Section links scroll the page's own scroller; the URL stays clean for the app's router.
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  const go = (href: Route) => (e: MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <div className="oml" ref={scroller}>
      <Head>
        <title>OnMyLead: the Group Ride App for iPhone, iPad and Android</title>
        <meta
          name="description"
          content="Create a ride, bring your crew and keep everyone together on the trail. Live group map, Ride Bubble alerts, ride chat, Bluetooth Sharing with no service and more. Free on iPhone and Android phones, with Pro for the riders who lead and for iPad, Android tablets and the website."
        />
      </Head>
      <style>{CSS}</style>

      <header className={scrolled ? 'bar solid' : 'bar'}>
        <a className="brand" href="/" aria-label="OnMyLead home">
          <img src="/showcase/logo-lockup.png" alt="OnMyLead" width={158} height={36} />
        </a>
        <nav aria-label="Sections">
          {SHOWCASE_NO_SERVICE ? <a href="#no-service" onClick={jump('no-service')}>No Service</a> : null}
          <a href="#new" onClick={jump('new')}>{SHOWCASE_REDESIGN_3 ? 'New in 3.0' : 'New in 2.1'}</a>
          <a href="#how" onClick={jump('how')}>How It Works</a>
          <a href="#plan" onClick={jump('plan')}>Plan on the Web</a>
          <a href="#features" onClick={jump('features')}>Features</a>
          <a href="#pricing" onClick={jump('pricing')}>Pricing</a>
          {/* A full page load: the Help Center is static pages, not a screen of the app. */}
          <a className="nav-help" href="/help">Help</a>
        </nav>
        <div className="bar-actions">
          <a className="btn btn-line btn-small" href="/sign-in" onClick={go('/sign-in')}>Sign In</a>
          <a className="btn btn-red btn-small bar-get" href="#download" onClick={jump('download')}>Get the App</a>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-photo" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <h1 id="hero-title">Ride Together.<br />Get Home Together.</h1>
            <p className="lede">
              The group ride app for every machine on the trail. Create a ride, bring your crew, and see everyone on
              one live map, with an alert the moment someone falls behind.
            </p>
            <div className="hero-actions">
              <StoreButton onSoon={jump('download')} />
              <PlayButton />
              <a className="btn btn-glass" href="/ride/new" onClick={go('/ride/new')}>Create a Ride on the Web</a>
            </div>
            <p className="hero-note">
              Free to download and ride. Pro is {PRO_PRICES.monthly} a month or {PRO_PRICES.annual} a year, and every
              new account gets {TRIAL_DAYS} days of Pro with no card.
            </p>
            {SHOWCASE_REDESIGN_3 ? (
              <a className="hero-new" href="#new" onClick={jump('new')}>
                <b>New in 3.0</b> A whole new look, with Map Mode up front.
              </a>
            ) : SHOWCASE_NO_SERVICE ? (
              <a className="hero-new" href="#no-service" onClick={jump('no-service')}>
                <b>New in 2.1</b> No service? Your group still hears you, over Bluetooth.
              </a>
            ) : null}
          </div>
          <div className="hero-phone">
            <figure className="phone">
              <img src={`/showcase/${v3('group-map')}.webp`} alt="Ride Mode’s live group map: every rider’s dot along the trail on satellite imagery, the leader’s bigger blue dot out front, and the group spread under the rider line" width={786} height={1704} />
            </figure>
          </div>
        </div>
        <p className="machines">
          Built for SXS/UTV, ATV, Dirt Bike, Motorcycle, Jeep/4x4, Truck, Overland Rig, Snowmobile and Car Club rides.
        </p>
      </section>

      {SHOWCASE_NO_SERVICE ? <NoService /> : null}

      <PromoVideo />

      {SHOWCASE_REDESIGN_3 ? <NewIn3 /> : <NewIn2 />}

      <main>
        <section id="how" className="how" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">How a Group Ride Works</h2>
          <p className="section-lede">From the trailhead to the last rider home, in five steps.</p>
          <ol className="steps">
            <Step
              n={1}
              shot="create"
              alt="Create a Ride with The Route set to Mapped, next to Freeride, and the vehicles welcome"
              title="Create a Ride"
              text="Pick the day on a calendar and tap the meeting time (no typing), set the meeting point, difficulty and which machines are welcome, and choose public, private or approval-only. Then pick Mapped, search the trailhead or area to jump the map there, and tap along the trail so the route snaps to it, or import a GPX file, or pick Freeride and everyone follows the leader."
              points={['Search parks, trailheads, towns or a street address for the meeting spot', 'Route miles checked against every machine’s fuel range', 'Hand the lead to another rider at any point']}
            />
            <Step
              n={2}
              shot="find"
              alt={SHOWCASE_REDESIGN_3 ? 'The Rides tab: Rides Near You with a place search, a map of Utah and the Home, Rides, Map Mode, Events and Social tabs' : 'Find a Ride with a place search, a map of Utah and the Rides, Find, Groups and You tabs'}
              title="Bring Your Crew"
              text="Send the ride by link, text, email or its QR code. Friends see a preview before they make an account, and riders can find public rides near them, by state, or near a park or trailhead they search for."
              points={['Riding Groups invite your whole crew in one tap and have their own group chat', 'Follow This Leader to hear about their next public ride', 'Exact meeting spot only shows to riders who join']}
            />
            <Step
              n={3}
              shot="live"
              alt="Ride Mode showing every rider in running order on the route line, a Full Map button, a separated rider alert and big status buttons"
              title="Ride Together"
              text="Ride Mode puts the group on one screen. Every rider’s dot sits on the route line in running order, so the leader sees everyone from the front to the rear. On a Freeride with no mapped route, the line shows the group behind the leader and how spread out it is. On the map, a small arrow on each moving rider’s dot, yours included, shows which way they’re heading, and Ride Bubble warns everyone when someone drops back or stops moving. Riders glide smoothly between updates, and the controls sit in one clean panel: three quick replies, More for every status, and EMERGENCY always one tap away."
              points={['Glove-sized buttons for On My Way, Flat Tire, Need Fuel and Regroup', 'Every tap notifies the group, shows who got it, and cancels in one tap', 'Type your own message to the group when the buttons don’t cover it, and save the ones you send often', 'Full Map on every map gives you the whole screen (tap it or swipe the panel down), with EMERGENCY one tap away and a swipe up to bring the buttons back', 'Follow Me keeps the map moving with you as you ride: drag to look around, one tap to follow again', ...(SHOWCASE_INTERSECTION_ZOOM ? ['Every rider’s dot has the arrow built in, the leader in blue and the tail gunner in violet, and the map zooms in at intersections so you see the turn, then back out'] : []), ...(SHOWCASE_LEADER_TRACKLINE ? ['A line in the leader’s blue shows exactly where the leader went, and when they cross back over it or double back, the older pass fades so the fresh line stands out'] : []), ...(SHOWCASE_SPREAD_RULER ? ['A measuring line under the rider line shows how far the last rider is behind the leader, with ticks every round step, even over Bluetooth with no service'] : [])]}
            />
            <Step
              n={4}
              shot="waypoints"
              alt="The ride’s waypoints map: numbered planned stops tagged fuel and food, a shared Washout hazard triangle, a gate, a water crossing and a camp only you see"
              title="Mark the Trail"
              text="Press and hold the map to drop a waypoint with one of 15 symbols: camp, fuel, water, food, a gate, a trailhead, a water crossing, a hazard and more, with a note. The leader chooses Everyone on the Ride or Just Me, and everyone else’s waypoints stay their own."
              points={['Shared waypoints show on every rider’s map', 'Every symbol has its own drawing, easy to read for color-blind riders, and hazards stand out as triangles', 'Planned stops show what they’re for right on the stop sign', 'Never public: only riders on the ride see shared ones']}
            />
            <Step
              n={5}
              shot="chat"
              alt="Ride chat with two quick polls, Lunch Stop and How’s the Pace"
              title="Talk Without Typing"
              text="Ride chat goes to everyone or just the leader. Announcements are read aloud and pinned, and quick polls settle lunch and the pace with one tap."
              points={['Every message shows Sending, then Sent, or Not Sent with a Retry button', 'Mark your own message Resolved, or Clear it for everyone', 'Pop-ups you can dismiss, and notification settings with quiet hours']}
            />
          </ol>
        </section>
      </main>

      <section className="band band-dust" aria-labelledby="bubble-title">
        <div className="band-inner bubble-grid">
          <div className="band-copy">
            <h2 id="bubble-title" className="section-title">Nobody Gets Left at the Last Turn</h2>
            <p>
              Ride Bubble draws a circle around the group. When a rider drops out of it or stops moving, everyone gets
              the same alert with how far back they are, and the leader can call a Regroup in one tap.
            </p>
          </div>
          <Convoy />
        </div>
      </section>

      <main>
        <section id="plan" className="plan-web" aria-labelledby="plan-title">
          <div className="plan-copy">
            <h2 id="plan-title" className="section-title">Plan It on the Big Screen</h2>
            <p>
              Sign in at onmylead.com to create a ride from your computer. Click the map to drop the meeting point, click
              along the trail and the route snaps to it, bends and switchbacks included, then add numbered planned stops. Everything is in the OnMyLead app on
              your phone or tablet the moment you save.
            </p>
            <ul className="ticks">
              <li>Search a park, trailhead or town by name to jump the map there, for the route or the stops</li>
              <li>Follow Trails, or Straight Line where nothing is mapped</li>
              <li>Drag a point to move it, or press Ctrl+Z to undo</li>
              <li>Fold the route tools away to see more map</li>
              <li>Drawing a route, waypoints and importing a GPX track are Pro. Freeride rides are free.</li>
            </ul>
            <a className="btn btn-red" href="/ride/new" onClick={go('/ride/new')}>Create a Ride on the Web</a>
            <p className="plan-small">You’ll sign in first, then go straight to Create a Ride. Ride Mode and live tracking stay in the app on your phone or tablet.</p>
          </div>
          <figure className="browser">
            <div className="browser-bar" aria-hidden="true"><i /><i /><i /><span>onmylead.com</span></div>
            <img src="/showcase/web-route.webp" alt="Drawing a 3.8 mile route on Engineer Pass Road on onmylead.com: four clicks, and the route follows every switchback of the trail" loading="lazy" width={1600} height={1000} />
          </figure>
        </section>

        {TABLETS_LIVE ? (
          <section id="tablet" className="tablet-band" aria-labelledby="tablet-title">
            <figure className="tablet-frame">
              <img src="/showcase/tablet-ride-mode.webp" alt="Ride Mode on a tablet held sideways: the riders down the left, the live map and route in the middle, and the status buttons on the right" loading="lazy" width={1600} height={1200} />
            </figure>
            <div className="plan-copy">
              <h2 id="tablet-title" className="section-title">The Whole Ride on One Screen</h2>
              <p>
                On an iPad or an Android tablet the map fills the screen. Every rider sits in a list down the side with how fresh their
                spot is, and your buttons stay on the other side, so the leader sees the group, the route and the controls at once.
                Tablets are part of Pro; joining a ride and Ride Mode work free on any device.
              </p>
              <ul className="ticks">
                <li>Hold it upright or sideways; the layout follows</li>
                <li>Swipe the riders list or the buttons away to see more map</li>
                <li>The ride page keeps the details beside the map, riders and chat</li>
                <li>Same account, same rides and the same Pro on your phone and tablet</li>
              </ul>
            </div>
          </section>
        ) : null}

        <section className="qr" aria-labelledby="qr-title">
          <figure className="phone qr-phone">
            <img src="/showcase/qr.webp" alt="A ride’s full-screen QR code with its invite code and a Share QR Code button" loading="lazy" width={786} height={1704} />
          </figure>
          <div className="qr-copy">
            <h2 id="qr-title" className="section-title">Scan to Join</h2>
            <p>
              Every ride has its own QR code. Hold up your phone at the trailhead and riders scan it with their camera to
              land right on the ride in OnMyLead, or get the app if they don’t have it yet. Anyone on the ride can send
              the code by text or email too, and organizers can pick a code that’s easy to say, like MOAB-2026.
            </p>
            <p className="qr-small">The code only opens the ride’s invite. No location is ever in it.</p>
            <InviteCode />
          </div>
        </section>

        <section className="qr crew" aria-labelledby="crew-title">
          <div className="qr-copy">
            <h2 id="crew-title" className="section-title">Your Crew’s Group Text</h2>
            <p>
              Every riding group has its own chat. Plan Saturday’s ride, find a seat on someone’s trailer, and swap the
              stories after. Link a message to a ride and it carries a ticket for that ride, so the group can pull up
              everything said about it in one tap.
            </p>
            <ul className="ticks">
              <li>Only people in the group can read it or post</li>
              <li>Notifications for the whole group, or mute one chat</li>
              <li>Every message shows Sending, then Sent, or Retry</li>
            </ul>
          </div>
          <figure className="phone qr-phone">
            <img src="/showcase/group-chat.webp" alt="A riding group’s chat with messages linked to a ride happening now, an upcoming ride and one that’s over" loading="lazy" width={786} height={1704} />
          </figure>
        </section>

        <section className="qr" aria-labelledby="nav-title">
          <figure className="phone qr-phone">
            <img src={`/showcase/${v3('navigate')}.webp`} alt="Map Mode on a phone: a satellite trail map with a rider-mapped trail in mint dots, the Explore, Record and Draw tabs, and speed with elevation, heading, trip miles and moving time" loading="lazy" width={786} height={1704} />
          </figure>
          <div className="qr-copy">
            <h2 id="nav-title" className="section-title">Map Mode When It’s Just You</h2>
            <p>
              Not every ride is a group ride. Map Mode is your offroad map for the rest, one tap from any screen: every trail and road with your speed,
              elevation, heading, trip miles and moving time, a recorder that draws your line as you ride, and Map a Custom Trail to draw one that isn’t marked
              anywhere. Track Line shows exactly where you’ve been, a new colour each day. Keep your trails private, or share
              them with every rider.
            </p>
            <ul className="ticks">
              <li>Shared trails carry a name, a difficulty, the vehicles that fit, photos and named spots like ledges and crossings</li>
              <li>Rider trails show as mint dots, so you always know who mapped what</li>
              <li>Riders rate each trail’s quality and accuracy, and bad lines drop off the map</li>
              <li>Turn any trail into a group ride’s route in one tap</li>
              <li>Sign in on your iPhone, iPad, Android phone or tablet and your trails and settings are there, backed up privately to your account</li>
            </ul>
            <p className="qr-small">Map Mode is free for 8 hours a month (never counted on a group ride) and unlimited with Pro. Drawing, recording, saving, rating, Track Line, named spots, sharing and group rides on your trails are Pro. Shared trails show in full, and Hide My Start leaves off the first and last 200 meters of a recording that starts at home.</p>
          </div>
        </section>
      </main>

      <section id="features" className="band band-night" aria-labelledby="signal-title">
        <div className="band-inner signal">
          <div className="band-copy">
            <h2 id="signal-title" className="section-title">Made for Where the Signal Ends</h2>
            <p>
              Trails rarely have service, so OnMyLead plans for it. Live positions need a signal, so every dot says how
              fresh it is: a bold white ring when it’s live, a thin grey ring when it only marks where a rider was last seen, so a stale dot
              never reads as “they’re right here.”
            </p>
            <ul className="ticks">
              <li><b>Trails on the Map.</b> Bold trail lines with their names on the map, showing from about 15 miles across: public land trails and roads, plus OpenStreetMap trails in off-road parks like Hidden Falls. Closed trails and roads show in red, from Forest Service and BLM travel plans and seasons. Over satellite or topo.</li>
              {SHOWCASE_MAP_FEATURES ? (
                <li><b>Map Settings.</b> One Map Settings button in the top-left corner of every riding map, level with the compass and on screen even in Full Map, opens everything: the map style, big switches for streets and roads, off-road trails, hiking trails and land boundaries, how the map follows you (zoom out at the edge, zoom in at intersections), your own dot’s look and size (a red, white and blue 3D dome by default), and the map’s own buttons like the tilt meter and music. Fine-tune what the map shows: highways and paved roads in blue, dirt roads, street-legal-only roads, off-road trails, width-limited trails, and hiking trails in their own pink dash-dot so you never mistake one for a ride. Turn on national forests, BLM land, national and state parks, and Texas property lines, then tap the map to see whose land you’re on.</li>
              ) : null}
              {SHOWCASE_PARK_TRAILS ? (
                <li><b>Offroad Park Trails.</b> The trails of Hidden Falls, Katemcy Rocks, Hollister Hills, Hungry Valley, Ocotillo Wells, Interlake, SMORR and about fifty more parks and OHV areas, drawn on every map in the park’s own levels: green for 1 and 2, blue 3, white 4, red 5, with the park’s name from far out and trail names up close. Tap one for its level and length.</li>
              ) : null}
              {SHOWCASE_3D_TERRAIN ? (
                <li><b>3D Terrain.</b> Pick it in Map Settings in Ride Mode and Map Mode to see satellite on the real shape of the ridges and canyons, with contour lines and peak heights in feet. Tilt and turn it, and save it in Offline Maps for no-signal riding.</li>
              ) : null}
              <li><b>Will It Fit?</b> Tap a trail to see its width limit: 50 inch Forest Service trails, and widths riders add to any public trail. Add your machine’s width in the Garage and the card tells you if it fits.</li>
              <li><b>Routes That Follow the Trail.</b> Tap a few points and the route runs along the trail between them, worked out on your phone, even with no signal in an area you’ve downloaded.</li>
              <li><b>Offline Maps (Pro).</b> Save the area and its trails before you leave, and the map works with no bars.</li>
              <li><b>The Route Stays on Your Phone.</b> Once you’ve seen it, it’s there when signal drops.</li>
              <li><b>A Family Link.</b> People at home follow along on a read-only page, no app needed.</li>
              <li><b>Bluetooth Sharing, New in 2.1.</b> With no service, riders close by on the same ride still pass spots, status taps and EMERGENCY alerts phone to phone over Bluetooth, about 100 to 300 feet, encrypted for your ride only. The first phone to get a bar sends it all on. Spots, taps and messages are Pro; EMERGENCY goes out on every plan.</li>
            </ul>
          </div>
          <figure className="signal-map">
            <img src="/showcase/map.webp" alt="Satellite trail map with numbered trails and riders, one marked as last seen two minutes ago" loading="lazy" width={1000} height={1498} />
          </figure>
        </div>
      </section>

      <main>
        <section className="more" aria-labelledby="more-title">
          <h2 id="more-title" className="section-title">Everything Else in Your Pocket</h2>
          <div className="more-grid">
            <div className="more-list">
              <Feature title="Nothing Buried">Four tabs along the bottom: Rides, Find, Groups and You. Every ride opens in four parts, Details, Map, Riders and Chat, with what to do next right under its name. Any sheet swipes down to close, and times take a few taps, no typing.</Feature>
              <Feature title="Dark, Light or Your Own Theme">Ride in the dark Night Navy look, switch to Light for bright sun, or let it match your phone. Pick Night Navy, Carbon true black, Desert or Forest. Color Blind Mode swaps rider status, trail and Track Line colors for ones color blind riders can tell apart, with a symbol on every rider who needs a look.</Feature>
              <Feature title="In Your Language">OnMyLead speaks English, Español, Português, Français, Deutsch, Italiano, Русский, 中文, 日本語, 한국어, हिन्दी and Bahasa Indonesia. It starts in your phone’s language, and the flag at the top of Home switches it any time, on every device you sign in on.</Feature>
              <Feature title="Status Taps You Can Trust">Tap On My Way or Need Fuel and everyone on the ride gets a notification. A light comes on for each rider who has it, and Cancel takes it back with a follow-up so nobody turns around for nothing.</Feature>
              <Feature title="Every Notification in One Place">Missed a ping or swiped it away? Tap the bell on the Rides tab to see the last 30 days, with rider alerts in red so they stand out. Open one, swipe it away, or Clear All, and your phone’s own list clears too.</Feature>
              <Feature title="Ride Day Weather and Daylight">Every upcoming ride shows the meet day’s forecast, with a heads-up for storms, high wind or heat, and a daylight bar that tells you if the group gets back after dark.</Feature>
              <Feature title="Leave Any Time">Leave Ride is one tap away on every ride page and in Ride Mode, and it stops your location sharing for that ride. Organizers hand the ride to another rider and go, instead of cancelling it on everyone. Or swipe a ride left in your list. It always asks first.</Feature>
              <Feature title="Your Music, Without Leaving the Map">Tap the Music button in Ride Mode to pause, skip a song or turn it up, with buttons big enough for gloves. On Android it works with Spotify, YouTube Music, Pandora and the rest; on iPhone and iPad with Apple Music, plus the volume of any app. Don’t want it? Hide it.</Feature>
              <Feature title="CarPlay">Plug your iPhone into a CarPlay truck or Jeep and your ride is on the car screen: big buttons for OK, Stopped, Need Fuel, Mechanical Issue and Need Help, your group, Regroup Here for the leader, and EMERGENCY. When a rider falls behind or needs help, it pops up on the dash. Riding solo, Map Mode shows your speed, elevation, heading and the trail you’re following. Coming next: the ride’s messages on the car screen, read out loud with a tap, and one-tap replies. CarPlay comes with Pro.</Feature>
              <Feature title="Edit Ride Details, New in 2.1">Plans change. The organizer changes the name, day, time, meeting point or any detail from the ride page, on the phone or at onmylead.com. Everyone on the ride is told about a new time or meeting spot, and the ride page shows what changed.</Feature>
              <Feature title="Scout: Places to Ride, New in 2.1">Find a new place to ride. Scout, on the Find tab, shows off-road parks, OHV areas, trail systems, trailheads and motocross tracks around you, 250 miles out to start and anywhere from 10 to 1,000 on the slider. Each place has directions, the public rides coming up there and Create a Ride Here. Places come from the Forest Service, BLM and OpenStreetMap, and riders suggest the ones we’re missing.</Feature>
              <Feature title="Ride Again">Ran a great ride? One tap copies it, meeting point and route included. Pick the new day and send the invite.</Feature>
              <Feature title="Planned Stops">The leader marks where the whole ride will stop for fuel, lunch or camp, with a time. Everyone on the ride sees them numbered on the map, in order, and nobody else does.</Feature>
              <Feature title="Directions in Apple Maps or Google Maps">Search a street address, a trailhead or a town for the meeting point. One tap opens turn-by-turn on the roads to the meeting point, the destination, a waypoint or along the route.</Feature>
              <Feature title="Garage and Fuel Range">Add your machines with photos and every part of the build. Your tank, extra fuel and mileage give a full range, a safe turnaround and a safe trip.</Feature>
              <Feature title="Trip Planner">Packing checklists for each trip, linked to the ride and the machine you’re taking.</Feature>
              <Feature title="Ride Summary and Ride Card">After the ride, see the miles and the group’s totals, then share a ride card.</Feature>
              <Feature title="Badges and Ranks">Earn Bronze, Silver and Gold badges for leading rides, riding tail gunner, riding with your crew and racking up miles, plus the trails you share and rate. Your levels add up to a rank from Rookie to Legend, and they’re earned from real GPS tracks, so nobody can fake one. Riders who represent OnMyLead wear the blue Brand Ambassador badge.</Feature>
              <Feature title="Badge Leaderboard">See where you rank against riders everywhere, in your country or in your state, by the badge levels you’ve earned. Pick where you ride from, or switch off Show Me to stay off the board. It only ever shows your state or country, never where you are.</Feature>
              <Feature title="Out Riding">At a park for the weekend? Switch on Out Riding to see which riders you know are out near you, or anyone nearby who chose the same, and message them. Riders see roughly how far away you are, never where, and it turns itself off.</Feature>
              <Feature title="Your Feed">See what your friends, the leaders you follow and your riding groups have been riding, the badges they earned and the trails they shared, right on Home. Pick whose posts you see and who sees yours, from friends only to nobody.</Feature>
              <Feature title="Social: Like, Comment and Post">Like any ride, badge, trail or post in your Feed, and open Social to see all your friends’ activity and every comment. Pro riders post ride reports and photos to their profile, comment, and share their rides and badges to Facebook, Instagram or X with one tap. Tap anyone’s picture to see it full size.{SHOWCASE_COMMENT_REPLIES ? ' Like any comment, reply to keep the conversation going, and see friends’ photos right in your Feed.' : ''} Your location never goes in a post or a share.</Feature>
              <Feature title="Friends">Add the riders you ride with as friends, or share your friend link. Friends see each other when they’re out riding nearby and can message any time, without ever sharing where they are.</Feature>
              <Feature title="Profile Pictures">Take a photo or pick one from your library, cropped square and shrunk to a small file. It shows next to your name in rider lists, chat, Messages, Friends and Out Riding, so everyone knows who’s who. No picture? You keep your initial.</Feature>
              {SHOWCASE_GROUP_PHOTOS ? (
                <Feature title="Group Photos">Give your riding group a photo of the crew. Everyone in the group sees it on the group page, in their group list and on Home, and friends you send the group link to see it before they join, so they know it’s your crew.</Feature>
              ) : null}
              {SHOWCASE_REDESIGN_3 ? (
                <>
                  <Feature title="Ride Solo, Then Bring the Group">Map Mode is your own offroad map, and a Solo tag says nobody else sees where you are. When it’s worth sharing, Pro riders tap Make It a Group Ride: the trail you’re following or just recorded becomes the route, where you are becomes the meeting point, and your friends join with a code.</Feature>
                  <Feature title="A Home That’s Yours">Home opens on a satellite map of your area with Map Mode first, then Join a Ride, Start a Ride and Events. Pick which sections show under them, like Out Riding Now, Up Next, Your Group and your Feed, and put them in your order. Your layout follows you to your phone, tablet and onmylead.com.</Feature>
                </>
              ) : null}
              {SHOWCASE_PHOTO_CROP ? (
                <Feature title="Crop Every Photo">Frame every photo before it goes up: your profile picture, group photo, garage, posts, events, trails and bug report screenshots. Drag and zoom it, pick a shape where you can, and tap Use Photo. The same on iPhone, iPad, Android and onmylead.com.</Feature>
              ) : null}
              <Feature title="Pick Your Own Code">Give your ride, riding group or friend link a code that’s easy to say at the trailhead, like MOAB-2026. OnMyLead checks as you type that nobody else has it.</Feature>
              <Feature title="Starlink Page">Plan power for your dish on the trail: watts, battery and solar, plus live status when you’re on its network.{SHOWCASE_REDESIGN_3 ? ' On its Wi-Fi, Home shows a Starlink card with speed, latency, sky blocked and how many devices are connected.' : ''}</Feature>
              <Feature title="Gear from RUS Offroad">Suggestions for what to bring, from the people who build the parts.</Feature>
              <Feature title="Your Location Is Never Public">Share with your ride or with people you pick, for 15 minutes to 8 hours, until an end date up to a year out, or until you turn it off, and stop with one tap. Strangers see a rounded area; the exact meeting spot is only for riders who join.</Feature>
              <Feature title="Tilt Meter and Crash Alert">See your roll and pitch over the map, with a full tilt meter whose axle and wheels lean as you do. Zero it for your mount, set your own limits and get a buzz before a steep side hill, or switch it off with one tap. In Ride Mode, a hard hit or a rollover starts a 30 second I’m OK countdown, and if you don’t answer, your group gets an EMERGENCY alert with your location. It works with no signal and sends once you reconnect. It never calls 911.</Feature>
              <Feature title="Emergency, Never by Accident">Hold Alert My Group and a bar fills while it says Keep Holding, so you know it’s working. Let go early and nothing is sent. When it goes out, every rider on the ride is told, even in quiet hours.{SHOWCASE_EMERGENCY_SIREN ? ' Their phones sound a loud siren until they silence it, including riders in Bluetooth range when there’s no service, so nobody misses it over the engine.' : ''}</Feature>
              <Feature title="Update Heads-Ups">When a fix is out, an Update Available card says so on the home screen, and if your version has a known problem, About This Version tells you what to do until the fix arrives.</Feature>
              <Feature title="Report or Block Any Rider">Press and hold a message, tap a rider, or use Report a Rider on the You tab to report harassment or threats. The OnMyLead team reads the messages you report and can suspend or ban riders who break the rules. A blocked rider’s messages disappear for you, and nobody is told who reported or blocked them.</Feature>
              {referralsOn ? (
                <Feature title="Invite Friends, Both Save">Send your link to a riding buddy who’s new to OnMyLead. When they finish their first ride, you both get your first year of Pro Annual for ${REFERRAL_PRICE.discounted} instead of ${REFERRAL_PRICE.annual}, through the App Store or Google Play.</Feature>
              ) : null}
              <Feature title="Events">Rallies, poker runs and ride weekends on one shareable page: dates, place, photos, an agenda of concerts, raffles and runs, and the group rides to join. Pro riders post them, add co-hosts and pick a Ride Manager for each ride. Anyone can see them and say they’re going, and the app explains when you want an event and when a public ride will do. Events presented by RUS Offroad say so in gold, new in 2.1.</Feature>
            </div>
            <figure className="phone">
              <img src={`/showcase/${v3('vehicle')}.webp`} alt="A Garage machine called Red Rocket with its fuel range and build list" loading="lazy" width={786} height={1704} />
            </figure>
          </div>
        </section>
      </main>

      <Pricing />

      <section id="download" className="download" aria-labelledby="download-title">
        <div className="download-inner">
          <h2 id="download-title">{APP_STORE_URL || PLAY_STORE_URL ? 'Get OnMyLead' : 'Coming Soon to iPhone'}</h2>
          <p>
            {APP_STORE_URL || PLAY_STORE_URL
              ? `Free on iPhone and Android phones; iPad, Android tablets and the website come with Pro. Download it, make your account, and your first ${TRIAL_DAYS} days of Pro start on their own.`
              : 'OnMyLead is in testing on the trail now and heads to the App Store next. Plan your first ride on the web today.'}
          </p>
          <div className="download-actions">
            {APP_STORE_URL || PLAY_STORE_URL ? (
              <>
                {APP_STORE_URL ? (
                  <a className="btn btn-store btn-big" href={storeLink(APP_STORE_URL)}>
                    <AppleMark />
                    <span><small>Download on the</small>App Store</span>
                  </a>
                ) : null}
                <PlayButton big />
              </>
            ) : (
              <>
                <span className="soon" role="note">Coming Soon to the App Store</span>
                <a className="btn btn-red btn-big" href="/ride/new" onClick={go('/ride/new')}>Create a Ride on the Web</a>
              </>
            )}
          </div>
          {signUpWith ? <p className="download-account">Make your account in seconds with {signUpWith}. Using a social account? You choose whether your riding crew sees it.</p> : null}
          <p className="download-sign">
            Already riding with OnMyLead? <a href="/sign-in" onClick={go('/sign-in')}>Sign In</a>
          </p>
        </div>
      </section>

      <footer className="foot">
        <img src="/showcase/logo-lockup.png" alt="OnMyLead" width={140} height={32} loading="lazy" />
        <p>
          Made by <a href={RUS_URL}>RUS Offroad</a>. © {new Date().getFullYear()} {COMPANY}.
        </p>
        <nav aria-label="Legal and account">
          <a href="/terms" onClick={go('/terms')}>Terms of Use</a>
          <a href="/rider-agreement" onClick={go('/rider-agreement')}>Rider Safety Agreement</a>
          <a href="/privacy" onClick={go('/privacy')}>Privacy Policy</a>
          <a href="/help">Help Center</a>
          <a href="/help/release-notes">Release Notes</a>
          <a href="/support" onClick={go('/support')}>Help and Support</a>
          <a href="/contact" onClick={go('/contact')}>Contact Us</a>
          <a href="/sign-in" onClick={go('/sign-in')}>Sign In</a>
        </nav>
        <p className="credit">Photos: U.S. Bureau of Land Management, Imperial Sand Dunes and Johnson Valley.</p>
      </footer>
    </div>
  );
}

/** The hero's main button: the App Store once the app is live, until then a jump to the download section. */
function StoreButton({ onSoon }: { onSoon: (e: MouseEvent) => void }) {
  if (APP_STORE_URL) {
    return (
      <a className="btn btn-store" href={storeLink(APP_STORE_URL)}>
        <AppleMark />
        <span><small>Download Free on the</small>App Store</span>
      </a>
    );
  }
  return (
    <a className="btn btn-store" href="#download" onClick={onSoon}>
      <AppleMark />
      <span><small>Free on iPhone</small>Coming Soon</span>
    </a>
  );
}

/** Google Play, beside the App Store button, once the Android app is listed. */
function PlayButton({ big }: { big?: boolean }) {
  if (!PLAY_STORE_URL) return null;
  return (
    <a className={big ? 'btn btn-store btn-play btn-big' : 'btn btn-store btn-play'} href={storeLink(PLAY_STORE_URL)}>
      <PlayMark />
      <span><small>Get It on</small>Google Play</span>
    </a>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
      <path fill="currentColor" d="M4.2 2.4c-.25.26-.4.67-.4 1.2v16.8c0 .53.15.94.4 1.2l.07.06L13.7 12.2v-.22L4.27 2.33l-.07.07zm12.64 12.97-3.14-3.15v-.22l3.14-3.15.07.04 3.72 2.12c1.06.6 1.06 1.59 0 2.2l-3.72 2.11-.07.05zm-.07.04L13.7 12.1l-9.5 9.5c.35.37.93.42 1.58.05l10.99-6.24M16.77 8.8 5.78 2.55c-.65-.37-1.23-.32-1.58.05l9.5 9.5 3.07-3.3z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z"
      />
    </svg>
  );
}

// The promo film plays muted and inline once it scrolls into view, and pauses when it leaves.
// Sound only comes on when the visitor asks for it; with reduced motion it waits for a tap.
function PromoVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const userPaused = useRef(false);

  useEffect(() => {
    const el = video.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!userPaused.current) el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      userPaused.current = false;
      el.play().catch(() => {});
    } else {
      userPaused.current = true;
      el.pause();
    }
  };
  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted && el.paused) {
      userPaused.current = false;
      el.play().catch(() => {});
    }
  };

  return (
    <section id="watch" className="watch" aria-labelledby="watch-title">
      <div className="watch-inner">
        <div className="watch-copy">
          <h2 id="watch-title" className="section-title">See It on the Trail</h2>
          <p>
            The crew rolls out, Ride Mode keeps everyone on one screen, one tap tells the group you are on your way, and
            a quick poll settles lunch. Then everyone rides home together.
          </p>
        </div>
        <figure className="film">
          <video
            ref={video}
            src="/showcase/promo.mp4"
            poster="/showcase/promo-poster.webp"
            width={720}
            height={1280}
            muted
            loop
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={toggle}
            aria-label="OnMyLead promo film: a group of side-by-sides at sunset, Ride Mode and ride chat on a phone mounted in the cab, and the OnMyLead logo"
          />
          <button type="button" className={playing ? 'film-play hide' : 'film-play'} onClick={toggle} aria-label={playing ? 'Pause the film' : 'Play the film'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          </button>
          <div className="film-bar">
            {playing ? <button type="button" className="film-btn" onClick={toggle}>Pause</button> : <span />}
            <button type="button" className="film-btn" onClick={toggleSound} aria-pressed={!muted}>
              {muted ? 'Sound On' : 'Sound Off'}
            </button>
          </div>
        </figure>
      </div>
    </section>
  );
}

function Step({ n, shot, alt, title, text, points }: { n: number; shot: string; alt: string; title: string; text: string; points: string[] }) {
  return (
    <li className="step">
      <figure className="phone">
        <img src={`/showcase/${v3(shot)}.webp`} alt={alt} loading="lazy" width={786} height={1704} />
      </figure>
      <div className="step-copy">
        <span className="step-n" aria-hidden="true">{n}</span>
        <h3>{title}</h3>
        <p>{text}</p>
        <ul className="ticks">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    </li>
  );
}

/**
 * The 3.0 screens (store/tools/web-shots, rendered from the app's code with sample riders) replace
 * the 2.x ones once 3.0 is live: `name-3.webp` sits beside `name.webp` until SHOWCASE_REDESIGN_3 is on.
 * Remake them with store/tools/web-shots/showcase.sh.
 */
const FRESH_3 = new Set(['group-map', 'find', 'live', 'navigate', 'vehicle']);
const v3 = (name: string) => (SHOWCASE_REDESIGN_3 && FRESH_3.has(name) ? `${name}-3` : name);

// The headline features of OnMyLead 3.0, each with the real screen. Pro features say so.
const NEW_IN_3 = [
  { shot: 'home-3', title: 'A New Home', text: 'A satellite map of your area up top, Map Mode first, then Join a Ride, Start a Ride and Events, with who’s out riding and what’s up next.', alt: 'The 3.0 Home: a satellite map header, the blue Map Mode banner, the red Join a Ride card with its code box, and Start a Ride and Events tiles' },
  { shot: 'map-mode-3', title: 'Ride Solo, Then Bring the Group', text: 'Map Mode is your own offroad map, tagged Solo. When it’s worth sharing, Make It a Group Ride turns your spot into the meeting point (Pro).', alt: 'Map Mode on a solo ride: the Solo tag, speed, elevation, trip miles and the blue Make It a Group Ride card' },
  { shot: 'ride-mode-3', title: 'Ride Mode, Rebuilt', text: 'Bigger status buttons, alerts you can act on, Regroup Here and EMERGENCY always one tap away at the bottom.', alt: 'Ride Mode with a separated rider alert, a Flat Tire alert, status buttons, Regroup Here and the red EMERGENCY bar' },
  { shot: 'rides-3', title: 'Rides Near You', text: 'Public rides on a map and in cards with the trail, the difficulty and the machines welcome, near you or by state.', alt: 'The Rides tab: a map of Utah with ride pins and ride cards with satellite thumbnails' },
  { shot: 'events-3', title: 'Events', text: 'Rallies, poker runs and ride weekends with their photos, who’s going and the group rides inside each one.', alt: 'The Events tab: the Moab Fall Rally with its photo, I’m Going and Share, and more events near you' },
  { shot: 'social-3', title: 'Social', text: 'Your riding groups, the friends who are out riding right now and everyone’s ride reports in one place.', alt: 'Social: Riding Groups, a row of friends with the ones out riding ringed, and the activity feed' },
  { shot: 'customize-home', title: 'Customize Home', text: 'Show, hide and reorder the sections under the top cards. Your layout follows you to every device.', alt: 'The Customize Home sheet with switches and up and down arrows for each Home section' },
  ...(SHOWCASE_PHOTO_CROP ? [{ shot: 'photo-crop', title: 'Crop Every Photo', text: 'Drag and zoom every photo before it goes up, and pick a shape where you can.', alt: 'The Crop Photo screen with a desert photo inside the frame, shape choices and Use Photo' }] : []),
];

function NewIn3() {
  return (
    <section id="new" className="new2" aria-labelledby="new-title">
      <div className="new2-inner">
        <h2 id="new-title" className="section-title">New in OnMyLead 3.0</h2>
        <p className="section-lede">A whole new look, built to be the offroad map you open first, on iPhone, iPad and Android.</p>
        <ul className="new2-grid">
          {NEW_IN_3.map((f) => (
            <li key={f.shot} className="new2-card">
              <figure className="phone">
                <img src={`/showcase/${f.shot}.webp`} alt={f.alt} loading="lazy" width={786} height={1596} />
              </figure>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// The headline features of OnMyLead 2.1, each with the real screen (rendered from the app's code
// with sample riders; remake with store/tools/web-shots/shots.sh, plus the feature threads' shots
// of 3D Terrain, Map Settings and group photos). Pro features say so, and EMERGENCY never needs Pro.
const NEW_IN_2 = [
  { shot: 'bluetooth', title: 'Bluetooth Sharing', text: 'No service? Riders close by keep moving on your map and your taps and messages still get through, phone to phone. Pro, and EMERGENCY goes out on every plan.', alt: 'Ride Mode with no service: the banner says No Service. Sharing With 3 Nearby Phones Over Bluetooth, over the group on the trail' },
  { shot: 'siren', title: 'Emergency Siren', text: 'When a rider sends EMERGENCY or their Crash Alert goes out, every phone on the ride sounds a loud siren until you silence it.', alt: 'The full-screen Emergency Siren: SOS, EMERGENCY, Marcus needs help now, with Show Me Where and Silence Siren' },
  { shot: 'map-settings', title: 'Map Settings and Your Dot', text: 'One button, top left on every riding map: map style, roads, trails and land, how the map follows you, and your own dot (Pro).', alt: 'The Map Settings sheet with Your Dot styles, Dot Size and the Following switches' },
  { shot: '3d-terrain', title: '3D Terrain', text: 'Satellite on the real shape of the ridges and canyons, in Ride Mode and Map Mode. Save it for offline riding too.', alt: 'Map Mode in 3D Terrain: satellite over the hills around Moab, with trails and the rider’s dot' },
  { shot: 'spread', title: 'Group Spread', text: 'A measuring line under the rider line shows how far the last rider is behind the leader, and the leader’s Trackline shows where they went.', alt: 'Ride Mode with ten riders strung out along the trail and the group spread, 5.9 miles, under the rider line' },
  { shot: 'leaderboard', title: 'Badge Leaderboard', text: 'See where you rank in your state, your country or everywhere, by the badges you earned riding. Only ever your state, never where you are.', alt: 'The Leaderboard: your place, 5th of 214 in the United States, and the top riders with their badge levels' },
  { shot: 'group-photo', title: 'Group Photos', text: 'Give your riding group a photo of the crew. Everyone sees it; adding one is Pro.', alt: 'The Saturday Crew riding group page with a photo of the crew on the dunes' },
];

function NewIn2() {
  return (
    <section id="new" className="new2" aria-labelledby="new-title">
      <div className="new2-inner">
        <h2 id="new-title" className="section-title">New in OnMyLead 2.1</h2>
        <p className="section-lede">Your group keeps talking where the signal ends, on iPhone, iPad and Android.</p>
        <ul className="new2-grid">
          {NEW_IN_2.map((f) => (
            <li key={f.shot} className="new2-card">
              <figure className="phone">
                <img src={`/showcase/${f.shot}.webp`} alt={f.alt} loading="lazy" width={786} height={1596} />
              </figure>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Bluetooth Sharing (2.1), the headline of the release: with no cell service, phones on the same ride
 * pass spots, status taps, EMERGENCY and messages to each other and along the group. The picture is
 * a strung-out group on a trail: a tap from the tail gunner hops rider to rider up to the leader.
 * Claims match help/articles/bluetooth-sharing.md (range, six hops, not a satellite messenger).
 */
const NS_RIDERS = [
  { x: 120, y: 520, kind: 'sweep' },
  { x: 315, y: 468, kind: 'rider' },
  { x: 495, y: 372, kind: 'rider' },
  { x: 680, y: 300, kind: 'rider' },
  { x: 872, y: 168, kind: 'leader' },
] as const;

const NS_FACTS = [
  { title: 'See Each Other', text: 'Riders near you keep moving on your map, marked Via Bluetooth, while you share your location with the ride.' },
  { title: 'Taps and EMERGENCY', text: 'Flat Tire, Need Fuel or EMERGENCY reaches nearby riders at once. EMERGENCY always goes first, and your card shows who got it and who saw it.' },
  { title: 'Messages, Read Out Loud', text: 'Quick replies and the messages you type in Ride Mode reach nearby riders whole, in any language, and their phones read them out.' },
  { title: 'Passed Down the Line', text: 'Each phone passes on what it hears, up to six phones, so the back of the group reaches the front. The first phone to get a bar sends it all to OnMyLead.' },
];

function NoService() {
  return (
    <section id="no-service" className="ns" aria-labelledby="ns-title">
      <div className="ns-inner">
        <div className="ns-copy">
          <p className="ns-bars" aria-hidden="true">
            <svg viewBox="0 0 28 22" width="28" height="22">
              <rect x="1" y="15" width="4" height="6" rx="1" />
              <rect x="8" y="11" width="4" height="10" rx="1" />
              <rect x="15" y="6" width="4" height="15" rx="1" />
              <rect x="22" y="1" width="4" height="20" rx="1" />
              <path d="M2 2 L26 20" />
            </svg>
            No Service
          </p>
          <h2 id="ns-title" className="ns-title">No Service?<br />Your Group Still Hears You.</h2>
          <p>
            Out past the last bar, OnMyLead phones on the same ride talk to each other over Bluetooth. Riders near you
            keep moving on your map, and a status tap, a message or an EMERGENCY still gets through. Every phone passes
            it along, so the rider at the back reaches the leader through the riders in between.
          </p>
          <p className="ns-small">
            New in 2.1 with OnMyLead Pro (every new account gets {TRIAL_DAYS} days of Pro free). On every plan, phones
            pass it all along and EMERGENCY goes out over Bluetooth. iPhone, iPad and Android all work together, and
            it’s encrypted so only riders on your ride can read it.
          </p>
        </div>
        <figure className="ns-map">
          <svg viewBox="0 0 1000 640" role="img" aria-label="Five riders strung out along a trail with no cell service. A Flat Tire tap from the tail gunner hops phone to phone, rider to rider, up to the leader.">
            <path className="ns-trail" d="M -20 560 C 60 540, 90 520, 120 520 S 250 500, 315 468 S 430 380, 495 372 S 610 330, 680 300 S 800 200, 872 168 S 960 120, 1030 100" />
            {NS_RIDERS.map((r, i) => (
              <circle key={`range${i}`} className="ns-range" cx={r.x} cy={r.y} r={140} />
            ))}
            {NS_RIDERS.slice(1).map((r, i) => (
              <line key={`hop${i}`} className="ns-hop" style={{ animationDelay: `${0.35 + i * 0.6}s` }} x1={NS_RIDERS[i].x} y1={NS_RIDERS[i].y} x2={r.x} y2={r.y} pathLength={1} />
            ))}
            {NS_RIDERS.map((r, i) => (
              <circle key={`ping${i}`} className="ns-ping" style={{ animationDelay: `${i * 0.6}s` }} cx={r.x} cy={r.y} r={140} />
            ))}
            {NS_RIDERS.map((r, i) => (
              <circle key={`dot${i}`} className={`ns-dot ns-${r.kind}`} cx={r.x} cy={r.y} r={r.kind === 'leader' ? 24 : r.kind === 'sweep' ? 20 : 16} />
            ))}
          </svg>
          <div className="ns-card ns-card-from">
            <b>Flat Tire</b>
            <span>Reached Ray over Bluetooth</span>
          </div>
          <div className="ns-card ns-card-to">
            <b>Jess: Flat Tire</b>
            <span>Via Bluetooth</span>
          </div>
          <figcaption>One tap from the tail gunner, carried rider to rider to the leader.</figcaption>
        </figure>
        <dl className="ns-facts">
          {NS_FACTS.map((f) => (
            <div key={f.title}>
              <dt>{f.title}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>
        <p className="ns-range-note">
          Bluetooth reaches about 100 to 300 feet between phones in the open, and less through trees, hills and steel,
          so it works best when the group rides close. Riders in between carry it farther. It isn’t a satellite
          messenger and can’t reach 911. <a href="/help/bluetooth-sharing">How Bluetooth Sharing works</a>
        </p>
      </div>
    </section>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="feature">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

// Plan names match the app's Pro screen (core/pro.ts COMPARISON).
const FREE = [
  'Create 1 Ride a Month',
  'Join Unlimited Rides and Follow the Leader',
  'Live Tracking, SOS, Crash Alert and Ride Bubble',
  'Mechanical Issue and Family Tracking Links',
  'Ride Chat',
  `Map Mode: ${FREE_MAP_HOURS} Hours a Month`,
  'Social Feed: See, Like and Read Comments',
  'Badges, Events and Friends',
  'Ride History: Last 5 Rides',
];
const PRO = [
  'Unlimited Rides and Unlimited Map Mode',
  'iPad, Android Tablets and the Website',
  'Draw Routes, Waypoints and Directions',
  'Satellite, Topo and Trail Map Layers',
  'Draw, Record, Save, Rate and Share Trails',
  'Track Line and Named Spots',
  'Group Rides on Your Trails',
  'Import GPX Routes',
  'Offline Maps',
  'Post, Comment and Share to Social Media',
  'Create Events',
  ...(SHOWCASE_NO_SERVICE ? ['Bluetooth Sharing With No Service'] : []),
  'CarPlay',
  SHOWCASE_NO_SERVICE ? 'Saved Riding Groups, Group Photos and Custom Codes' : 'Saved Riding Groups and Custom Codes',
  'Create and Vote on Ride Polls',
  'Your Own Messages and Music Controls',
  'Full Ride History',
  'Advanced Ride Statistics and Premium Cards',
  'Advanced Trip Planning and Garage Build Sheet',
  SHOWCASE_NO_SERVICE ? 'Themes, Light Mode, Natural Voices and Custom Dots' : 'Themes, Light Mode and Natural Voices',
  'Sync Across Devices',
];

function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="pricing" className="pricing" aria-labelledby="pricing-title">
      <div className="pricing-inner">
        <h2 id="pricing-title" className="section-title">Free to Ride. Pro to Lead.</h2>
        <p className="pricing-lede">
          Safety is never behind a paywall. Pro is for the riders who plan and lead the rides.
        </p>

        <div className="billing" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={!annual} className={annual ? '' : 'on'} onClick={() => setAnnual(false)}>Monthly</button>
          <button type="button" role="radio" aria-checked={annual} className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>
            Yearly <span className="save">{PRO_PRICES.annualSavings}</span>
          </button>
        </div>

        <div className="plans">
          <article className="plan" aria-labelledby="plan-free">
            <h3 id="plan-free">Free</h3>
            <p className="price"><span className="amount">$0</span> <span className="per">forever</span></p>
            <p className="plan-note">Everything you need to ride with a group and get everyone home.</p>
            <ul className="ticks">{FREE.map((f) => <li key={f}>{f}</li>)}</ul>
          </article>
          <article className="plan plan-pro" aria-labelledby="plan-pro">
            <div className="plan-head">
              <h3 id="plan-pro">Pro</h3>
              {annual ? <span className="badge">Best Value</span> : null}
            </div>
            <p className="price">
              <span className="amount">{annual ? PRO_PRICES.annual : PRO_PRICES.monthly}</span>{' '}
              <span className="per">{annual ? 'a year' : 'a month'}</span>
            </p>
            <p className="plan-note">
              {annual
                ? `That’s ${PRO_PRICES.annualPerMonth} a month, billed once a year.`
                : `Or ${PRO_PRICES.annual} a year and ${PRO_PRICES.annualSavings.toLowerCase()}.`}
            </p>
            <p className="plan-includes">Everything in Free, Plus:</p>
            <ul className="ticks">{PRO.map((f) => <li key={f}>{f}</li>)}</ul>
          </article>
        </div>

        <div className="trial">
          <b>Every new account gets {TRIAL_DAYS} days of Pro, automatically.</b> No card, nothing to cancel, and it never
          turns into a charge. When it ends you keep everything you made and carry on with Free, and a small{' '}
          <span className="pro-chip" aria-label="Pro">Pro</span> tag marks the extras, so you know what’s Pro before you tap.
        </div>

        <p className="fine">
          Prices in US dollars. Pro is bought in the app and paid through your Apple Account on iPhone and iPad, or your
          Google Play account on Android. It renews automatically until you cancel, which you can do any time in your
          Apple Account settings or in Google Play at least 24 hours before the period ends. The free trial is separate and never charges. See the{' '}
          <a href="/terms" onClick={(e) => { e.preventDefault(); router.push('/terms'); }}>Terms of Use</a> and{' '}
          <a href="/privacy" onClick={(e) => { e.preventDefault(); router.push('/privacy'); }}>Privacy Policy</a>.
        </p>
      </div>
    </section>
  );
}

/** Ride invites work on the web: a code opens the ride's preview page. */
function InviteCode() {
  const [code, setCode] = useState('');
  const clean = code.trim().toUpperCase();
  return (
    <form
      className="invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) router.push(`/r/${encodeURIComponent(clean)}`);
      }}>
      <label htmlFor="invite-code">Got an Invite Code?</label>
      <div className="invite-row">
        <input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. K2M8Q4ZT"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-blue" disabled={clean.length < 4}>Open the Ride</button>
      </div>
    </form>
  );
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------------------------------------
 * Ride Bubble: a group riding a trail inside its bubble. Partway along, one rider stops, their
 * dot goes hollow (last seen) and the bubble turns red with the same alert the app shows.
 * ---------------------------------------------------------------------------------------------- */

const TRAIL = 'M -40 720 C 70 712, 120 600, 240 590 S 400 680, 520 630 S 610 450, 730 455 S 880 580, 1060 430';
const CYCLE_MS = 15000;
/** Fraction of the trail ahead of the leader for each rider in the group (leader first). */
const GROUP = [
  { gap: 0, kind: 'leader' },
  { gap: 0.03, kind: 'rider' },
  { gap: 0.055, kind: 'you' },
  { gap: 0.08, kind: 'rider' },
  { gap: 0.105, kind: 'sweep' },
] as const;
const STRAGGLER_GAP = 0.13;
const STOP_AT = 0.3; // cycle fraction when the straggler stops
const BUBBLE_R = 125;

type Pt = { x: number; y: number };

function Convoy() {
  const path = useRef<SVGPathElement>(null);
  const [frame, setFrame] = useState<{ group: Pt[]; straggler: Pt; center: Pt; behind: boolean; fade: number } | null>(null);

  useEffect(() => {
    const el = path.current;
    if (!el) return;
    const len = el.getTotalLength();
    const at = (f: number) => {
      const p = el.getPointAtLength(Math.max(0, Math.min(1, f)) * len);
      return { x: p.x, y: p.y };
    };
    const draw = (t: number) => {
      const lead = 0.2 + 0.62 * t;
      const group = GROUP.map((g) => at(lead - g.gap));
      // The straggler keeps pace, then slows to a stop where they had the flat.
      const stopLead = 0.2 + 0.62 * STOP_AT;
      const s = t < STOP_AT ? lead : stopLead + 0.02 * (1 - Math.exp(-(t - STOP_AT) * 18));
      const straggler = at(s - STRAGGLER_GAP);
      const center = {
        x: group.reduce((a, p) => a + p.x, 0) / group.length,
        y: group.reduce((a, p) => a + p.y, 0) / group.length,
      };
      const behind = Math.hypot(straggler.x - center.x, straggler.y - center.y) > BUBBLE_R;
      const fade = t < 0.05 ? t / 0.05 : t > 0.94 ? Math.max(0, (1 - t) / 0.06) : 1;
      setFrame({ group, straggler, center, behind, fade });
    };
    if (prefersReducedMotion()) {
      draw(0.7);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      draw(((now - start) % CYCLE_MS) / CYCLE_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const behind = frame?.behind ?? false;
  return (
    <figure
      className="convoy"
      role="img"
      aria-label="A group of riders on a winding trail inside a Ride Bubble. One rider stops behind, and the app alerts the group.">
      <svg viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g className="topo">
          {TOPO.map((d, i) => <path key={i} d={d} />)}
        </g>
        <path d={TRAIL} className="trail-bed" />
        <path ref={path} d={TRAIL} className="trail-line" />
        {frame ? (
          <g style={{ opacity: frame.fade }}>
            <circle
              cx={frame.center.x}
              cy={frame.center.y}
              r={BUBBLE_R}
              className={behind ? 'bubble bubble-alert' : 'bubble'}
            />
            <g className={behind ? 'straggler lost' : 'straggler'}>
              <circle cx={frame.straggler.x} cy={frame.straggler.y} r={14} />
              <text x={frame.straggler.x} y={frame.straggler.y + 42}>Kayla</text>
            </g>
            {GROUP.map((g, i) => {
              const p = frame.group[i];
              if (g.kind === 'leader') {
                return (
                  <g key={i} className="dot-leader">
                    <circle cx={p.x} cy={p.y} r={22} />
                    <text x={p.x} y={p.y + 8}>L</text>
                  </g>
                );
              }
              if (g.kind === 'you') {
                return (
                  <g key={i} className="dot-you">
                    <circle cx={p.x} cy={p.y} r={20} />
                    <text x={p.x} y={p.y + 5}>You</text>
                  </g>
                );
              }
              return <circle key={i} cx={p.x} cy={p.y} r={13} className={g.kind === 'sweep' ? 'dot-sweep' : 'dot-rider'} />;
            })}
          </g>
        ) : null}
      </svg>
      <div className={behind && (frame?.fade ?? 0) > 0.5 ? 'alert show' : 'alert'} aria-hidden="true">
        <b>Kayla is 0.7 miles behind the group.</b> Last moving 2 minutes ago.
        <span className="alert-actions"><span>Navigate</span><span>Regroup</span></span>
      </div>
      <figcaption>Ride Bubble keeps the group together.</figcaption>
    </figure>
  );
}

/** Contour lines for the hero's backdrop, drawn once from a few nested rings. */
const TOPO = (() => {
  const rings: string[] = [];
  const hills = [
    { cx: 210, cy: 250, n: 6, rx: 70, ry: 46, seed: 1 },
    { cx: 820, cy: 230, n: 5, rx: 76, ry: 50, seed: 2 },
    { cx: 560, cy: 820, n: 4, rx: 70, ry: 40, seed: 3 },
  ];
  for (const h of hills) {
    for (let k = 1; k <= h.n; k++) {
      const pts: string[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(a * 3 + h.seed + k * 0.6) + 0.07 * Math.cos(a * 5 + h.seed * 2);
        const x = h.cx + Math.cos(a) * h.rx * k * 0.62 * wobble;
        const y = h.cy + Math.sin(a) * h.ry * k * 0.62 * wobble;
        pts.push(`${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      rings.push(pts.join(' ') + ' Z');
    }
  }
  return rings;
})();

const display = "'BarlowCondensed_800ExtraBold', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const display7 = "'BarlowCondensed_700Bold', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const body = "'Barlow_500Medium', 'Barlow', system-ui, sans-serif";
const body7 = "'Barlow_700Bold', 'Barlow', system-ui, sans-serif";

const CSS = `
.oml {
  --night: #0A1626; --panel: #12223A; --ridge: #1B2F4C; --line: #27406A;
  --red: #E5262E; --blue: #3B86F7; --text: #F1F4F8; --soft: #C9D3E1; --dust: #97A7BE; --sand: #E9B97A;
  --sweep: #B967F0; --rider: #6E7681;
  --wrap: 1180px; --gutter: 28px;
  position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; background: var(--night); color: var(--text);
  font-family: ${body}; font-size: 18px; line-height: 1.55; -webkit-font-smoothing: antialiased; scroll-padding-top: 80px;
}
.oml *, .oml *::before, .oml *::after { box-sizing: border-box; }
.oml img { display: block; max-width: 100%; height: auto; }
.oml a { color: inherit; }
.oml b { font-family: ${body7}; font-weight: 700; }
.oml h1, .oml h2, .oml h3 { font-family: ${display}; font-weight: 800; letter-spacing: 0.005em; }
/* Zero-specificity resets, so each block's own margins win. */
:where(.oml) :where(h1, h2, h3, p, figure) { margin: 0; }
.oml :focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; border-radius: 6px; }
.oml main { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); }
.band-inner, .pricing-inner, .download-inner, .hero-inner { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); position: relative; }

/* Header: clear over the hero photo, solid once the page scrolls. */
.bar { position: sticky; top: 0; z-index: 20; height: 76px; margin-bottom: -76px; display: flex; align-items: center; gap: 28px;
  padding: 0 max(var(--gutter), calc((100% - var(--wrap)) / 2 + var(--gutter)));
  background: linear-gradient(180deg, rgba(6, 13, 23, 0.55), rgba(6, 13, 23, 0)); transition: background-color 0.25s, box-shadow 0.25s; }
.bar.solid { background: rgba(10, 22, 38, 0.94); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 1px 0 rgba(39, 64, 106, 0.6); }
.brand img { height: 36px; width: auto; }
.bar nav { display: flex; gap: 26px; margin-left: 12px; }
.bar nav a { text-decoration: none; color: var(--soft); font-family: ${body7}; font-size: 16px; }
.bar nav a:hover { color: #fff; }
.bar-actions { margin-left: auto; display: flex; align-items: center; gap: 12px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 12px; min-height: 56px; padding: 0 26px; border-radius: 16px; border: 0;
  font-family: ${display}; font-size: 22px; letter-spacing: 0.01em; text-decoration: none; cursor: pointer; transition: transform 0.12s, background-color 0.15s, border-color 0.15s; }
.btn:active { transform: scale(0.98); }
.btn-red { background: var(--red); color: #fff; box-shadow: 0 14px 30px -14px rgba(229, 38, 46, 0.8); }
.btn-red:hover { background: #F2353D; }
.btn-blue { background: var(--blue); color: #fff; }
.btn-blue:disabled { background: var(--ridge); color: var(--dust); cursor: default; }
.btn-line { background: transparent; color: #fff; border: 1.5px solid rgba(241, 244, 248, 0.45); }
.btn-line:hover { border-color: #fff; background: rgba(255, 255, 255, 0.06); }
.btn-glass { background: rgba(10, 22, 38, 0.45); color: #fff; border: 1.5px solid rgba(241, 244, 248, 0.28); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.btn-glass:hover { background: rgba(10, 22, 38, 0.7); border-color: rgba(241, 244, 248, 0.5); }
.btn-small { min-height: 42px; padding: 0 18px; font-size: 18px; border-radius: 12px; }
.btn-big { min-height: 64px; font-size: 26px; padding: 0 34px; }
.btn-store { background: var(--red); color: #fff; padding: 0 26px 0 20px; text-align: left; box-shadow: 0 14px 30px -14px rgba(229, 38, 46, 0.8); }
.btn-store:hover { background: #F2353D; }
.btn-play { background: rgba(10, 22, 38, 0.72); border: 1.5px solid rgba(241, 244, 248, 0.55); box-shadow: none; }
.btn-play:hover { background: rgba(18, 34, 58, 0.92); border-color: #fff; }
.btn-store span { display: flex; flex-direction: column; line-height: 1; font-size: 24px; }
.btn-store small { font-family: ${body7}; font-size: 12px; letter-spacing: 0.02em; opacity: 0.9; margin-bottom: 3px; }

/* Hero: a group at sunset on the Imperial Sand Dunes. */
.hero { position: relative; min-height: min(100vh, 940px); display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; isolation: isolate; }
.hero-photo { position: absolute; inset: 0; z-index: -1; background: #2a1d12 url('/showcase/photos/hero.webp') 60% 55% / cover no-repeat; }
.hero-photo::after { content: ''; position: absolute; inset: 0;
  background:
    linear-gradient(90deg, rgba(8, 17, 30, 0.86) 0%, rgba(8, 17, 30, 0.6) 32%, rgba(8, 17, 30, 0.05) 62%, rgba(8, 17, 30, 0.1) 100%),
    linear-gradient(180deg, rgba(8, 17, 30, 0.35) 0%, rgba(8, 17, 30, 0) 20%, rgba(8, 17, 30, 0) 66%, var(--night) 100%); }
.hero-inner { width: 100%; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: 40px; align-items: end; padding-top: 140px; }
.hero-copy { padding-bottom: 48px; }
.hero h1 { font-size: clamp(60px, 7.4vw, 112px); line-height: 0.9; letter-spacing: -0.01em; text-shadow: 0 2px 30px rgba(0, 0, 0, 0.35); }
.lede { margin-top: 26px; font-size: 21px; line-height: 1.5; color: #DCE3EC; max-width: 31em; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
.hero-note { margin-top: 18px; color: var(--soft); font-size: 16px; max-width: 34em; }
.hero-phone { position: relative; justify-self: end; width: 290px; margin-bottom: 36px; }
.hero-phone .phone { box-shadow: 0 50px 90px -30px rgba(0, 0, 0, 0.9); }
.machines { position: relative; max-width: var(--wrap); width: 100%; margin: 0 auto; padding: 22px var(--gutter) 30px; color: var(--dust); font-family: ${display7}; font-size: 19px; letter-spacing: 0.01em; }

/* One entrance, on load only: the photo settles and the copy and phone come up with it. */
@media (prefers-reduced-motion: no-preference) {
  .hero-photo { animation: settle 2.4s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  .hero-copy > * { animation: rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
  .hero-copy > :nth-child(2) { animation-delay: 0.12s; }
  .hero-copy > :nth-child(3) { animation-delay: 0.22s; }
  .hero-copy > :nth-child(4) { animation-delay: 0.3s; }
  .hero-phone .phone { animation: rise 1.1s 0.25s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
}
@keyframes settle { from { transform: scale(1.08); opacity: 0.4; } to { transform: none; opacity: 1; } }
@keyframes rise { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }

/* No Service (Bluetooth Sharing, 2.1): the release headline, right under the hero. */
.hero-new { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-top: 22px; padding: 10px 16px; border-radius: 12px;
  background: rgba(59, 134, 247, 0.16); border: 1.5px solid rgba(59, 134, 247, 0.55); color: #fff; text-decoration: none; font-size: 17px; }
.hero-new b { color: #8DB8FF; }
.hero-new:hover { background: rgba(59, 134, 247, 0.26); }
.ns { position: relative; padding: 120px 0 40px; isolation: isolate; }
.ns::before { content: ''; position: absolute; inset: 0; z-index: -1;
  background: radial-gradient(60% 55% at 72% 42%, rgba(59, 134, 247, 0.16), rgba(59, 134, 247, 0) 70%); }
.ns-inner { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 32px 56px; align-items: center; }
.ns-bars { display: inline-flex; align-items: center; gap: 10px; color: var(--dust); font-family: ${display7}; font-size: 20px; }
.ns-bars rect { fill: var(--line); }
.ns-bars path { stroke: var(--red); stroke-width: 3; stroke-linecap: round; }
.ns-title { margin-top: 14px !important; font-size: clamp(46px, 5.6vw, 76px); line-height: 0.94; }
.ns-copy > p:not(.ns-bars) { margin-top: 22px; color: #DCE3EC; font-size: 20px; max-width: 30em; }
.ns-copy > .ns-small { margin-top: 14px; color: var(--soft); font-size: 16px; }
.ns-map { position: relative; margin: 0; }
.ns-map svg { display: block; width: 100%; height: auto; overflow: visible; }
.ns-trail { fill: none; stroke: var(--sand); stroke-opacity: 0.55; stroke-width: 10; stroke-linecap: round; stroke-dasharray: 2 18; }
.ns-range { fill: rgba(59, 134, 247, 0.05); stroke: rgba(59, 134, 247, 0.35); stroke-width: 2; stroke-dasharray: 6 10; }
.ns-hop { stroke: #8DB8FF; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 0; filter: drop-shadow(0 0 8px rgba(59, 134, 247, 0.9)); }
.ns-ping { fill: none; stroke: #8DB8FF; stroke-width: 3; opacity: 0; transform-box: fill-box; transform-origin: center; }
.ns-dot { stroke: var(--text); stroke-width: 4; }
.ns-rider { fill: var(--rider); }
.ns-leader { fill: var(--blue); stroke-width: 5; }
.ns-sweep { fill: var(--sweep); }
.ns-card { position: absolute; display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 12px; background: rgba(18, 34, 58, 0.96);
  box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.9); font-size: 15px; line-height: 1.3; color: var(--soft); white-space: nowrap; }
.ns-card b { color: var(--text); font-size: 17px; }
.ns-card-from { left: 0; top: 90%; transform: translateY(-100%); border-left: 5px solid var(--sweep); }
.ns-card-to { right: 0; top: 0; border-left: 5px solid var(--blue); }
.ns-map figcaption { margin-top: 18px; color: var(--dust); font-family: ${display7}; font-size: 18px; }
.ns-facts { grid-column: 1 / -1; margin: 40px 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px; }
.ns-facts > div { border-top: 3px solid var(--blue); padding-top: 16px; }
.ns-facts dt { font-family: ${display}; font-size: 26px; line-height: 1.05; }
.ns-facts dd { margin: 10px 0 0; color: var(--soft); font-size: 16px; line-height: 1.5; }
.ns-range-note { grid-column: 1 / -1; color: var(--dust); font-size: 15px; max-width: 62em; }
.ns-range-note a { color: #8DB8FF; font-family: ${body7}; white-space: nowrap; }
@media (prefers-reduced-motion: no-preference) {
  .ns-hop { stroke-dashoffset: 1; animation: ns-hop 6s linear infinite; }
  .ns-ping { animation: ns-ping 6s ease-out infinite; }
}
@keyframes ns-hop { 0% { stroke-dashoffset: 1; opacity: 1; } 9% { stroke-dashoffset: 0; } 72% { stroke-dashoffset: 0; opacity: 1; } 85%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes ns-ping { 0% { transform: scale(0.12); opacity: 0.9; } 16% { transform: scale(1); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }
@media (max-width: 980px) {
  .ns-inner { grid-template-columns: 1fr; }
  .ns-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
}
@media (max-width: 640px) {
  .ns { padding-top: 80px; }
  .ns-copy > p:not(.ns-bars) { font-size: 17px; }
  .ns-card { font-size: 13px; padding: 8px 10px; }
  .ns-card b { font-size: 15px; }
  .ns-map { display: flex; flex-direction: column; gap: 10px; }
  .ns-map svg { order: 0; }
  .ns-card { position: static; transform: none; align-self: flex-start; }
  .ns-card-from { order: 1; }
  .ns-card-to { order: 2; align-self: flex-end; }
  .ns-map figcaption { order: 3; margin-top: 8px; font-size: 16px; }
  .ns-facts { grid-template-columns: 1fr; gap: 24px; }
}

/* Section titles */
.section-title { font-size: clamp(42px, 5.2vw, 68px); line-height: 0.96; }
.section-lede { margin-top: 14px; color: var(--soft); font-size: 20px; }

/* Promo film: vertical, muted until asked, right under the hero. */
.watch { padding: 110px 0 0; }
.watch-inner { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 72px; align-items: center; }
.watch-copy > p { margin-top: 20px; color: var(--soft); font-size: 20px; max-width: 30em; }
.film { position: relative; margin: 0; aspect-ratio: 9 / 16; border-radius: 28px; overflow: hidden; background: #050D18;
  border: 1px solid rgba(59, 134, 247, 0.28); box-shadow: 0 50px 90px -30px rgba(0, 0, 0, 0.9), 0 0 80px -20px rgba(229, 38, 46, 0.35); }
.film video { display: block; width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
.film-play { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; border: 0;
  background: var(--red); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
  box-shadow: 0 14px 34px -10px rgba(229, 38, 46, 0.85); transition: opacity 0.2s, transform 0.12s; }
.film-play svg { width: 38px; height: 38px; margin-left: 4px; }
.film-play:active { transform: scale(0.96); }
.film-play.hide { opacity: 0; pointer-events: none; }
.film-bar { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; justify-content: space-between; gap: 8px; }
.film-btn { min-height: 40px; padding: 0 16px; border-radius: 12px; border: 1.5px solid rgba(241, 244, 248, 0.3); cursor: pointer;
  background: rgba(10, 22, 38, 0.6); color: #fff; font-family: ${display7}; font-size: 17px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.film-btn:hover { background: rgba(10, 22, 38, 0.82); border-color: rgba(241, 244, 248, 0.55); }
.film-btn[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); }

/* New in 2.1 */
.new2 { padding: 120px 0 20px; }
.new2-inner { max-width: var(--wrap); margin: 0 auto; padding: 0 var(--gutter); }
.new2-grid { list-style: none; margin: 56px 0 0; padding: 0; display: grid; gap: 44px 28px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.new2-card .phone { padding: 7px; border-radius: 34px; }
.new2-card .phone img { border-radius: 27px; display: block; }
.new2-card h3 { margin-top: 22px; font-size: 30px; line-height: 1; }
.new2-card p { margin-top: 8px; color: var(--soft); font-size: 16px; line-height: 1.45; }
@media (max-width: 640px) {
  .new2 { padding-top: 72px; }
  .new2-grid { grid-auto-flow: column; grid-auto-columns: 72%; grid-template-columns: none; overflow-x: auto;
    scroll-snap-type: x mandatory; padding-bottom: 12px; gap: 18px; }
  .new2-card { scroll-snap-align: start; }
}

/* How it works */
.how { padding: 150px 0 40px; }
.steps { list-style: none; margin: 64px 0 0; padding: 0; display: grid; gap: 96px; }
.step { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 72px; align-items: center; }
.step:nth-child(even) { grid-template-columns: minmax(0, 1fr) 280px; }
.step:nth-child(even) .phone { order: 2; }
.step-copy { max-width: 34em; }
.step-n { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px;
  background: var(--red); color: #fff; font-family: ${display}; font-size: 30px; margin-bottom: 18px; }
.step h3 { font-size: clamp(36px, 4vw, 50px); line-height: 1; }
.step-copy > p { margin-top: 14px; color: var(--soft); font-size: 19px; }

.phone { margin: 0; padding: 10px; border-radius: 48px; background: #050D18; border: 2px solid #22395B;
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.03) inset; }
.phone img { border-radius: 38px; width: 100%; }

.ticks { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 10px; }
.ticks li { position: relative; padding-left: 30px; color: var(--text); font-size: 17px; line-height: 1.45; }
.ticks li::before { content: ''; position: absolute; left: 2px; top: 0.36em; width: 14px; height: 8px;
  border-left: 3px solid var(--blue); border-bottom: 3px solid var(--blue); transform: rotate(-45deg); }

/* Full-bleed photo bands */
.band { position: relative; margin-top: 110px; padding: 130px 0; isolation: isolate; overflow: hidden; }
.band::before { content: ''; position: absolute; inset: 0; z-index: -2; background-size: cover; background-repeat: no-repeat; }
.band::after { content: ''; position: absolute; inset: 0; z-index: -1; }
.band-dust::before { background-image: url('/showcase/photos/dust.webp'); background-position: 30% 50%; }
.band-dust::after { background: linear-gradient(180deg, var(--night) 0%, rgba(10, 22, 38, 0.2) 20%, rgba(10, 22, 38, 0.25) 80%, var(--night) 100%),
  linear-gradient(90deg, rgba(10, 22, 38, 0.8) 0%, rgba(10, 22, 38, 0.35) 50%, rgba(10, 22, 38, 0.55) 100%); }
.band-night::before { background-image: url('/showcase/photos/night.webp'); background-position: 50% 40%; }
.band-night::after { background: linear-gradient(180deg, var(--night) 0%, rgba(10, 22, 38, 0.15) 22%, rgba(10, 22, 38, 0.25) 78%, var(--night) 100%),
  linear-gradient(90deg, rgba(10, 22, 38, 0.82) 0%, rgba(10, 22, 38, 0.4) 55%, rgba(10, 22, 38, 0.1) 100%); }
.band-copy > p { margin-top: 20px; color: #DCE3EC; font-size: 19px; max-width: 34em; }
.band .ticks li { color: #DCE3EC; }
.band .ticks b { color: #fff; }

.bubble-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center; }
.convoy { position: relative; margin: 0; aspect-ratio: 5 / 4; border-radius: 28px; overflow: hidden;
  background: rgba(11, 24, 43, 0.86); border: 1px solid rgba(59, 134, 247, 0.25); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.8); }
.convoy svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.topo path { fill: none; stroke: #1A3152; stroke-width: 1.6; }
.trail-bed { fill: none; stroke: #20385C; stroke-width: 36; stroke-linecap: round; }
.trail-line { fill: none; stroke: #4A6894; stroke-width: 3; stroke-dasharray: 2 14; stroke-linecap: round; }
.bubble { fill: rgba(59, 134, 247, 0.07); stroke: rgba(59, 134, 247, 0.55); stroke-width: 2.5; stroke-dasharray: 10 9; transition: fill 0.4s, stroke 0.4s; }
.bubble-alert { fill: rgba(229, 38, 46, 0.08); stroke: rgba(229, 38, 46, 0.85); }
.dot-leader circle { fill: var(--blue); stroke: var(--text); stroke-width: 4; }
.dot-leader text, .dot-you text { fill: #fff; text-anchor: middle; font-family: ${display}; }
.dot-leader text { font-size: 24px; }
.dot-you circle { fill: var(--red); stroke: var(--text); stroke-width: 3.5; }
.dot-you text { font-size: 15px; }
/* Riders as the app draws them: a bold white ring around a dark centre. */
.dot-rider { fill: var(--night); stroke: #fff; stroke-width: 4; }
.dot-sweep { fill: var(--sweep); stroke: var(--night); stroke-width: 3; }
.straggler circle { fill: var(--rider); stroke: var(--night); stroke-width: 3; transition: fill 0.3s, stroke 0.3s; }
.straggler.lost circle { fill: rgba(10, 22, 38, 0.85); stroke: var(--dust); stroke-width: 4; }
.straggler text { fill: var(--dust); font-family: ${display7}; font-size: 26px; text-anchor: middle; }
.alert { position: absolute; right: 18px; top: 18px; width: min(400px, calc(100% - 36px)); padding: 16px 18px; border-radius: 18px;
  background: rgba(18, 34, 58, 0.96); border-left: 5px solid var(--red); font-size: 16px; line-height: 1.4; color: var(--dust);
  opacity: 0; transform: translateY(-12px); transition: opacity 0.35s, transform 0.35s; }
.alert b { color: var(--text); }
.alert.show { opacity: 1; transform: none; }
.alert-actions { display: flex; gap: 8px; margin-top: 12px; }
.alert-actions span { padding: 8px 14px; border-radius: 10px; background: var(--ridge); color: var(--text); font-family: ${body7}; font-size: 15px; }
.convoy figcaption { position: absolute; bottom: 18px; left: 22px; font-family: ${display7}; font-size: 18px; color: var(--dust); }

/* Plan on the web */
.plan-web { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 64px; align-items: center; padding-top: 140px; }
.tablet-band { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 64px; align-items: center; padding-top: 140px; }
.tablet-frame { margin: 0; padding: 14px; border-radius: 34px; background: #05101E; border: 1px solid rgba(151, 167, 190, 0.25); box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.8); }
.tablet-frame img { display: block; width: 100%; height: auto; border-radius: 22px; }
.plan-copy > p { margin-top: 20px; color: var(--soft); font-size: 19px; }
.plan-copy .btn { margin-top: 30px; }
.plan-small { margin-top: 14px !important; color: var(--dust) !important; font-size: 15px !important; }
.browser { margin: 0 -40px 0 0; border-radius: 18px; overflow: hidden; background: #050D18; border: 1px solid #22395B;
  box-shadow: 0 50px 100px -40px rgba(0, 0, 0, 0.9); }
.browser-bar { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; background: #0E1C31; border-bottom: 1px solid #1B2F4C; }
.browser-bar i { width: 11px; height: 11px; border-radius: 50%; background: #27406A; }
.browser-bar span { margin: 0 auto; padding: 3px 40px; border-radius: 8px; background: #12223A; color: var(--dust); font-family: ${body7}; font-size: 13px; }

/* Scan to join */
.qr { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 72px; align-items: center; padding-top: 140px; }
.qr-copy { max-width: 36em; }
.qr-copy > p { margin-top: 20px; color: var(--soft); font-size: 19px; }
.crew { grid-template-columns: minmax(0, 1fr) 280px; }
.crew .ticks { margin-top: 20px; }
.qr-copy > .qr-small { margin-top: 12px; color: var(--dust); font-size: 15px; }
.invite { margin-top: 36px; max-width: 460px; }
.invite label { display: block; font-family: ${display7}; font-size: 22px; margin-bottom: 10px; }
.invite-row { display: flex; gap: 10px; }
.invite input { flex: 1; min-width: 0; min-height: 56px; padding: 0 18px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--panel);
  color: var(--text); font-family: ${body7}; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; }
.invite input::placeholder { color: #5E7090; letter-spacing: 0.04em; text-transform: none; }
.invite .btn { font-size: 20px; padding: 0 20px; }

/* Signal */
.signal { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); gap: 64px; align-items: center; }
.signal-map { margin: 0; border-radius: 28px; overflow: hidden; border: 1px solid rgba(241, 244, 248, 0.14); max-height: 600px; box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.8); }
.signal-map img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }

/* More */
.more { padding: 40px 0 0; }
.more-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 72px; align-items: start; margin-top: 44px; }
.more-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px 44px; }
.feature { border-top: 2px solid var(--ridge); padding-top: 18px; }
.feature h3 { font-size: 28px; line-height: 1.05; }
.feature p { margin-top: 10px; color: var(--dust); font-size: 17px; }

/* Pricing, over the dunes */
.pricing { position: relative; margin-top: 110px; padding: 130px 0 110px; isolation: isolate; overflow: hidden; }
.pricing::before { content: ''; position: absolute; inset: 0; z-index: -2; background: url('/showcase/photos/dunes.webp') 50% 60% / cover no-repeat; }
.pricing::after { content: ''; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(180deg, var(--night) 0%, rgba(10, 22, 38, 0.35) 22%, rgba(10, 22, 38, 0.6) 60%, var(--night) 100%); }
.pricing-lede { margin-top: 16px; color: #DCE3EC; font-size: 20px; max-width: 36em; }
.billing { display: inline-flex; margin-top: 36px; padding: 5px; border-radius: 16px; background: rgba(18, 34, 58, 0.85); gap: 4px; border: 1px solid var(--ridge); }
.billing button { border: 0; background: transparent; color: var(--dust); font-family: ${display7}; font-size: 20px; padding: 10px 22px; border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; }
.billing button.on { background: var(--ridge); color: var(--text); }
.save { font-family: ${body7}; font-size: 13px; color: #fff; background: var(--red); padding: 3px 8px; border-radius: 8px; }
.plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 24px; }
.plan { padding: 36px; border-radius: 28px; background: rgba(18, 34, 58, 0.82); border: 1px solid rgba(241, 244, 248, 0.12);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.plan h3 { font-size: 40px; line-height: 1; }
.plan-head { display: flex; align-items: center; gap: 14px; }
.badge { font-family: ${body7}; font-size: 14px; color: #fff; background: var(--blue); padding: 5px 10px; border-radius: 9px; }
.plan-pro { background: linear-gradient(180deg, rgba(27, 47, 76, 0.92) 0%, rgba(18, 34, 58, 0.88) 60%); border: 2px solid var(--red); box-shadow: 0 40px 80px -40px rgba(229, 38, 46, 0.45); }
.price { margin-top: 18px; display: flex; align-items: baseline; gap: 10px; }
.amount { font-family: ${display}; font-size: 76px; line-height: 1; }
.per { color: var(--dust); font-size: 18px; }
.pro-chip { display: inline-flex; align-items: center; gap: 4px; padding: 0 7px 0 6px; height: 20px; border-radius: 6px; vertical-align: 2px; background: rgba(6, 14, 26, 0.82); border: 1px solid rgba(230, 194, 122, 0.6); color: #E6C27A; font-family: ${display}; font-size: 13px; line-height: 1; letter-spacing: 0.6px; }
.pro-chip::before { content: ''; width: 8px; height: 9px; background: #E6C27A; clip-path: path('M4 0.3c1.1 0.7 2.4 0.7 3.4 0.2 0.3 1.5 0.3 3.3-0.2 4.7-0.6 1.6-1.8 2.6-3.2 3.3-1.4-0.7-2.6-1.7-3.2-3.3C0.3 3.8 0.3 2 0.6 0.5 1.6 1 2.9 1 4 0.3z'); }
.plan-note { margin-top: 10px; color: var(--dust); font-size: 16px; min-height: 1.5em; }
.plan-includes { margin-top: 24px; font-family: ${body7}; font-size: 16px; }
.plan-includes + .ticks { margin-top: 12px; }
.plan .ticks { margin-top: 24px; }
.trial { margin-top: 24px; padding: 20px 24px; border-radius: 20px; border: 2px dashed rgba(59, 134, 247, 0.6); background: rgba(14, 33, 62, 0.8);
  color: var(--soft); font-size: 17px; }
.trial b { color: var(--text); }
.fine { margin-top: 24px; color: var(--dust); font-size: 14px; max-width: 62em; line-height: 1.6; }

/* Download, over a pack of quads at sunset */
.download { position: relative; padding: 170px 0 150px; text-align: center; isolation: isolate; overflow: hidden; }
.download::before { content: ''; position: absolute; inset: 0; z-index: -2; background: url('/showcase/photos/quads.webp') 50% 62% / cover no-repeat; }
.download::after { content: ''; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(180deg, var(--night) 0%, rgba(10, 22, 38, 0.15) 28%, rgba(10, 22, 38, 0.35) 72%, var(--night) 100%); }
.download h2 { font-size: clamp(54px, 7.5vw, 110px); line-height: 0.92; text-shadow: 0 2px 40px rgba(0, 0, 0, 0.5); }
.download-inner > p { margin: 20px auto 0; color: #E8EDF3; font-size: 21px; max-width: 30em; text-shadow: 0 1px 18px rgba(0, 0, 0, 0.6); }
.download-actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 14px; margin-top: 36px; }
.soon { display: inline-flex; align-items: center; min-height: 64px; padding: 0 28px; border-radius: 16px; border: 2px dashed rgba(241, 244, 248, 0.5);
  background: rgba(10, 22, 38, 0.5); color: var(--text); font-family: ${display}; font-size: 24px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.download-account { margin-top: 26px !important; color: #DCE3EC; font-size: 17px; }
.download-account + .download-sign { margin-top: 8px !important; }
.download-sign { margin-top: 26px !important; color: #DCE3EC; font-size: 17px; }
.download-sign a { color: #fff; font-family: ${body7}; }

/* Footer */
.foot { max-width: var(--wrap); margin: 0 auto; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding: 48px var(--gutter) 56px; color: var(--dust); font-size: 15px; }
.foot img { height: 32px; width: auto; }
.foot nav { margin-left: auto; display: flex; gap: 22px; }
.foot a { color: var(--dust); }
.foot a:hover { color: var(--text); }
.foot .credit { width: 100%; font-size: 13px; color: #6B7C95; }

/* Tablet */
@media (max-width: 1080px) {
  /* Narrow screens keep only Help in the bar; the sections are a scroll away. */
  .bar nav { margin-left: 4px; }
  .bar nav a:not(.nav-help) { display: none; }
  .hero-inner { grid-template-columns: minmax(0, 1fr) 260px; }
  .hero-phone { width: 250px; }
}
@media (max-width: 980px) {
  .step, .step:nth-child(even) { grid-template-columns: 240px minmax(0, 1fr); gap: 40px; }
  .step:nth-child(even) .phone { order: 0; }
  .bubble-grid, .signal, .plan-web, .tablet-band { grid-template-columns: 1fr; gap: 40px; }
  .watch-inner { grid-template-columns: minmax(0, 1fr) 300px; gap: 40px; }
  .browser { margin: 0; }
  .signal-map { max-height: 420px; }
  .qr { grid-template-columns: 240px minmax(0, 1fr); gap: 40px; }
  .crew { grid-template-columns: minmax(0, 1fr) 240px; }
  .more-grid { grid-template-columns: 1fr; }
  .more-grid .phone { display: none; }
}
@media (max-width: 820px) {
  .hero-inner { grid-template-columns: 1fr; padding-top: 120px; }
  /* The live group map is the app's main feature, so phones see it too, under the copy. */
  .hero-phone { justify-self: center; width: 240px; margin: 12px 0 36px; }
  .hero-photo { background-position: 64% 50%; }
  .hero-photo::after { background:
    linear-gradient(180deg, rgba(8, 17, 30, 0.55) 0%, rgba(8, 17, 30, 0.2) 30%, rgba(8, 17, 30, 0.75) 62%, var(--night) 100%); }
}

/* Phone */
@media (max-width: 640px) {
  .oml { --gutter: 16px; font-size: 17px; scroll-padding-top: 64px; }
  .bar { height: 62px; margin-bottom: -62px; gap: 10px; }
  .brand img { height: 26px; }
  .bar-actions { gap: 8px; }
  .bar-actions .btn-small { min-height: 38px; padding: 0 12px; font-size: 16px; border-radius: 10px; }
  .hero { min-height: 100svh; }
  .hero-photo { background-image: url('/showcase/photos/hero-tall.webp'); background-position: 50% 40%; }
  .hero-inner { padding-top: 96px; }
  .hero-copy { padding-bottom: 12px; }
  .hero h1 { font-size: 58px; }
  .lede { font-size: 18px; margin-top: 18px; }
  .hero-actions .btn { flex: 1 1 100%; }
  .hero-note { font-size: 15px; }
  .machines { font-size: 17px; padding-bottom: 20px; }
  .watch { padding-top: 64px; }
  .watch-inner { grid-template-columns: 1fr; gap: 28px; }
  .watch-copy > p { font-size: 17px; }
  .film { width: 100%; max-width: 300px; margin: 0 auto; }
  .how { padding-top: 80px; }
  .section-lede { font-size: 18px; }
  .steps { gap: 64px; margin-top: 40px; }
  .step, .step:nth-child(even) { grid-template-columns: 1fr; gap: 28px; }
  .step .phone { max-width: 260px; margin: 0 auto; order: 2 !important; }
  .step-copy > p, .band-copy > p, .plan-copy > p, .qr-copy > p { font-size: 17px; }
  .band { margin-top: 90px; padding: 90px 0; }
  .plan-web, .tablet-band, .qr { padding-top: 90px; }
  .qr, .crew { grid-template-columns: 1fr; }
  .qr-phone { max-width: 240px; margin: 0 auto; order: 2; }
  .convoy { aspect-ratio: 4 / 5; border-radius: 24px; }
  .alert { font-size: 15px; right: 12px; top: 12px; width: calc(100% - 24px); }
  .more { padding-top: 0; }
  .more-list { grid-template-columns: 1fr; gap: 28px; }
  .pricing { margin-top: 90px; padding: 90px 0 70px; }
  .billing { display: flex; }
  .billing button { flex: 1; justify-content: center; padding: 10px 12px; }
  .plans { grid-template-columns: 1fr; }
  .plan { padding: 26px 22px; }
  .amount { font-size: 60px; }
  .download { padding: 110px 0 100px; }
  .download-inner > p { font-size: 18px; }
  .download-actions .btn, .soon { width: 100%; justify-content: center; }
  .soon { font-size: 20px; }
  .invite-row { flex-direction: column; }
  .foot nav { margin-left: 0; width: 100%; flex-wrap: wrap; }
}
@media (max-width: 380px) {
  .bar-get { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .oml * { transition: none !important; animation: none !important; }
}
`;

const PROVIDER_NAMES: Record<SocialProvider, string> = { apple: 'Apple', google: 'Google', facebook: 'Facebook' };

/** "Apple, Google, Facebook or your email", or null before any social sign-in is switched on. */
function signUpChoices(providers: SocialProvider[]): string | null {
  if (!providers.length) return null;
  return `${providers.map((p) => PROVIDER_NAMES[p]).join(', ')} or your email`;
}
