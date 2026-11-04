/**
 * What the owner sets on the Admin Dashboard's Settings page and every rider's app reads
 * (public_app_settings() in migration 20261018000000_pro_entitlements.sql):
 *   * an announcement and a maintenance notice, each null or {"text": 1-500 chars, "until": ISO?};
 *   * feature flags, an object of booleans;
 *   * release controls (`app_versions`: minimum and latest version per store, and a notice for
 *     chosen versions), read by core/app-versions.ts. Builds before 1.0.3 ignore them.
 *
 * Flags are kill switches for extras, never for safety: a flag the owner hasn't set, or an app that
 * can't reach the server, leaves the feature on. Ride Mode, Help and SOS, Mechanical Issue,
 * location sharing, chat and joining have no flag.
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

/** The flags the app reads, with the names and notes the Settings page shows (Title Case). */
export const APP_FLAGS = {
  find_a_ride: { label: 'Find a Ride', hint: 'The Find a Ride button and map, and Public Rides on the home screen. Invite codes and links still work.' },
  scout: { label: 'Scout (Places to Ride)', hint: 'The Places to Ride switch on the Find tab (off-road parks, OHV areas and trails near the rider, and Suggest a Place). Place pages already open still work.' },
  trip_planner: { label: 'Trip Planner', hint: 'The Trip Planner in the home screen toolkit. Saved trips are kept.' },
  starlink: { label: 'Starlink', hint: 'The Starlink page in the home screen toolkit.' },
  rus_gear: { label: 'RUS Gear Suggestions', hint: 'Product suggestions in the Garage and on trip checklists.' },
  starlink_mount_ad: { label: 'Starlink Mount Ad', hint: 'The RUS Starlink Mini Mount V2 ad on the Starlink page.' },
  ride_polls: { label: 'Ride Polls', hint: 'Creating new polls in ride chat. Polls already sent can still be voted on.' },
  music_controls: { label: 'Music Controls', hint: 'The Music button in Ride Mode and Map Mode (play, pause, skip and volume for the music on the phone). Riders can also hide it themselves under You.' },
  nav_mode: { label: 'Map Mode', hint: 'The Map Mode card on the home screen (offroad map, recording, custom trails and sharing). Trails on riders’ phones are kept; rider trails on maps still show.' },
  mapbox_maps: { label: 'Mapbox Maps', hint: 'Every map drawn by Mapbox (Satellite, Topo, 3D Terrain and the standard map, free up to 25,000 riders a month). Off: the Apple, Google and website maps from 2.0 draw instead, with the same trails and downloads.' },
  terrain_3d: { label: '3D Terrain', hint: 'The 3D Terrain map style in Ride Mode and Map Mode (Mapbox: free up to 25,000 riders a month). Off: riders who picked it see the flat satellite map.' },
  bluetooth_sharing: { label: 'Bluetooth Sharing', hint: 'Ride Mode passing spots and alerts between nearby riders over Bluetooth when there is no service (app 2.1). Off stops the Bluetooth radio; sharing and alerts over the internet are not affected.' },
  referrals: { label: 'Refer a Friend', hint: 'Invite Friends and the 50% off Pro Annual reward. Turn on only once the Apple offer codes and the Google Play referral-50 offer exist. Rewards already earned can still be claimed when it is off.' },
  home_feed: { label: 'Home Feed', hint: 'The Feed on the home screen (friends’ rides, badges and trails). Riders’ feed settings are kept.' },
  apple_web_sign_in: {
    label: 'Sign in with Apple on the Website and Android',
    hint: 'Continue with Apple on onmylead.com and in the Android app, through Apple’s web sign-in. Off until the Apple Services ID and its secret are set up in Supabase (docs/web-sign-in-with-apple.md); on before that, the button fails.',
    offUntilSet: true,
  },
} as const satisfies Record<string, { label: string; hint: string; offUntilSet?: boolean }>;

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
  return (APP_FLAGS[flag] as { offUntilSet?: boolean }).offUntilSet === true;
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
