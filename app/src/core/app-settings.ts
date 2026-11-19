/**
 * What the owner sets on the Admin Dashboard's Features and Settings pages and every rider's app reads
 * (public_app_settings() in migration 20261018000000_pro_entitlements.sql):
 *   * an announcement and a maintenance notice, each null or {"text": 1-500 chars, "until": ISO?};
 *   * feature flags, an object of booleans;
 *   * release controls (`app_versions`: minimum and latest version per store, and a notice for
 *     chosen versions), read by core/app-versions.ts. Builds before 1.0.3 ignore them.
 *
 * Flags are kill switches for extras, never for safety: a flag the owner hasn't set, or an app that
 * can't reach the server, leaves the feature on. Ride Mode, Help and SOS, EMERGENCY, Mechanical
 * Issue, location sharing, navigation, chat, joining and CarPlay have no flag. An app build older
 * than a flag's `since` version ignores it (the feature stays on there).
 */

import { NO_VERSIONS, parseAppVersions, type AppVersions, type Notice } from './app-versions';

export type { Notice };

export type AppSettings = {
  announcement: Notice | null;
  maintenance: Notice | null;
  flags: Record<string, boolean>;
  versions: AppVersions;
};

export const NO_SETTINGS: AppSettings = { announcement: null, maintenance: null, flags: {}, versions: NO_VERSIONS };

/** How the Features page on the Admin Dashboard groups the switches, in order. */
export const FLAG_GROUPS = [
  { key: 'maps', title: 'Maps and Navigation' },
  { key: 'rides', title: 'Rides and Activities' },
  { key: 'social', title: 'Social and Community' },
  { key: 'connect', title: 'No-Service Sharing' },
  { key: 'extras', title: 'Toolkit and Extras' },
  { key: 'account', title: 'Sign-In and Rewards' },
] as const;

export type FlagGroup = (typeof FLAG_GROUPS)[number]['key'];

type FlagInfo = {
  label: string;
  hint: string;
  group: FlagGroup;
  /** Starts off: a feature that needs setting up (or testing) first. */
  offUntilSet?: boolean;
  /** The first app version that reads the switch. Older builds keep the feature on whatever it says. */
  since?: string;
};

/** The flags the app reads, with the names and notes the Admin Features page shows (Title Case). */
export const APP_FLAGS = {
  nav_mode: { group: 'maps', label: 'Map Mode', hint: 'The Map Mode card on the home screen (offroad map, recording, custom trails and sharing). Trails on riders’ phones are kept; rider trails on maps still show.' },
  mapbox_maps: { group: 'maps', label: 'Mapbox Maps', hint: 'Every map drawn by Mapbox (Satellite, Topo, 3D Terrain and the standard map, free up to 25,000 riders a month). Off: the Apple, Google and website maps from 2.0 draw instead, with the same trails and downloads.' },
  terrain_3d: { group: 'maps', label: '3D Terrain', hint: 'The 3D Terrain map style in Ride Mode and Map Mode (Mapbox: free up to 25,000 riders a month). Off: riders who picked it see the flat satellite map.' },
  route_eta: {
    group: 'maps',
    label: 'Route Estimated Time',
    hint: 'Average Speed and Estimated Time under the route builder (app 4.0). Off hides them; drawing and saving routes is not affected.',
    since: '4.0',
  },
  weather_radar: {
    group: 'maps',
    label: 'Weather Radar',
    hint: 'The Weather Radar switch in Map Settings (Pro): NOAA rain and snow radar over Ride Mode, Map Mode and the route builder (app 4.0). Off takes the radar off every map at once; free, no account.',
    since: '4.0',
  },
  weather_forecast: {
    group: 'maps',
    label: 'Forecast Where You Are',
    hint: 'The forecast button on Ride Mode and Map Mode (free): the temperature, the next hours, 7 days and official weather alerts from the National Weather Service (app 4.0). Off hides it; Ride Day weather on ride pages is not affected.',
    since: '4.0',
  },
  waypoint_import: {
    group: 'maps',
    label: 'Import Waypoints',
    hint: 'The Import Waypoints button in Map Mode and on a ride’s Waypoints page (Pro), and opening GPX, KML and KMZ files from other map apps in OnMyLead (app 4.0). Off hides the buttons; waypoints already imported stay.',
    since: '4.0',
  },
  trail_ratings: {
    group: 'maps',
    label: 'Rate Trails',
    hint: 'The Rate This Trail button on shared trails. Off: ratings riders already gave still show; nobody can add or change one.',
    since: '4.0',
  },
  find_a_ride: { group: 'rides', label: 'Find a Ride', hint: 'The Find a Ride button and map, and Public Rides on the home screen. Invite codes and links still work.' },
  scout: { group: 'rides', label: 'Places to Ride', hint: 'The Places to Ride switch on the Find tab (off-road parks, OHV areas and trails near the rider, and Suggest a Place). Place pages already open still work.' },
  activities: {
    group: 'rides',
    label: 'Activities',
    hint: 'The activity switcher on Home (Offroad, Motorcycle, Road Trip, Snowmobile): each activity’s colours, Home words, Ride Mode buttons, and rides, events and places for that activity. Off: everyone sees Offroad, as before. On from 4.0 (Chris 2026-11-19).',
  },
  ride_polls: { group: 'rides', label: 'Ride Polls', hint: 'Creating new polls in ride chat. Polls already sent can still be voted on.' },
  ride_cards: {
    group: 'rides',
    label: 'Ride Cards',
    hint: 'The shareable Ride Card on a finished ride’s summary. Off hides the card; the ride’s stats and the group’s totals still show.',
    since: '4.0',
  },
  home_feed: { group: 'social', label: 'Home Feed', hint: 'The Feed on the home screen (friends’ rides, badges and trails). Riders’ feed settings are kept.' },
  social_posting: {
    group: 'social',
    label: 'Social Posts',
    hint: 'Writing new ride reports in Social (“Post a ride report…”). Off: posts already shared, likes and comments still show.',
    since: '4.0',
  },
  leaderboard: {
    group: 'social',
    label: 'Badge Leaderboard',
    hint: 'The Leaderboard button on the Badges page (where you rank in your state, your country and everywhere). Badges themselves are not affected.',
    since: '4.0',
  },
  founder_tag: {
    group: 'social',
    label: 'App Founder Tag',
    hint: 'The App Founder tag beside the Founder’s name in Social, the Feed and profiles. Off hides the tag; the friendship is kept.',
    since: '4.0',
  },
  bluetooth_sharing: { group: 'connect', label: 'Bluetooth Sharing', hint: 'Ride Mode passing spots and alerts between nearby riders over Bluetooth when there is no service (app 2.1). Off stops the Bluetooth radio; sharing and alerts over the internet are not affected.' },
  radio_sharing: {
    group: 'connect',
    label: 'Radio Sharing (Meshtastic)',
    hint: 'Riders who pair their own Meshtastic radio under You also send Bluetooth Sharing spots, alerts and messages over it, for miles of range with no service (app 4.0). On unless turned off here. Off hides You > Radio Sharing and drops the radio link at once, no app update needed; Bluetooth Sharing is not affected.',
  },
  music_controls: { group: 'extras', label: 'Music Controls', hint: 'The Music button in Ride Mode and Map Mode (play, pause, skip and volume for the music on the phone). Riders can also hide it themselves under You.' },
  trip_planner: { group: 'extras', label: 'Trip Planner', hint: 'The Trip Planner in the home screen toolkit. Saved trips are kept.' },
  starlink: { group: 'extras', label: 'Starlink', hint: 'The Starlink page in the home screen toolkit.' },
  starlink_mount_ad: { group: 'extras', label: 'Starlink Mount Ad', hint: 'The RUS Starlink Mini Mount V2 ad on the Starlink page.' },
  rus_gear: { group: 'extras', label: 'RUS Gear Suggestions', hint: 'Product suggestions in the Garage and on trip checklists.' },
  welcome_tour: {
    group: 'account',
    label: 'Welcome Tour',
    hint: 'The short tour of the app that shows once on Home: the whole tour for new riders, a What’s New card for riders who had the app before (app 4.0). Off stops it showing by itself; You > Help > Take the Tour still works.',
    since: '4.0',
  },
  referrals: { group: 'account', label: 'Refer a Friend', hint: 'Invite Friends and the 50% off Pro Annual reward. Turn on only once the Apple offer codes and the Google Play referral-50 offer exist. Rewards already earned can still be claimed when it is off.' },
  apple_web_sign_in: {
    group: 'account',
    label: 'Sign in with Apple on the Website and Android',
    hint: 'Continue with Apple on onmylead.com and in the Android app, through Apple’s web sign-in. Off until the Apple Services ID and its secret are set up in Supabase (docs/web-sign-in-with-apple.md); on before that, the button fails.',
    offUntilSet: true,
  },
} as const satisfies Record<string, FlagInfo>;

export type AppFlag = keyof typeof APP_FLAGS;

export const APP_FLAG_KEYS = Object.keys(APP_FLAGS) as AppFlag[];

function parseNotice(v: unknown): Notice | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text) return null;
  return typeof o.until === 'string' && !Number.isNaN(Date.parse(o.until)) ? { text, until: o.until } : { text };
}

/** Reads the server's answer, dropping anything malformed instead of failing. */
export function parseAppSettings(v: unknown): AppSettings {
  if (!v || typeof v !== 'object') return NO_SETTINGS;
  const o = v as Record<string, unknown>;
  const flags: Record<string, boolean> = {};
  if (o.flags && typeof o.flags === 'object' && !Array.isArray(o.flags)) {
    for (const [k, b] of Object.entries(o.flags as Record<string, unknown>)) if (typeof b === 'boolean') flags[k] = b;
  }
  return { announcement: parseNotice(o.announcement), maintenance: parseNotice(o.maintenance), flags, versions: parseAppVersions(o.app_versions) };
}

/** The notice if it is still showing: none once its "until" time has passed. */
export function liveNotice(n: Notice | null, now: number = Date.now()): Notice | null {
  if (!n) return null;
  if (n.until && Date.parse(n.until) <= now) return null;
  return n;
}

/** Flags that need setting up first (an Apple secret, say) start off; the owner switches them on. */
export function flagOffUntilSet(flag: AppFlag): boolean {
  return (APP_FLAGS[flag] as FlagInfo).offUntilSet === true;
}

/** The first app version that reads this switch, if it is newer than the first flags (1.x). */
export function flagSince(flag: AppFlag): string | undefined {
  return (APP_FLAGS[flag] as FlagInfo).since;
}

/** The flags in one group of the Features page, in list order. */
export function flagsInGroup(group: FlagGroup): AppFlag[] {
  return APP_FLAG_KEYS.filter((k) => (APP_FLAGS[k] as FlagInfo).group === group);
}

/**
 * The flags the owner changed on the Features page: what each one was and is now, by what the
 * app does (so setting a never-set flag to its default isn't a change).
 */
export function flagChanges(before: Record<string, boolean>, after: Record<string, boolean>): { flag: AppFlag; on: boolean }[] {
  const s = (flags: Record<string, boolean>) => ({ ...NO_SETTINGS, flags });
  return APP_FLAG_KEYS.filter((k) => flagOn(s(before), k) !== flagOn(s(after), k)).map((k) => ({ flag: k, on: flagOn(s(after), k) }));
}

/** True unless the owner switched the feature off (or, for a flag that starts off, until the owner switched it on). */
export function flagOn(s: AppSettings, flag: AppFlag): boolean {
  return flagOffUntilSet(flag) ? s.flags[flag] === true : s.flags[flag] !== false;
}

/** A short key for one notice's wording, so dismissing it hides that text only; new text shows again. */
export function noticeKey(n: Notice): string {
  let h = 5381;
  const s = `${n.text}\u0000${n.until ?? ''}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
