/**
 * The Welcome Tour (4.0): a short run of cards that shows a rider around OnMyLead. It is the same on
 * iPhone, iPad, Android phones and tablets, and onmylead.com.
 *
 * - A new account sees the whole tour once, on Home, after sign-in and the Rider Agreement.
 * - A rider who had the app before sees one What's New card instead, with Take the Tour on it.
 * - Anyone can take the tour again from You > Help > Take the Tour.
 * - Admin > Features > Welcome Tour (flag `welcome_tour`) turns the automatic showing off for
 *   everyone. Take the Tour under You still works.
 *
 * Each card can name the server flags of the feature it shows; it is left out while all of them
 * are off (or don't exist yet in this build), so the tour never describes something riders can't use.
 *
 * Pure, so it is tested without a phone.
 */

/** Synced across the rider's devices (core/synced-settings.ts): the tour or What's New was shown. */
export const WELCOME_TOUR_SYNC_KEY = 'tour.welcome.v1';
/** On this device, per account. */
export const welcomeTourKey = (uid: string) => `onmylead.welcomeTour.${uid}`;
/** Wait this long on Home first, so it doesn't land on a fast tap or the first paint. */
export const WELCOME_TOUR_DELAY_MS = 800;
/** An account this young gets the whole tour; an older one had the app before and gets What's New. */
export const NEW_ACCOUNT_MS = 2 * 24 * 60 * 60 * 1000;
/** The version the What's New card describes. */
export const WHATS_NEW_VERSION = '4.0';

export type TourImage = 'welcome' | 'join' | 'live' | 'status' | 'bluetooth' | 'mapMode' | 'weather' | 'outRiding' | 'places' | 'social' | 'badges' | 'starlink';

export type TourCard = {
  id: string;
  image: TourImage;
  title: string;
  body: string;
  /** Used instead of body when the flag `bodyAltUnless` is off. */
  bodyAlt?: string;
  bodyAltUnless?: string;
  /** Shown above the title. */
  isNew?: boolean;
  /** A Pro tag above the title, with this label beside it. */
  pro?: string;
  /** The same, shown only once the 4.0 Free and Pro plan (pro_plan_4) is on. */
  proWithPlan4?: string;
  /** The four activity chips (only while `activities` is on). */
  chips?: boolean;
  /** Shown only while at least one of these server flags exists and is on. */
  flags?: string[];
};

/**
 * Every card, in order. The English text is the translation key (core/translations); the
 * component passes each through t(). Keep the words in step with help/articles/welcome-tour.md.
 */
export const TOUR_CARDS: TourCard[] = [
  {
    id: 'welcome',
    image: 'welcome',
    title: 'Welcome to OnMyLead',
    body: 'Group rides where nobody gets left behind. Pick your activity any time from the button at the top of Home.',
    bodyAlt: 'Group rides where nobody gets left behind. Here is a quick look around.',
    bodyAltUnless: 'activities',
    chips: true,
  },
  {
    id: 'join',
    image: 'join',
    title: 'Join or Create a Ride',
    body: 'Got a code from your ride leader? Type it in or scan the QR. Leading the ride? Create a Ride and share your code.',
    proWithPlan4: 'Create a Ride',
  },
  {
    id: 'live',
    image: 'live',
    title: 'Everyone on One Live Map',
    body: 'In Ride Mode you see every rider on the map: who is up front, who is at the back, and who got separated.',
  },
  {
    id: 'status',
    image: 'status',
    title: 'One Tap Tells the Group',
    body: 'On My Way, Need a Minute, Flat Tire. Hold EMERGENCY and every phone on the ride sounds a siren and shows where you are.',
  },
  {
    id: 'bluetooth',
    image: 'bluetooth',
    title: 'No Service? Keep Sharing',
    body: 'When the signal drops, phones on your ride pass locations and messages to each other over Bluetooth. EMERGENCY works on every plan.',
    pro: 'Bluetooth Sharing',
    flags: ['bluetooth_sharing'],
  },
  {
    id: 'mapMode',
    image: 'mapMode',
    title: 'Map Mode for Solo Rides',
    body: 'Trails, speed, elevation, recording and offline maps. Map Features show what matters for your activity. Turn any trail into a group ride when friends want in.',
    flags: ['nav_mode'],
  },
  {
    id: 'weather',
    image: 'weather',
    title: 'Weather Before It Hits',
    body: 'Tap the temperature in Ride Mode or Map Mode for the hourly and 7-day forecast and weather alerts. Weather Radar shows storms moving over your map. Turn them on in Map Settings. U.S. only.',
    isNew: true,
    pro: 'Weather Radar',
    flags: ['weather_forecast', 'weather_radar'],
  },
  {
    id: 'outRiding',
    image: 'outRiding',
    title: 'Find Riders Out Near You',
    body: 'Turn on Out Riding to see friends and nearby riders who are out right now, and message them. Only a rough distance is shown, never your exact spot.',
  },
  {
    id: 'places',
    image: 'places',
    title: 'Places to Ride and Events',
    body: 'Parks, forests and trails near you with rider reviews. Rallies, poker runs and ride weekends in Events.',
    isNew: true,
    proWithPlan4: 'Places to Ride',
    flags: ['scout'],
  },
  {
    id: 'social',
    image: 'social',
    title: 'Your Crew in Social',
    body: 'Add friends, start a riding group, post ride reports and photos, and see what your riders are up to in the Feed.',
  },
  {
    id: 'badges',
    image: 'badges',
    title: 'Earn Badges',
    body: 'Miles, rides and trails earn badges. See where you rank on the Leaderboard in your state or country.',
    flags: ['leaderboard'],
  },
  {
    id: 'starlink',
    image: 'starlink',
    title: 'Starlink',
    body: 'Got Starlink on your machine? Connect to its Wi-Fi and Home shows its speed, signal and how many devices are on it. The Starlink page has setup tips and a power budget.',
    proWithPlan4: 'Starlink',
    flags: ['starlink'],
  },
];

export type WhatsNewItem = { title: string; body: string; color: string; flags?: string[] };

/** The What's New card for riders who had the app before 4.0. */
export const WHATS_NEW: WhatsNewItem[] = [
  { title: 'Activities', body: 'Offroad, Motorcycle, Road Trip and Snowmobile. Switch at the top of Home.', color: '#7CC4FF', flags: ['activities'] },
  { title: 'Places to Ride', body: 'Parks, forests and trails near you, with rider reviews.', color: '#E5262E', flags: ['scout'] },
  { title: 'Weather', body: 'Forecast and alerts where you are. Weather Radar on your map with Pro.', color: '#34C759', flags: ['weather_forecast', 'weather_radar'] },
  { title: 'Route Time', body: 'Enter your average speed to see an estimated time.', color: '#3B86F7', flags: ['route_eta'] },
];

/** Is a server flag on? Flags this build doesn't know are off. */
export type FlagCheck = (flag: string) => boolean;

const shown = (flags: string[] | undefined, on: FlagCheck) => !flags || flags.some(on);

/** The cards to show, in order. Welcome and the core ride cards always show. */
export function tourCards(on: FlagCheck): TourCard[] {
  return TOUR_CARDS.filter((c) => shown(c.flags, on));
}

export function cardBody(c: TourCard, on: FlagCheck): string {
  return c.bodyAlt && c.bodyAltUnless && !on(c.bodyAltUnless) ? c.bodyAlt : c.body;
}

export function whatsNewItems(on: FlagCheck): WhatsNewItem[] {
  return WHATS_NEW.filter((i) => shown(i.flags, on));
}

export type TourMode = 'tour' | 'news';

export type TourState = {
  signedIn: boolean;
  /** The Rider Agreement still has to be agreed on this device. */
  needsAgreement: boolean;
  /** Admin > Features > Welcome Tour. */
  enabled: boolean;
  /** Seen on this device, or on another of the rider's devices. */
  seen: boolean;
  /** When the account was made (ISO), or null when unknown. */
  accountCreatedAt: string | null;
  now: number;
};

/**
 * What Home shows on its own: the whole tour for a new account, What's New for a rider who had
 * the app before, or nothing. An account with no known age is treated as an existing rider, who
 * gets the short card and can still take the tour.
 */
export function welcomeTourMode(s: TourState): TourMode | null {
  if (!s.signedIn || s.needsAgreement || !s.enabled || s.seen) return null;
  const made = s.accountCreatedAt ? Date.parse(s.accountCreatedAt) : NaN;
  if (Number.isNaN(made)) return 'news';
  return s.now - made < NEW_ACCOUNT_MS ? 'tour' : 'news';
}
