/**
 * You > Permissions: every system permission OnMyLead uses, what the phone says about each one
 * right now, and what tapping it does. Pure rules here (unit tested); reading and asking the
 * phone is in lib/permissions.ts (lib/permissions.web.ts for the website).
 *
 * The one limit every row works around: iPhone and iPad show a permission's question only once.
 * After a rider says no, only the Settings app can turn it back on, so those rows open
 * OnMyLead's page in Settings. Android asks again until the rider picks "Don't allow" twice
 * (or "Don't ask again"); after that it also needs Settings.
 */

export type PermissionPlatform = 'ios' | 'android' | 'web';

export type PermissionId =
  | 'location'
  | 'locationAlways'
  | 'preciseLocation'
  | 'googleAccuracy'
  | 'bluetooth'
  | 'notifications'
  | 'motion'
  | 'camera'
  | 'music'
  | 'tracking'
  | 'localNetwork';

/**
 * - granted: allowed.
 * - limited: allowed, but not fully (Approximate Location, While Using instead of Always).
 * - denied: turned down, and the system will still ask again when the app asks.
 * - blocked: turned down for good: only Settings can change it.
 * - undetermined: never asked yet.
 * - needsFirst: can't be asked until another permission is allowed (Always needs While Using).
 * - unknown: the phone doesn't let apps read it (Local Network) or this build can't.
 */
export type PermissionStatus = 'granted' | 'limited' | 'denied' | 'blocked' | 'undetermined' | 'needsFirst' | 'unknown';

/** What a tap does: show the system question, open OnMyLead's page in Settings, or nothing. */
export type PermissionAction = 'ask' | 'settings' | 'none';

/** The shape expo-* permission calls return. */
export type ExpoPermission = { status: string; canAskAgain?: boolean; granted?: boolean };

export type PermissionDef = {
  id: PermissionId;
  /** Needed for a group ride to work (location, Bluetooth, notifications), or an extra. */
  essential: boolean;
  platforms: PermissionPlatform[];
};

/** In the order the page lists them. */
export const PERMISSIONS: PermissionDef[] = [
  { id: 'location', essential: true, platforms: ['ios', 'android', 'web'] },
  { id: 'locationAlways', essential: true, platforms: ['ios'] },
  { id: 'preciseLocation', essential: true, platforms: ['ios', 'android'] },
  { id: 'googleAccuracy', essential: true, platforms: ['android'] },
  { id: 'notifications', essential: true, platforms: ['ios', 'android'] },
  { id: 'bluetooth', essential: true, platforms: ['ios', 'android'] },
  { id: 'motion', essential: false, platforms: ['ios'] },
  { id: 'camera', essential: false, platforms: ['ios', 'android'] },
  { id: 'music', essential: false, platforms: ['ios', 'android'] },
  { id: 'localNetwork', essential: false, platforms: ['ios'] },
  { id: 'tracking', essential: false, platforms: ['ios'] },
];

/** The rows for this device. `hide` drops rows whose feature is off (a flag, or no native module). */
export function permissionsFor(platform: PermissionPlatform, hide: PermissionId[] = []): PermissionDef[] {
  return PERMISSIONS.filter((p) => p.platforms.includes(platform) && !hide.includes(p.id));
}

/** An expo-* permission answer as a row status. */
export function fromExpo(p: ExpoPermission | null | undefined): PermissionStatus {
  if (!p) return 'unknown';
  if (p.status === 'granted' || p.granted) return 'granted';
  if (p.status === 'undetermined') return p.canAskAgain === false ? 'blocked' : 'undetermined';
  if (p.status === 'denied') return p.canAskAgain === false ? 'blocked' : 'denied';
  return 'unknown';
}

/**
 * iPhone and iPad never show a question twice: anything turned down is blocked there, whatever
 * canAskAgain says. Android keeps 'denied' (it can still ask) until it reports blocked.
 */
export function platformStatus(status: PermissionStatus, platform: PermissionPlatform): PermissionStatus {
  if (platform === 'ios' && status === 'denied') return 'blocked';
  return status;
}

/** What a tap on a row does. */
export function permissionAction(id: PermissionId, status: PermissionStatus, platform: PermissionPlatform): PermissionAction {
  if (status === 'granted') return 'none';
  if (platform === 'web') return status === 'undetermined' || status === 'denied' || status === 'unknown' ? 'ask' : 'none';
  // Android's Notification Access for Music Controls is a Settings page, never a question.
  if (id === 'music' && platform === 'android') return 'settings';
  if (status === 'undetermined' || status === 'denied') return 'ask';
  // Always follows While Using: the tap asks for While Using first.
  if (status === 'needsFirst') return 'ask';
  // Approximate Location on Android: asking again shows "Change to precise location".
  if (status === 'limited') return platform === 'android' && id === 'preciseLocation' ? 'ask' : 'settings';
  return 'settings';
}

/** Allowed, or as good as it gets on this device. */
export function permissionOk(status: PermissionStatus): boolean {
  return status === 'granted';
}

/**
 * Rows that need the rider: essential ones not allowed. Extras that are off are the rider's
 * choice (no camera, no tracking), so they don't count. Unknown rows can't be judged.
 */
export function needsAttention(rows: { def: PermissionDef; status: PermissionStatus }[]): PermissionId[] {
  return rows.filter((r) => r.def.essential && r.status !== 'granted' && r.status !== 'unknown').map((r) => r.def.id);
}

/** iPhone: Always is only askable once While Using is allowed. */
export function alwaysStatus(foreground: PermissionStatus, background: PermissionStatus): PermissionStatus {
  if (background === 'granted') return 'granted';
  if (foreground !== 'granted' && foreground !== 'limited') return 'needsFirst';
  // While Using is on and Always isn't: iOS asked once ("Change to Always Allow"), then only Settings.
  if (background === 'undetermined') return 'undetermined';
  return 'limited';
}

/** Precise from the foreground answer: iOS `accuracy` 'full' | 'reduced', Android 'fine' | 'coarse' | 'none'. */
export function preciseStatus(foreground: PermissionStatus, accuracy: string | null | undefined): PermissionStatus {
  if (foreground !== 'granted' && foreground !== 'limited') return 'needsFirst';
  if (accuracy === 'reduced' || accuracy === 'coarse') return 'limited';
  if (accuracy === 'full' || accuracy === 'fine') return 'granted';
  return 'unknown';
}

/** iOS CBManager.authorization as the native module reports it. */
export function fromBluetoothAuthorization(a: string | null | undefined): PermissionStatus {
  switch (a) {
    case 'granted':
    case 'allowedAlways':
      return 'granted';
    case 'denied':
    case 'restricted':
      return 'blocked';
    case 'undetermined':
    case 'notDetermined':
      return 'undetermined';
    default:
      return 'unknown';
  }
}

/** Android runtime results (PermissionsAndroid.RESULTS) for a group of permissions asked together. */
export function fromAndroidResults(results: string[]): PermissionStatus {
  if (!results.length) return 'granted';
  if (results.every((r) => r === 'granted')) return 'granted';
  if (results.some((r) => r === 'never_ask_again')) return 'blocked';
  return 'denied';
}

/** The web Permissions API state for geolocation. */
export function fromBrowser(state: string | null | undefined): PermissionStatus {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'blocked';
  if (state === 'prompt') return 'undetermined';
  return 'unknown';
}
