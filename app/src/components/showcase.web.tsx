import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { APP_STORE_URL, COMPANY, PRO_PRICES, RUS_URL, TRIAL_DAYS } from '@/constants/site';
import type { SocialProvider } from '@/core/auth-link';
import { useSocialProviders } from '@/lib/session';

/**
 * onmylead.com for signed-out visitors: what the iPhone app does, how a group ride works, and what
 * Free and Pro include. Plain HTML and CSS (this file only builds for the web), so the page can
 * use real headings, links and media queries. Signed-in riders on the web get the app instead.
 *
 * The photos in /showcase/photos are U.S. Bureau of Land Management pictures from the Imperial
 * Sand Dunes and Johnson Valley, which are in the public domain (sources in showcase/photos/SOURCES.md).
 */
type Route = '/sign-in' | '/ride/new' | '/terms' | '/privacy' | '/support' | '/contact';

export function Showcase() {
  // Only the sign-in choices that are switched on, so the page never promises one that isn't.
  const signUpWith = signUpChoices(useSocialProviders('ios'));
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
        <title>OnMyLead: the Group Ride App for iPhone</title>
        <meta
          name="description"
          content="Create a ride, bring your crew and keep everyone together on the trail. Live group map, Ride Bubble alerts, ride chat and more. Free on iPhone, with Pro for the riders who lead."
        />
      </Head>
      <style>{CSS}</style>

      <header className={scrolled ? 'bar solid' : 'bar'}>
        <a className="brand" href="/" aria-label="OnMyLead home">
          <img src="/showcase/logo-lockup.png" alt="OnMyLead" width={158} height={36} />
        </a>
        <nav aria-label="Sections">
          <a href="#how" onClick={jump('how')}>How It Works</a>
          <a href="#plan" onClick={jump('plan')}>Plan on the Web</a>
          <a href="#features" onClick={jump('features')}>Features</a>
          <a href="#pricing" onClick={jump('pricing')}>Pricing</a>
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
              <a className="btn btn-glass" href="/ride/new" onClick={go('/ride/new')}>Create a Ride on the Web</a>
            </div>
            <p className="hero-note">
              Free to download and ride. Pro is {PRO_PRICES.monthly} a month or {PRO_PRICES.annual} a year, and every
              new account gets {TRIAL_DAYS} days of Pro with no card.
            </p>
          </div>
          <div className="hero-phone">
            <figure className="phone">
              <img src="/showcase/group-map.webp" alt="Ride Mode’s live group map: every rider’s dot along the trail on satellite imagery, the leader’s bigger blue dot out front, and the group’s progress along the route" width={786} height={1704} />
            </figure>
          </div>
        </div>
        <p className="machines">
          Built for SXS/UTV, ATV, Dirt Bike, Motorcycle, Jeep/4x4, Truck, Overland Rig, Snowmobile and Car Club rides.
        </p>
      </section>

      <PromoVideo />

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
              text="Set the meeting point, time, difficulty and which machines are welcome, and choose public, private or approval-only. Then pick Mapped, search the trailhead or area to jump the map there, and tap along the trail so the route snaps to it, or import a GPX file, or pick Freeride and everyone follows the leader."
              points={['Search parks, trailheads, towns or a street address for the meeting spot', 'Route miles checked against every machine’s fuel range', 'Hand the lead to another rider at any point']}
            />
            <Step
              n={2}
              shot="find"
              alt="Find a Ride with a place search, a map of Utah and the Rides, Find, Groups and You tabs"
              title="Bring Your Crew"
              text="Send the ride by link, text, email or its QR code. Friends see a preview before they make an account, and riders can find public rides near them, by state, or near a park or trailhead they search for."
              points={['Riding Groups invite your whole crew in one tap and have their own group chat', 'Follow This Leader to hear about their next public ride', 'Exact meeting spot only shows to riders who join']}
            />
            <Step
              n={3}
              shot="live"
              alt="Ride Mode showing the group’s progress on the route, an On My Way tap seen by three riders with a Cancel button, and big status buttons"
              title="Ride Together"
              text="Ride Mode puts the group on one screen. The leader, the tail gunner and every rider show on the route, and Ride Bubble warns everyone when someone drops back or stops moving."
              points={['Glove-sized buttons for On My Way, Flat Tire, Need Fuel and Regroup', 'Every tap notifies the group, shows who got it, and cancels in one tap', 'SOS sheet and an EMERGENCY button one tap away']}
            />
            <Step
              n={4}
              shot="waypoints"
              alt="The ride’s waypoints map: two numbered planned stops, a shared Washout hazard, and a camp spot only you see"
              title="Mark the Trail"
              text="Press and hold the map to drop a waypoint: camp, fuel, water, a viewpoint, parking or a hazard, with a note. The leader chooses Everyone on the Ride or Just Me, and everyone else’s waypoints stay their own."
              points={['Shared waypoints show on every rider’s map', 'Never public: only riders on the ride see shared ones', 'Add one at your location with one tap']}
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
              your iPhone the moment you save.
            </p>
            <ul className="ticks">
              <li>Search a trailhead, park or area to jump the map there</li>
              <li>Follow Trails, or Straight Line where nothing is mapped</li>
              <li>Drag a point to move it, or press Ctrl+Z to undo</li>
              <li>Fold the route tools away to see more map</li>
              <li>Drawing a route is free. Importing a GPX track is Pro.</li>
            </ul>
            <a className="btn btn-red" href="/ride/new" onClick={go('/ride/new')}>Create a Ride on the Web</a>
            <p className="plan-small">You’ll sign in first, then go straight to Create a Ride. Ride Mode and live tracking stay in the iPhone app.</p>
          </div>
          <figure className="browser">
            <div className="browser-bar" aria-hidden="true"><i /><i /><i /><span>onmylead.com</span></div>
            <img src="/showcase/web-route.webp" alt="Drawing a 3.8 mile route on Engineer Pass Road on onmylead.com: four clicks, and the route follows every switchback of the trail" loading="lazy" width={1600} height={1000} />
          </figure>
        </section>

        <section className="qr" aria-labelledby="qr-title">
          <figure className="phone qr-phone">
            <img src="/showcase/qr.webp" alt="A ride’s full-screen QR code with its invite code and a Share QR Code button" loading="lazy" width={786} height={1704} />
          </figure>
          <div className="qr-copy">
            <h2 id="qr-title" className="section-title">Scan to Join</h2>
            <p>
              Every ride has its own QR code. Hold up your phone at the trailhead and riders scan it with their camera to
              land right on the ride in OnMyLead, or get the app if they don’t have it yet. Anyone on the ride can send
              the code by text or email too.
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
      </main>

      <section id="features" className="band band-night" aria-labelledby="signal-title">
        <div className="band-inner signal">
          <div className="band-copy">
            <h2 id="signal-title" className="section-title">Made for Where the Signal Ends</h2>
            <p>
              Trails rarely have service, so OnMyLead plans for it. Live positions need a signal, so every dot says how
              fresh it is: solid when it’s live, hollow when it only marks where a rider was last seen, so a stale dot
              never reads as “they’re right here.”
            </p>
            <ul className="ticks">
              <li><b>Trails on the Map.</b> Public land trails and roads, plus OpenStreetMap trails in off-road parks like Hidden Falls, named when you tap them. Over satellite or topo.</li>
              <li><b>Routes That Follow the Trail.</b> Tap a few points and the route runs along the trail between them, worked out on your phone, even with no signal in an area you’ve downloaded.</li>
              <li><b>Offline Maps (Pro).</b> Save the area and its trails before you leave, and the map works with no bars.</li>
              <li><b>The Route Stays on Your Phone.</b> Once you’ve seen it, it’s there when signal drops.</li>
              <li><b>A Family Link.</b> People at home follow along on a read-only page, no app needed.</li>
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
              <Feature title="Nothing Buried">Four tabs along the bottom: Rides, Find, Groups and You. Every ride opens in four parts, Details, Map, Riders and Chat, with what to do next right under its name.</Feature>
              <Feature title="Status Taps You Can Trust">Tap On My Way or Need Fuel and everyone on the ride gets a notification. A light comes on for each rider who has it, and Cancel takes it back with a follow-up so nobody turns around for nothing.</Feature>
              <Feature title="Ride Day Weather and Daylight">Every upcoming ride shows the meet day’s forecast, with a heads-up for storms, high wind or heat, and a daylight bar that tells you if the group gets back after dark.</Feature>
              <Feature title="Swipe Left to Delete or Leave">Swipe a ride left in your list. Your own ride is deleted and everyone on it is told; anyone else’s, you leave. It always asks first.</Feature>
              <Feature title="Ride Again">Ran a great ride? One tap copies it, meeting point and route included. Pick the new day and send the invite.</Feature>
              <Feature title="Planned Stops">The leader marks where the whole ride will stop for fuel, lunch or camp, with a time. Everyone on the ride sees them numbered on the map, in order, and nobody else does.</Feature>
              <Feature title="Directions in Apple Maps or Google Maps">Search a street address, a trailhead or a town for the meeting point. One tap opens turn-by-turn on the roads to the meeting point, the destination, a waypoint or along the route.</Feature>
              <Feature title="Garage and Fuel Range">Add your machines with photos and every part of the build. Your tank, extra fuel and mileage give a full range, a safe turnaround and a safe trip.</Feature>
              <Feature title="Trip Planner">Packing checklists for each trip, linked to the ride and the machine you’re taking.</Feature>
              <Feature title="Ride Summary and Ride Card">After the ride, see the miles and the group’s totals, then share a ride card.</Feature>
              <Feature title="Starlink Page">Plan power for your dish on the trail: watts, battery and solar, plus live status when you’re on its network.</Feature>
              <Feature title="Gear from RUS Offroad">Suggestions for what to bring, from the people who build the parts.</Feature>
              <Feature title="Your Location Is Never Public">Sharing is per ride or per person and always ends. Strangers see a rounded area; the exact meeting spot is only for riders who join.</Feature>
              <Feature title="Report or Block Any Rider">Press and hold a message, or tap a rider, to report or block them. A blocked rider’s messages disappear for you and they are never told.</Feature>
            </div>
            <figure className="phone">
              <img src="/showcase/vehicle.webp" alt="A Garage machine called Red Rocket with its fuel range and build list" loading="lazy" width={786} height={1704} />
            </figure>
          </div>
        </section>
      </main>

      <Pricing />

      <section id="download" className="download" aria-labelledby="download-title">
        <div className="download-inner">
          <h2 id="download-title">{APP_STORE_URL ? 'Get OnMyLead for iPhone' : 'Coming Soon to iPhone'}</h2>
          <p>
            {APP_STORE_URL
              ? `Download it free, make your account, and your first ${TRIAL_DAYS} days of Pro start on their own.`
              : 'OnMyLead is in testing on the trail now and heads to the App Store next. Plan your first ride on the web today.'}
          </p>
          <div className="download-actions">
            {APP_STORE_URL ? (
              <a className="btn btn-red btn-big" href={APP_STORE_URL}>Download on the App Store</a>
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
          <a href="/privacy" onClick={go('/privacy')}>Privacy Policy</a>
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
      <a className="btn btn-store" href={APP_STORE_URL}>
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
        <img src={`/showcase/${shot}.webp`} alt={alt} loading="lazy" width={786} height={1704} />
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
  'Join Unlimited Rides',
  'Live Tracking, SOS and Ride Bubble',
  'Mechanical Issue and Family Tracking Links',
  'Ride Chat and Poll Voting',
  'Draw Routes and Follow Leaders',
  'Ride History: Last 5 Rides',
];
const PRO = [
  'Unlimited Rides',
  'Import GPX Routes',
  'Offline Maps',
  'Saved Riding Groups',
  'Create Ride Polls',
  'Full Ride History',
  'Advanced Trip Planning',
  'Advanced Ride Statistics',
  'Premium Ride Cards',
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
          turns into a charge. When it ends you keep everything you made and carry on with Free.
        </div>

        <p className="fine">
          Prices in US dollars. Pro is bought in the iPhone app and paid through your Apple Account. It renews
          automatically until you cancel, which you can do any time in your Apple Account settings at least 24 hours
          before the period ends. The free trial is separate and never charges. See the{' '}
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
.dot-rider { fill: var(--rider); stroke: var(--night); stroke-width: 3; }
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
  .bar nav { display: none; }
  .hero-inner { grid-template-columns: minmax(0, 1fr) 260px; }
  .hero-phone { width: 250px; }
}
@media (max-width: 980px) {
  .step, .step:nth-child(even) { grid-template-columns: 240px minmax(0, 1fr); gap: 40px; }
  .step:nth-child(even) .phone { order: 0; }
  .bubble-grid, .signal, .plan-web { grid-template-columns: 1fr; gap: 40px; }
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
  .plan-web, .qr { padding-top: 90px; }
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
