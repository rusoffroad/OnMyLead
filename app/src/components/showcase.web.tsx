import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { APP_STORE_URL, COMPANY, PRO_PRICES, RUS_URL, TRIAL_DAYS } from '@/constants/site';

/**
 * onmylead.com for signed-out visitors: what the iPhone app does, how a group ride works, and what
 * Free and Pro include. Plain HTML and CSS (this file only builds for the web), so the page can
 * use real headings, links and media queries. Signed-in riders on the web get the app instead.
 */
export function Showcase() {
  const scroller = useRef<HTMLDivElement>(null);

  // Section links scroll the page's own scroller; the URL stays clean for the app's router.
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  const go = (href: '/sign-in' | '/sign-in?mode=create' | '/terms' | '/privacy') => (e: MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <div className="oml" ref={scroller}>
      <Head>
        <title>OnMyLead: the Group Ride App for iPhone</title>
        <meta
          name="description"
          content="Create a ride, bring your crew and keep everyone together on the trail. Live group map, Ride Bubble alerts, ride chat and more. Coming soon to iPhone."
        />
      </Head>
      <style>{CSS}</style>

      <header className="bar">
        <a className="brand" href="/" aria-label="OnMyLead home">
          <img src="/showcase/logo-lockup.png" alt="OnMyLead" width={158} height={36} />
        </a>
        <nav aria-label="Sections">
          <a href="#how" onClick={jump('how')}>How It Works</a>
          <a href="#features" onClick={jump('features')}>Features</a>
          <a href="#pricing" onClick={jump('pricing')}>Pricing</a>
        </nav>
        <div className="bar-actions">
          <a className="link" href="/sign-in" onClick={go('/sign-in')}>Sign In</a>
          <a className="btn btn-red btn-small" href="#download" onClick={jump('download')}>Get the App</a>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">Ride Together.<br />Get Home Together.</h1>
            <p className="lede">
              OnMyLead is the group ride app for every machine on the trail. Create a ride, bring your crew, and see
              everyone on one live map, with an alert the moment someone falls behind.
            </p>
            <div className="hero-actions">
              <a className="btn btn-red" href="#download" onClick={jump('download')}>{APP_STORE_URL ? 'Download for iPhone' : 'Coming Soon to iPhone'}</a>
              <a className="btn btn-ghost" href="#how" onClick={jump('how')}>See How It Works</a>
            </div>
            <p className="hero-note">Free to start. Every new account gets {TRIAL_DAYS} days of Pro, no card needed.</p>
          </div>
          <Convoy />
        </section>

        <p className="machines">
          Built for <b>SXS/UTV</b>, <b>ATV</b>, <b>Dirt Bike</b>, <b>Motorcycle</b>, <b>Jeep/4x4</b>, <b>Truck</b>,{' '}
          <b>Overland Rig</b>, <b>Snowmobile</b> and <b>Car Club</b> rides. If your group rolls out together, it fits.
        </p>

        <section id="how" className="how" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">How a Group Ride Works</h2>
          <ol className="steps">
            <Step
              n={1}
              shot="create"
              alt="Create a Ride with The Route set to Mapped, next to Freeride, and the vehicles welcome"
              title="Create a Ride"
              text="Set the meeting point, time, difficulty and which machines are welcome, and choose public, private or approval-only. Then pick Mapped and draw the route or import a GPX file, or pick Freeride and everyone follows the leader."
              points={['Search parks, trailheads, towns or a street address for the meeting spot', 'Route miles checked against every machine’s fuel range', 'Hand the lead to another rider at any point']}
            />
            <Step
              n={2}
              shot="find"
              alt="Find a Ride with a place search, a map of Utah and public rides within 50 miles"
              title="Bring Your Crew"
              text="Send the ride by link, text or email. Friends see a preview before they make an account, and riders can find public rides near them, by state, or near a park or trailhead they search for."
              points={['Riding Groups invite your whole crew in one tap', 'Follow This Leader to hear about their next public ride', 'Exact meeting spot only shows to riders who join']}
            />
            <Step
              n={3}
              shot="live"
              alt="Ride Mode showing the group’s progress on the route, a Ride Bubble alert and big status buttons"
              title="Ride Together"
              text="Ride Mode puts the group on one screen. The leader, the tail gunner and every rider show on the route, and Ride Bubble warns everyone when someone drops back or stops moving."
              points={['Glove-sized buttons for Flat Tire, Need Fuel, Mechanical Issue and Regroup', 'SOS sheet and an EMERGENCY button one tap away', 'Keeps sharing with the phone locked on the mount']}
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

        <section id="features" className="signal" aria-labelledby="signal-title">
          <div className="signal-copy">
            <h2 id="signal-title" className="section-title">Made for Where the Signal Ends</h2>
            <p>
              Trails rarely have service, so OnMyLead plans for it. Live positions need a signal, so every dot says how
              fresh it is: solid when it’s live, hollow when it only marks where a rider was last seen, so a stale dot
              never reads as “they’re right here.”
            </p>
            <ul className="ticks">
              <li><b>Trails on the Map.</b> Public land trails and roads, plus OpenStreetMap trails in off-road parks like Hidden Falls, named when you tap them. Over satellite or topo.</li>
              <li><b>Offline Maps (Pro).</b> Save the area and its trails before you leave, and the map works with no bars.</li>
              <li><b>The Route Stays on Your Phone.</b> Once you’ve seen it, it’s there when signal drops.</li>
              <li><b>A Family Link.</b> People at home follow along on a read-only page, no app needed.</li>
            </ul>
          </div>
          <figure className="signal-map">
            <img src="/showcase/map.webp" alt="Satellite trail map with numbered trails and riders, one marked as last seen two minutes ago" loading="lazy" width={1000} height={1498} />
          </figure>
        </section>

        <section className="more" aria-labelledby="more-title">
          <h2 id="more-title" className="section-title">Everything Else in Your Pocket</h2>
          <div className="more-grid">
            <div className="more-list">
              <Feature title="Planned Stops">The leader marks where the whole ride will stop for fuel, lunch or camp, with a time. Everyone on the ride sees them numbered on the map, in order, and nobody else does.</Feature>
              <Feature title="Directions in Apple Maps or Google Maps">Search a street address, a trailhead or a town for the meeting point. One tap opens turn-by-turn on the roads to the meeting point, the destination, a waypoint or along the route.</Feature>
              <Feature title="Garage and Fuel Range">Add your machines with photos and every part of the build. Your tank, extra fuel and mileage give a full range, a safe turnaround and a safe trip.</Feature>
              <Feature title="Trip Planner">Packing checklists for each trip, linked to the ride and the machine you’re taking.</Feature>
              <Feature title="Ride Summary and Ride Card">After the ride, see the miles and the group’s totals, then share a ride card.</Feature>
              <Feature title="Starlink Page">Plan power for your dish on the trail: watts, battery and solar, plus live status when you’re on its network.</Feature>
              <Feature title="Gear from RUS Offroad">Suggestions for what to bring, from the people who build the parts.</Feature>
            </div>
            <figure className="phone phone-tilt">
              <img src="/showcase/vehicle.webp" alt="A Garage machine called Red Rocket with its fuel range and build list" loading="lazy" width={786} height={1704} />
            </figure>
          </div>
        </section>

        <section className="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="section-title">Your Location Is Never Public</h2>
          <div className="privacy-points">
            <p><b>You Choose Who Sees You</b> Sharing is per ride or per person, never with the whole app.</p>
            <p><b>Sharing Always Ends</b> Pick a timer, and it stops when time runs out or the ride ends.</p>
            <p><b>Public Rides Stay Vague</b> Strangers see a rounded area. The exact meeting spot is only for riders who join.</p>
          </div>
        </section>

        <Pricing />

        <section id="download" className="download" aria-labelledby="download-title">
          <h2 id="download-title">{APP_STORE_URL ? 'Get OnMyLead for iPhone' : 'Coming Soon to iPhone'}</h2>
          <p>
            {APP_STORE_URL
              ? 'Download it free, make your account, and your first 30 days of Pro start on their own.'
              : 'OnMyLead is in testing on the trail now and heads to the App Store next.'}
          </p>
          {APP_STORE_URL ? (
            <a className="btn btn-red btn-big" href={APP_STORE_URL}>Download on the App Store</a>
          ) : (
            <span className="soon" role="note">Coming Soon to the App Store</span>
          )}
          <InviteCode />
        </section>
      </main>

      <footer className="foot">
        <img src="/showcase/logo-lockup.png" alt="OnMyLead" width={140} height={32} loading="lazy" />
        <p>
          Made by <a href={RUS_URL}>RUS Offroad</a>. © {new Date().getFullYear()} {COMPANY}.
        </p>
        <nav aria-label="Legal and account">
          <a href="/terms" onClick={go('/terms')}>Terms of Use</a>
          <a href="/privacy" onClick={go('/privacy')}>Privacy Policy</a>
          <a href="/sign-in" onClick={go('/sign-in')}>Sign In</a>
        </nav>
      </footer>
    </div>
  );
}

function Step({ n, shot, alt, title, text, points }: { n: number; shot: string; alt: string; title: string; text: string; points: string[] }) {
  return (
    <li className="step">
      <figure className="phone">
        <img src={`/showcase/${shot}.webp`} alt={alt} loading={n === 1 ? 'eager' : 'lazy'} width={786} height={1704} />
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
      <h2 id="pricing-title" className="section-title">Free to Ride. Pro to Lead.</h2>
      <p className="pricing-lede">
        Safety is never behind a paywall. Pro is for the riders who plan and lead the rides.
      </p>

      <div className="trial">
        <b>Every new account gets {TRIAL_DAYS} days of Pro, automatically.</b> No card, nothing to cancel, and it never
        turns into a charge. When it ends you keep everything you made and carry on with Free.
      </div>

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

      <p className="fine">
        Prices in US dollars. Pro is bought in the iPhone app and paid through your Apple Account. It renews
        automatically until you cancel, which you can do any time in your Apple Account settings at least 24 hours
        before the period ends. The free trial is separate and never charges. See the{' '}
        <a href="/terms" onClick={(e) => { e.preventDefault(); router.push('/terms'); }}>Terms of Use</a> and{' '}
        <a href="/privacy" onClick={(e) => { e.preventDefault(); router.push('/privacy'); }}>Privacy Policy</a>.
      </p>
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
          placeholder="e.g. 7F3A9C21"
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
 * The hero: a group riding a trail inside its Ride Bubble. Partway along, one rider stops, their
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
  --red: #E5262E; --blue: #3B86F7; --text: #F1F4F8; --dust: #97A7BE; --sweep: #B967F0; --rider: #6E7681;
  position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; background: var(--night); color: var(--text);
  font-family: ${body}; font-size: 18px; line-height: 1.55; -webkit-font-smoothing: antialiased; scroll-padding-top: 84px;
}
.oml *, .oml *::before, .oml *::after { box-sizing: border-box; }
.oml img { display: block; max-width: 100%; height: auto; }
.oml a { color: inherit; }
.oml b { font-family: ${body7}; font-weight: 700; }
.oml h1, .oml h2, .oml h3 { font-family: ${display}; font-weight: 800; letter-spacing: 0.005em; }
/* Zero-specificity resets, so each block's own margins win. */
:where(.oml) :where(h1, h2, h3, p, figure) { margin: 0; }
.oml :focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; border-radius: 6px; }
.oml main, .oml .bar, .oml .foot { max-width: 1180px; margin: 0 auto; padding-left: 28px; padding-right: 28px; }

/* Header */
.bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 28px; height: 72px;
  background: rgba(10, 22, 38, 0.92); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); max-width: none !important;
  padding-left: max(28px, calc((100% - 1124px) / 2)) !important; padding-right: max(28px, calc((100% - 1124px) / 2)) !important;
  border-bottom: 1px solid rgba(39, 64, 106, 0.5); }
.brand img { height: 36px; width: auto; }
.bar nav { display: flex; gap: 26px; margin-left: 12px; }
.bar nav a, .bar .link { text-decoration: none; color: var(--dust); font-family: ${body7}; font-size: 16px; }
.bar nav a:hover, .bar .link:hover { color: var(--text); }
.bar-actions { margin-left: auto; display: flex; align-items: center; gap: 20px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 54px; padding: 0 26px; border-radius: 16px; border: 0;
  font-family: ${display}; font-size: 22px; letter-spacing: 0.01em; text-decoration: none; cursor: pointer; transition: transform 0.12s, background-color 0.12s; }
.btn:active { transform: scale(0.98); }
.btn-red { background: var(--red); color: #fff; }
.btn-red:hover { background: #F2353D; }
.btn-blue { background: var(--blue); color: #fff; }
.btn-blue:disabled { background: var(--ridge); color: var(--dust); cursor: default; }
.btn-ghost { background: var(--ridge); color: var(--text); }
.btn-ghost:hover { background: #22395B; }
.btn-small { min-height: 42px; padding: 0 18px; font-size: 18px; border-radius: 12px; }
.btn-big { min-height: 64px; font-size: 26px; padding: 0 34px; }

/* Hero */
.hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 48px; align-items: center; padding: 64px 0 40px; }
.hero h1 { font-size: clamp(56px, 6.4vw, 92px); line-height: 0.95; letter-spacing: -0.005em; }
.lede { margin-top: 28px; font-size: 21px; line-height: 1.5; color: #C9D3E1; max-width: 33em; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.hero-note { margin-top: 18px; color: var(--dust); font-size: 16px; }

.convoy { position: relative; margin: 0; aspect-ratio: 5 / 4; border-radius: 32px; overflow: hidden;
  background: radial-gradient(120% 90% at 70% 20%, #132A47 0%, #0E1D33 55%, #0B182B 100%); border: 1px solid var(--ridge); }
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

.machines { padding: 22px 0 8px; color: var(--dust); font-size: 18px; max-width: 52em; }
.machines b { color: var(--text); font-family: ${body}; font-weight: 500; }

/* Section titles */
.section-title { font-size: clamp(40px, 5vw, 64px); line-height: 0.98; }

/* How it works */
.how { padding: 96px 0 40px; }
.steps { list-style: none; margin: 56px 0 0; padding: 0; display: grid; gap: 88px; }
.step { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 72px; align-items: center; }
.step:nth-child(even) { grid-template-columns: minmax(0, 1fr) 280px; }
.step:nth-child(even) .phone { order: 2; }
.step-copy { max-width: 34em; }
.step-n { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px;
  background: var(--red); color: #fff; font-family: ${display}; font-size: 30px; margin-bottom: 18px; }
.step h3 { font-size: clamp(36px, 4vw, 48px); line-height: 1; }
.step-copy > p { margin-top: 14px; color: #C9D3E1; font-size: 19px; }

.phone { margin: 0; padding: 10px; border-radius: 48px; background: #050D18; border: 2px solid #22395B;
  box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.03) inset; }
.phone img { border-radius: 38px; width: 100%; }

.ticks { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 10px; }
.ticks li { position: relative; padding-left: 30px; color: var(--text); font-size: 17px; line-height: 1.45; }
.ticks li::before { content: ''; position: absolute; left: 2px; top: 0.36em; width: 14px; height: 8px;
  border-left: 3px solid var(--blue); border-bottom: 3px solid var(--blue); transform: rotate(-45deg); }

/* Signal */
.signal { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 64px; align-items: center; padding: 120px 0 40px; }
.signal-copy > p { margin-top: 20px; color: #C9D3E1; font-size: 19px; max-width: 34em; }
.signal .ticks li { color: #C9D3E1; }
.signal .ticks b { color: var(--text); }
.signal-map { margin: 0; border-radius: 28px; overflow: hidden; border: 1px solid var(--ridge); max-height: 620px; }
.signal-map img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }

/* More */
.more { padding: 120px 0 40px; }
.more-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 72px; align-items: start; margin-top: 44px; }
.more-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px 44px; }
.feature { border-top: 2px solid var(--ridge); padding-top: 18px; }
.feature h3 { font-size: 28px; line-height: 1.05; }
.feature p { margin-top: 10px; color: var(--dust); font-size: 17px; }
.phone-tilt { transform: rotate(3deg); }

/* Privacy */
.privacy { margin-top: 120px; padding: 56px; border-radius: 32px; background: var(--panel); }
.privacy-points { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; margin-top: 32px; }
.privacy-points p { color: var(--dust); font-size: 17px; }
.privacy-points b { display: block; color: var(--text); font-family: ${display}; font-weight: 800; font-size: 26px; line-height: 1.05; margin-bottom: 8px; }

/* Pricing */
.pricing { padding: 120px 0 40px; }
.pricing-lede { margin-top: 16px; color: #C9D3E1; font-size: 20px; max-width: 36em; }
.trial { margin-top: 32px; padding: 20px 24px; border-radius: 20px; border: 2px dashed rgba(59, 134, 247, 0.6); background: rgba(59, 134, 247, 0.08);
  color: #C9D3E1; font-size: 17px; max-width: 52em; }
.trial b { color: var(--text); }
.billing { display: inline-flex; margin-top: 36px; padding: 5px; border-radius: 16px; background: var(--panel); gap: 4px; }
.billing button { border: 0; background: transparent; color: var(--dust); font-family: ${display7}; font-size: 20px; padding: 10px 22px; border-radius: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; }
.billing button.on { background: var(--ridge); color: var(--text); }
.save { font-family: ${body7}; font-size: 13px; color: #fff; background: var(--red); padding: 3px 8px; border-radius: 8px; }
.plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 24px; }
.plan { padding: 36px; border-radius: 28px; background: var(--panel); border: 1px solid var(--ridge); }
.plan h3 { font-size: 40px; line-height: 1; }
.plan-head { display: flex; align-items: center; gap: 14px; }
.badge { font-family: ${body7}; font-size: 14px; color: #fff; background: var(--blue); padding: 5px 10px; border-radius: 9px; }
.plan-pro { background: linear-gradient(180deg, #172C4B 0%, var(--panel) 60%); border: 2px solid var(--red); }
.price { margin-top: 18px; display: flex; align-items: baseline; gap: 10px; }
.amount { font-family: ${display}; font-size: 72px; line-height: 1; }
.per { color: var(--dust); font-size: 18px; }
.plan-note { margin-top: 10px; color: var(--dust); font-size: 16px; min-height: 1.5em; }
.plan-includes { margin-top: 24px; font-family: ${body7}; font-size: 16px; }
.plan-includes + .ticks { margin-top: 12px; }
.plan .ticks { margin-top: 24px; }
.fine { margin-top: 24px; color: var(--dust); font-size: 14px; max-width: 62em; line-height: 1.6; }

/* Download */
.download { margin: 120px 0 0; padding: 72px 56px; border-radius: 32px; text-align: center;
  background: radial-gradient(90% 120% at 50% 0%, #1B3A66 0%, #12223A 55%, #0E1C31 100%); border: 1px solid var(--ridge); }
.download h2 { font-size: clamp(48px, 6.5vw, 84px); line-height: 0.95; }
.download > p { margin: 18px auto 0; color: #C9D3E1; font-size: 20px; max-width: 30em; }
.download .btn-big { margin-top: 32px; }
.soon { display: inline-block; margin-top: 32px; padding: 16px 28px; border-radius: 16px; border: 2px dashed var(--line); color: var(--text);
  font-family: ${display}; font-size: 24px; }
.invite { margin: 48px auto 0; max-width: 460px; text-align: left; }
.invite label { display: block; font-family: ${display7}; font-size: 22px; margin-bottom: 10px; }
.invite-row { display: flex; gap: 10px; }
.invite input { flex: 1; min-width: 0; min-height: 54px; padding: 0 18px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--night);
  color: var(--text); font-family: ${body7}; font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; }
.invite input::placeholder { color: #5E7090; letter-spacing: 0.04em; text-transform: none; }
.invite .btn { font-size: 20px; padding: 0 20px; }

/* Footer */
.foot { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding-top: 56px; padding-bottom: 56px; color: var(--dust); font-size: 15px; }
.foot img { height: 32px; width: auto; }
.foot nav { margin-left: auto; display: flex; gap: 22px; }
.foot a { color: var(--dust); }
.foot a:hover { color: var(--text); }

/* Tablet */
@media (max-width: 980px) {
  .hero { grid-template-columns: 1fr; padding-top: 40px; }
  .step, .step:nth-child(even) { grid-template-columns: 240px minmax(0, 1fr); gap: 40px; }
  .step:nth-child(even) .phone { order: 0; }
  .signal { grid-template-columns: 1fr; }
  .signal-map { max-height: 420px; }
  .more-grid { grid-template-columns: 1fr; }
  .more-grid .phone { display: none; }
  .privacy-points { grid-template-columns: 1fr; gap: 20px; }
}

/* Phone */
@media (max-width: 640px) {
  .oml { font-size: 17px; scroll-padding-top: 68px; }
  .oml main, .oml .foot { padding-left: 16px; padding-right: 16px; }
  .bar { height: 60px; gap: 12px; padding-left: 16px !important; padding-right: 16px !important; }
  .brand img { height: 28px; }
  .bar nav { display: none; }
  .bar-actions { gap: 14px; }
  .hero { padding: 28px 0 24px; gap: 28px; }
  .hero h1 { font-size: 56px; }
  .lede { font-size: 18px; margin-top: 18px; }
  .hero-actions .btn { flex: 1 1 100%; }
  .convoy { aspect-ratio: 4 / 5; border-radius: 24px; }
  .alert { font-size: 15px; right: 12px; top: 12px; width: calc(100% - 24px); }
  .how { padding-top: 64px; }
  .steps { gap: 64px; margin-top: 36px; }
  .step, .step:nth-child(even) { grid-template-columns: 1fr; gap: 28px; }
  .step .phone { max-width: 260px; margin: 0 auto; order: 2 !important; }
  .step-copy > p { font-size: 17px; }
  .signal, .more, .pricing { padding-top: 80px; }
  .signal { gap: 32px; }
  .more-list { grid-template-columns: 1fr; gap: 28px; }
  .privacy { margin-top: 80px; padding: 28px 22px; border-radius: 24px; }
  .billing { display: flex; }
  .billing button { flex: 1; justify-content: center; padding: 10px 12px; }
  .plans { grid-template-columns: 1fr; }
  .plan { padding: 26px 22px; }
  .amount { font-size: 60px; }
  .download { margin-top: 80px; padding: 44px 20px; border-radius: 24px; }
  .download > p { font-size: 18px; }
  .soon { font-size: 20px; padding: 14px 18px; }
  .invite-row { flex-direction: column; }
  .foot nav { margin-left: 0; width: 100%; flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .oml * { transition: none !important; }
}
`;
