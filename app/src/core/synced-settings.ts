/**
 * Settings that follow the rider's account: change one on the iPhone and the iPad, the Android
 * phone, the tablet and onmylead.com pick it up the next time they sync (lib/settings-sync.ts,
 * migration 20261103300000_account_sync.sql).
 *
 * Each setting is kept the way the app already stores it on the device (a string under its
 * storage key), plus the time it was last changed. Two devices that both changed a setting keep
 * the newer change, setting by setting, so turning on Follow Me on the phone never undoes the map
 * style picked on the iPad a minute earlier.
 *
 * ADDING A SETTING: put its storage key in SYNCED_SETTINGS below with a one-line reason, and write
 * it with setSyncedItem (lib/settings-sync) instead of AsyncStorage.setItem. Read it as before and
 * listen with onSyncedChange so a value that arrives from another device shows straight away.
 * Something about this one device (a calibration, downloaded files, a battery choice, location
 * history) does NOT belong here: list it in DEVICE_ONLY instead, so the choice is written down.
 *
 * Privacy: none of these is a location. Location history (Track Line breadcrumbs, a recording in
 * progress, the ride track queue) stays on the device and is listed in DEVICE_ONLY.
 *
 * Pure, so it is tested without a phone.
 */

export type SyncedEntry = {
  /** The value as the device stores it, or null when the rider cleared it. */
  v: string | null;
  /** When it was changed, ms since 1970 (the device's clock; the server caps it at its own clock). */
  at: number;
};
export type SyncedMap = Record<string, SyncedEntry>;

/** Every setting that follows the account, by storage key. */
export const SYNCED_SETTINGS: Record<string, string> = {
  // Maps
  'map.layers.v1': 'Base map (Satellite, Topo, ...) and the trail layer switch',
  'map.riderTrails.v1': 'Show trails other riders shared',
  'map.followMe.v1': 'Follow Me on live maps',
  'nav.trackLineOn.v1': 'The Track Line switch (the line itself stays on the device)',
  'nav.measureTrails.v1': 'Map Mode measures along trails',
  'route.followTrails.v1': 'Route Builder snaps to trails',
  'nav.customTrailIntro.v1': 'The custom trail intro was seen',
  'directions.app.v1': 'Directions app: Apple Maps, Google Maps or Ask Each Time',
  // Ride Mode
  'music.controls.v1': 'Music controls in Ride Mode',
  'ride.chatOpen.v1': 'Ride chat open or folded',
  'ride.shareBannerOpen.v1': 'Location sharing banner open or folded',
  'ride.modePanelOpen.v1': 'Ride Mode panel open or folded',
  'ride.ridersSidebarOpen.v1': 'Riders sidebar open or folded (tablets)',
  'ride.savedReplies.v1': 'Saved quick replies for ride chat',
  'waypoints.panelOpen.v1': 'Waypoints panel open or folded',
  'route.panelOpen.v1': 'Route Builder panel open or folded',
  'nav.panelOpen.v1': 'Map Mode panel open or folded',
  'mapArea.panelOpen.v1': 'Offline map area panel open or folded',
  // Home and the rest
  'home.publicRadius.v1': 'Find a Ride and Events search radius',
  'starlink.autoConnect.v1': 'Starlink page connects by itself',
  'onmylead.dismissedNotices': 'Announcements the rider closed',
  // Settings from the 2.1 threads register here as they land: theme, light or dark, color blind
  // mode, waypoint symbols, voice, units and the tilt warning angles.
};

/**
 * Families of settings that sync one entry per key (so two devices adding different entries never
 * overwrite each other). The key is the prefix plus an id; clearing the value removes the entry.
 */
export const SYNCED_PREFIXES: Record<string, string> = {
  'offline-maps.area.': 'Each offline map area the rider saved (every device downloads its own copy)',
};

/** Kept on each device on purpose, and why. Not synced. */
export const DEVICE_ONLY: Record<string, string> = {
  'battery.mode.v1': 'Battery Saver is about this device’s battery, and the background location task reads it offline',
  'nav.trackLine.v1': 'Track Line breadcrumbs are location history: they never leave the device',
  'nav.recording.v1': 'A recording in progress is saved as it grows; it syncs as a trail once saved',
  'ride.trackQueue.v2': 'Ride track points waiting for signal',
  'ride.trackContext.v1': 'The ride the background location task is sending for',
  'ride.outbox.v1': 'Messages waiting for signal',
  'ride.leaderTrail.v1': 'The leader’s line cached for this ride',
  'offline-maps.v1': 'Downloaded map squares are files on this device (the list of areas syncs)',
  'onmylead.riderAgreement': 'The Rider Agreement is agreed once per download, by design',
  'onmylead.appSettings': 'A cache of the server’s announcements',
  'onmylead.storeVersion': 'A cache of the store’s latest version',
  'osm-template.v1': 'A cache of the trail map address',
  'tilt.calibration': 'Tilt calibration: each device sits differently in each mount',
};

/** Keys from newer app builds are kept and passed along, never dropped. These are the limits. */
export const MAX_KEY_LENGTH = 64;
export const MAX_VALUE_LENGTH = 20_000;
export const MAX_SETTINGS = 200;
/** A change dated this far past the server's clock is capped (a phone with its clock set ahead). */
export const MAX_CLOCK_AHEAD_MS = 60_000;

export const isSyncedKey = (key: string) =>
  Object.prototype.hasOwnProperty.call(SYNCED_SETTINGS, key) || Object.keys(SYNCED_PREFIXES).some((p) => key.startsWith(p) && key.length > p.length);

const validKey = (k: string) => k.length > 0 && k.length <= MAX_KEY_LENGTH && /^[A-Za-z0-9._:-]+$/.test(k);

/** A map read from storage or the server; anything malformed is left out. */
export function parseSyncedMap(raw: unknown): SyncedMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SyncedMap = {};
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!validKey(k) || !e || typeof e !== 'object') continue;
    const { v, at } = e as { v?: unknown; at?: unknown };
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue;
    if (v !== null && typeof v !== 'string') continue;
    if (typeof v === 'string' && v.length > MAX_VALUE_LENGTH) continue;
    out[k] = { v: v ?? null, at: Math.floor(at) };
    if (Object.keys(out).length >= MAX_SETTINGS) break;
  }
  return out;
}

/** True when b is the newer change. Same time: the larger value wins, so every device agrees. */
export function isNewer(b: SyncedEntry, a: SyncedEntry | undefined): boolean {
  if (!a) return true;
  if (b.at !== a.at) return b.at > a.at;
  return (b.v ?? '') > (a.v ?? '');
}

/** One setting changed on this device: the entry to keep and send. Never older than the last one. */
export function stamp(prev: SyncedEntry | undefined, v: string | null, now: number): SyncedEntry {
  return { v, at: Math.max(now, (prev?.at ?? 0) + 1) };
}

export type MergeResult = {
  /** Both sides combined, newest change per setting. */
  merged: SyncedMap;
  /** Settings to write on this device, because another device changed them later. */
  apply: SyncedMap;
  /** Settings this device changed later than the account copy: send these. */
  push: SyncedMap;
};

/** Combine this device's changes with the account's, setting by setting. */
export function mergeSynced(local: SyncedMap, remote: SyncedMap): MergeResult {
  const merged: SyncedMap = { ...remote };
  const apply: SyncedMap = {};
  const push: SyncedMap = {};
  for (const [k, l] of Object.entries(local)) {
    const r = remote[k];
    if (isNewer(l, r)) {
      merged[k] = l;
      if (!r || r.at !== l.at || r.v !== l.v) push[k] = l;
    }
  }
  for (const [k, r] of Object.entries(remote)) {
    const l = local[k];
    if (merged[k] === r && (!l || l.v !== r.v || l.at !== r.at)) apply[k] = r;
  }
  return { merged, apply, push };
}

/**
 * First sync on a device that already has settings: what to stamp as this device's changes.
 * A device signing in to the account it last synced with (or for the first time) offers its
 * values dated 0, so the account copy wins wherever it has one and this device fills the gaps. A device that last synced with a DIFFERENT account offers nothing: the new account's
 * settings are applied as they are, and one rider's choices never land in another's account.
 */
export function seedFromDevice(values: Record<string, string | null>, sameAccount: boolean): SyncedMap {
  if (!sameAccount) return {};
  const out: SyncedMap = {};
  for (const [k, v] of Object.entries(values)) if (isSyncedKey(k) && v != null) out[k] = { v, at: 0 };
  return out;
}

// --- Offline map areas -------------------------------------------------------------------------

/** What syncs about a saved offline area: enough for another device to download the same squares. */
export type SyncedOfflineArea = {
  id: string;
  name: string;
  kind: 'area' | 'ride';
  rideId?: string;
  box: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  choices: string[];
  createdAt: string;
};

export const OFFLINE_AREA_PREFIX = 'offline-maps.area.';
export const offlineAreaKey = (id: string) => OFFLINE_AREA_PREFIX + id.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, MAX_KEY_LENGTH - OFFLINE_AREA_PREFIX.length);

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

export function parseOfflineArea(raw: string | null | undefined): SyncedOfflineArea | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (!m || typeof m !== 'object') return null;
    const b = m.box as Record<string, unknown> | undefined;
    if (typeof m.id !== 'string' || typeof m.name !== 'string' || (m.kind !== 'area' && m.kind !== 'ride')) return null;
    if (!b || !num(b.minLat) || !num(b.minLng) || !num(b.maxLat) || !num(b.maxLng)) return null;
    return {
      id: m.id, name: m.name, kind: m.kind,
      ...(typeof m.rideId === 'string' ? { rideId: m.rideId } : {}),
      box: { minLat: b.minLat as number, minLng: b.minLng as number, maxLat: b.maxLat as number, maxLng: b.maxLng as number },
      choices: Array.isArray(m.choices) ? m.choices.filter((c): c is string => typeof c === 'string') : [],
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
    };
  } catch {
    return null;
  }
}

/** The synced value for one of this device's downloads (only what another device needs). */
export function offlineAreaValue(m: SyncedOfflineArea): string {
  const { id, name, kind, rideId, box, choices, createdAt } = m;
  return JSON.stringify({ id, name, kind, ...(rideId ? { rideId } : {}), box, choices, createdAt });
}

/** Areas saved on the rider's other devices that this one hasn't downloaded, newest first. */
export function areasToOffer(values: (string | null)[], onDevice: { id: string; rideId?: string }[]): SyncedOfflineArea[] {
  const ids = new Set(onDevice.map((m) => m.id));
  const rides = new Set(onDevice.flatMap((m) => (m.rideId ? [m.rideId] : [])));
  return values
    .map(parseOfflineArea)
    .filter((a): a is SyncedOfflineArea => !!a && !ids.has(a.id) && !(a.rideId && rides.has(a.rideId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- You > Sync Across Devices -----------------------------------------------------------------

/** The You tab's line under Sync Across Devices. */
export function syncSummary(s: { lastSyncedAt: number | null; syncing: boolean; failed: boolean }, now: number): string {
  if (s.syncing) return 'Syncing now…';
  const when = s.lastSyncedAt == null ? null : agoText(now - s.lastSyncedAt);
  if (s.failed) return when ? `Waiting for signal. Last synced ${when}` : 'Waiting for signal to sync';
  return when ? `Settings and Map Mode trails on every device you sign in on. Synced ${when}` : 'Settings and Map Mode trails on every device you sign in on';
}

export function agoText(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
