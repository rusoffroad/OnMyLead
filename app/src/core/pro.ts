/**
 * OnMyLead Pro on the app side: what each plan includes, how a server "Pro required" answer turns
 * into a friendly prompt, and the small rules the Pro screen, Subscription settings and the gates
 * share. Pure, so it is tested without a phone.
 *
 * Plan status itself lives in ./entitlements (the server's my_entitlements()). Until the server
 * has the Pro update, switchedOn is false and nothing is gated.
 */

import { can, trialBadgeText, type Entitlements, type FeatureKey, type ProError } from './entitlements';

import { coreLocale, tc } from './i18n';
/** Free history shows this many past rides. */
export const FREE_HISTORY = 5;

/** Free Map Mode hours each UTC month (feature_plans map_mode allowance; Admin can change it). */
export const FREE_MAP_HOURS = 8;

/** The plan line, e.g. "Pro Trial — 12 Days Remaining", "Pro" or "Free". */
export function planHeadline(ent: Entitlements): string {
  return trialBadgeText(ent) ?? tc(ent.label);
}

/** The first day of next UTC month, when the Free allowance resets. */
export function nextReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** A server refusal as a prompt: a Pro feature, or the Free ride limit. */
export type ProBlock = ProError;

/** What the Pro prompt says about each feature: what it does, and what stays free. */
/** `body` is a translation key; `vars` fill its {placeholders}. */
export const FEATURE_INFO: Record<FeatureKey, { title: string; body: string; vars?: Record<string, number> }> = {
  create_ride: {
    title: 'Create More Rides',
    body: 'Free accounts create one ride each month. Pro creates as many as you lead. Joining rides is always free.',
  },
  import_gpx: {
    title: 'Import GPX Routes',
    body: 'Bring in a track from Gaia, onX or any GPX file. Drawing a route on the map stays free.',
  },
  offline_maps: {
    title: 'Offline Maps',
    body: 'Download satellite, topo and trail maps so Ride Mode keeps working with no signal. Maps already on your phone keep working on Free.',
  },
  saved_groups: {
    title: 'Saved Riding Groups',
    body: 'Save your crew, add riders and invite everyone in one tap. Joining a group and getting its ride invites stays free.',
  },
  create_poll: {
    title: 'Ride Polls',
    body: 'Ask the group a quick question in ride chat. Everyone can still vote on polls for free.',
  },
  ride_history: {
    title: 'Full Ride History',
    body: 'Free shows your last {n} rides. Pro shows every ride you’ve been on. Nothing is ever deleted.',
    vars: { n: FREE_HISTORY },
  },
  advanced_trip_planning: {
    title: 'Advanced Trip Planning',
    body: 'Plan several trips at once, start from packing lists, copy trips and link them to rides. One trip and the fuel check stay free.',
  },
  advanced_stats: {
    title: 'Advanced Ride Statistics',
    body: 'Moving time, average and top speed, climbing and the group’s totals after every ride. Distance and time out stay free.',
  },
  premium_ride_cards: {
    title: 'Premium Ride Cards',
    body: 'Share your ride with the Full Stats and Big Number layouts. The standard card stays free.',
  },
  record_trails: {
    title: 'Record Your Trails',
    body: 'Ride and Map Mode draws your line, with distance, climb and time. The offroad map, following trails, measuring and rating trails stay free.',
  },
  share_trails: {
    title: 'Share Your Trails',
    body: 'Submit your trails to the public map with photos, difficulty and vehicles. Seeing, following and rating other riders’ trails stays free.',
  },
  trail_rides: {
    title: 'Group Rides on Your Trails',
    body: 'Turn a trail into a group ride’s route in one tap. Drawing a route on the map stays free.',
  },
  social_posts: {
    title: 'Post, Comment and Share',
    body: 'Post to your profile, comment on friends’ rides and share your activity to Facebook, Instagram and X. Seeing the Feed, reading comments and liking stay free.',
  },
  create_events: {
    title: 'Create Events',
    body: 'Post rallies, poker runs and ride weekends with photos, an agenda and their group rides. Seeing events, saying you’re going and co-hosting stay free.',
  },
  custom_codes: {
    title: 'Custom Share Codes',
    body: 'Pick your own easy code for a ride, group or friend link. Every ride and group still gets a free code that works.',
  },
  quick_replies: {
    title: 'Your Own Messages',
    body: 'Type your own one-line message to the group in Ride Mode and save your favorite quick replies. The status buttons, Need Help and EMERGENCY stay free.',
  },
  music_controls: {
    title: 'Music Controls',
    body: 'Play, pause, skip and change the volume from Ride Mode and Map Mode without leaving the map. Your music app itself stays free to use.',
  },
  vote_polls: {
    title: 'Vote on Ride Polls',
    body: 'Answer the group’s quick questions in ride chat. Reading the poll and its results stays free.',
  },
  route_builder: {
    title: 'Draw Ride Routes',
    body: 'Draw the route for your ride on the map, snapped to trails and roads. Freeride rides and following the leader’s route stay free.',
  },
  waypoints: {
    title: 'Waypoints and Planned Stops',
    body: 'Drop waypoints and plan stops with symbols for fuel, camp, hazards and more. Seeing the leader’s waypoints on a ride stays free.',
  },
  directions: {
    title: 'Directions',
    body: 'Hand any spot to Apple Maps or Google Maps for turn-by-turn directions. Directions to a rider who needs help stay free.',
  },
  map_layers: {
    title: 'Map Layers',
    body: 'Switch between satellite, topo and the trails layer with trail names and closures. The standard map stays free.',
  },
  map_mode: {
    title: 'Unlimited Map Mode',
    body: 'Free includes hours of Map Mode every month. Pro has no limit. Riding with a group in Ride Mode is always unlimited.',
  },
  custom_trails: {
    title: 'Map a Custom Trail',
    body: 'Draw a trail on the map and measure distances along it. Following trails stays free.',
  },
  save_trails: {
    title: 'Save Your Trails',
    body: 'Keep the trails you draw and record in My Trails, with photos and details. Following other riders’ trails stays free.',
  },
  rate_trails: {
    title: 'Rate Trails',
    body: 'Rate how good a trail is and how accurate its line is. Seeing ratings stays free.',
  },
  track_line: {
    title: 'Track Line',
    body: 'See where you’ve been on the map, a new color each day, for the last 7 days. Your dot on the map stays free.',
  },
  trail_spots: {
    title: 'Named Spots on Trails',
    body: 'Mark obstacles, hazards, water crossings and viewpoints on your trails. Seeing spots on shared trails stays free.',
  },
  garage_build: {
    title: 'Garage Build Sheet',
    body: 'Track parts and extras with costs, build totals, the Build Sheet and CSV export. Your machines, specs and fuel range stay free.',
  },
  sync: {
    title: 'Sync Across Devices',
    body: 'Your settings and Map Mode trails follow you to every phone, tablet and the website. Your account and rides are on every device for free.',
  },
  themes: {
    title: 'Themes and Light Mode',
    body: 'Pick Light, Match Phone or one of four themes. Dark mode and Color Blind Mode stay free.',
  },
  natural_voices: {
    title: 'Natural Voices',
    body: 'Pick a natural-sounding voice for spoken alerts. Alerts are still read out loud on Free.',
  },
  tablet_web: {
    title: 'iPad, Android Tablets and the Website',
    body: 'Use OnMyLead on a big screen. Joining a ride and following the leader stay free on every device.',
  },
};

/** The comparison on the Pro screen. true = included, false = not, a string = the amount. */
export const COMPARISON: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: 'Create Rides', free: '1 a Month', pro: 'Unlimited' },
  { label: 'Join Rides and Follow the Leader', free: 'Unlimited', pro: 'Unlimited' },
  { label: 'Live Tracking, SOS, Crash Alert and Ride Bubble', free: true, pro: true },
  { label: 'Ride Chat', free: true, pro: true },
  { label: 'Map Mode', free: '8 Hours a Month', pro: 'Unlimited' },
  { label: 'Social Feed: See, Like and Read Comments', free: true, pro: true },
  { label: 'Badges, Events and Friends', free: true, pro: true },
  { label: 'Draw Routes, Waypoints and Directions', free: false, pro: true },
  { label: 'Map Layers: Satellite, Topo and Trails', free: false, pro: true },
  { label: 'Draw, Record, Save, Rate and Share Trails', free: false, pro: true },
  { label: 'Track Line and Named Spots', free: false, pro: true },
  { label: 'Group Rides on Your Trails', free: false, pro: true },
  { label: 'Import GPX Routes', free: false, pro: true },
  { label: 'Offline Maps', free: false, pro: true },
  { label: 'Post, Comment and Share to Social Media', free: false, pro: true },
  { label: 'Create Events', free: false, pro: true },
  { label: 'Saved Riding Groups and Custom Codes', free: false, pro: true },
  { label: 'Create and Vote on Ride Polls', free: false, pro: true },
  { label: 'Your Own Messages and Music Controls', free: false, pro: true },
  { label: 'Ride History', free: `Last ${FREE_HISTORY}`, pro: 'All' },
  { label: 'Advanced Ride Statistics and Premium Cards', free: false, pro: true },
  { label: 'Advanced Trip Planning', free: false, pro: true },
  { label: 'Garage Build Sheet', free: false, pro: true },
  { label: 'Themes, Light Mode and Natural Voices', free: false, pro: true },
  { label: 'Sync Across Devices', free: false, pro: true },
  { label: 'iPad, Android Tablets and the Website', free: false, pro: true },
];

export const PRICES = { monthly: 4.99, annual: 29.99 } as const;

/** How much the annual plan saves against twelve monthly payments, rounded (50 for $29.99 vs $4.99). */
export function annualSavingsPercent(monthly: number = PRICES.monthly, annual: number = PRICES.annual): number {
  return Math.round((1 - annual / (monthly * 12)) * 100);
}

/** "$2.50", the annual price spread over twelve months. */
export function annualPerMonth(annual: number = PRICES.annual): string {
  return `$${(Math.ceil((annual / 12) * 100) / 100).toFixed(2)}`;
}

/** Split past rides into the ones shown and how many more Pro would show. */
export function historySplit<T>(items: T[], limit: number | null): { shown: T[]; hidden: number } {
  if (limit == null || items.length <= limit) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}

/** A trip still counts as active until its last day (end, or start when there's no end) is past. */
export function isActiveTrip(trip: { starts_on: string | null; ends_on: string | null }, today: string): boolean {
  const last = trip.ends_on ?? trip.starts_on;
  return last == null || last >= today;
}

/** Free keeps one active trip; Pro (or unknown status) plans as many as it likes. */
export function canStartTrip(ent: Entitlements, trips: { starts_on: string | null; ends_on: string | null }[], today: string): boolean {
  if (can(ent, 'advanced_trip_planning')) return true;
  return !trips.some((t) => isActiveTrip(t, today));
}

/** "Nov 11, 2026" for trial and renewal dates. */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(coreLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Today in the phone's own calendar, as YYYY-MM-DD (how trip dates are stored). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const REPORT_REASONS = {
  ride: ['Unsafe Plan', 'Spam or Scam', 'Offensive Content', 'Something Else'],
  rider: ['Harassment', 'Threats', 'Unsafe Riding', 'Spam or Scam', 'Fake Account', 'Inappropriate Photo', 'Something Else'],
  event: ['Spam or Scam', 'Fake Event', 'Offensive Content', 'Inappropriate Photo', 'Unsafe Plan', 'Something Else'],
} as const;

/** Apple's standard licence agreement serves as the Terms of Use for subscriptions. */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://onmylead.com/privacy';
