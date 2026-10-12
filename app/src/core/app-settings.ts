/**
 * What the owner sets on the Admin Dashboard's Settings page and every rider's app reads
 * (public_app_settings() in migration 20261018000000_pro_entitlements.sql):
 *   * an announcement and a maintenance notice, each null or {"text": 1-500 chars, "until": ISO?};
 *   * feature flags, an object of booleans.
 *
 * Flags are kill switches for extras, never for safety: a flag the owner hasn't set, or an app that
 * can't reach the server, leaves the feature on. Ride Mode, Help and SOS, Mechanical Issue,
 * location sharing, chat and joining have no flag.
 */

export type Notice = { text: string; until?: string };

export type AppSettings = {
  announcement: Notice | null;
  maintenance: Notice | null;
  flags: Record<string, boolean>;
};

export const NO_SETTINGS: AppSettings = { announcement: null, maintenance: null, flags: {} };

/** The flags the app reads, with the names and notes the Settings page shows (Title Case). */
export const APP_FLAGS = {
  find_a_ride: { label: 'Find a Ride', hint: 'The Find a Ride button and map, and Public Rides on the home screen. Invite codes and links still work.' },
  trip_planner: { label: 'Trip Planner', hint: 'The Trip Planner on the home screen. Saved trips are kept.' },
  starlink: { label: 'Starlink', hint: 'The Starlink page on the home screen.' },
  rus_gear: { label: 'RUS Gear Suggestions', hint: 'Product suggestions in the Garage and on trip checklists.' },
  ride_polls: { label: 'Ride Polls', hint: 'Creating new polls in ride chat. Polls already sent can still be voted on.' },
} as const satisfies Record<string, { label: string; hint: string }>;

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
  return { announcement: parseNotice(o.announcement), maintenance: parseNotice(o.maintenance), flags };
}

/** The notice if it is still showing: none once its "until" time has passed. */
export function liveNotice(n: Notice | null, now: number = Date.now()): Notice | null {
  if (!n) return null;
  if (n.until && Date.parse(n.until) <= now) return null;
  return n;
}

/** True unless the owner switched the feature off. */
export function flagOn(s: AppSettings, flag: AppFlag): boolean {
  return s.flags[flag] !== false;
}

/** A short key for one notice's wording, so dismissing it hides that text only; new text shows again. */
export function noticeKey(n: Notice): string {
  let h = 5381;
  const s = `${n.text}\u0000${n.until ?? ''}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
