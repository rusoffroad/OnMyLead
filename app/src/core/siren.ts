/**
 * Emergency Siren: when another rider on your ride sends EMERGENCY (from the button, CarPlay, or a
 * Crash Alert whose countdown ran out), your phone sounds a loud siren until you silence it.
 *
 * It can reach a phone three ways, and all three end up here:
 * - Ride Mode open: the status arrives over the internet (Realtime) or over Bluetooth Sharing.
 * - App open on another screen: the push notification arrives while the app is in front.
 * - App in the background or closed: the push notification itself plays the siren sound
 *   (assets/sounds/siren.wav, about 27 seconds), on its own Android channel. A status that comes
 *   over Bluetooth while the app is in the background shows a local notification with the same
 *   sound.
 *
 * The switch is in Notifications (on unless the rider turns it off) and is kept per account
 * (lib/settings-sync). This file is the pure part: which statuses sound, in what order, and what
 * the screen says. Tested in core/__tests__/siren.test.ts.
 */

/** The sound file, bundled into the app (app.json, expo-notifications "sounds"). */
export const SIREN_SOUND = 'siren.wav';
/** The Android notification channel whose sound is the siren (lib/push.ts creates it). */
export const SIREN_CHANNEL = 'ride-emergency';
/** Storage key of the switch. */
export const SIREN_SETTING_KEY = 'alerts.siren.v1';

/**
 * An EMERGENCY older than this doesn't start the siren: opening Ride Mode an hour later shouldn't
 * blare about something long handled. Ten minutes covers a phone that got it late over Bluetooth.
 */
export const SIREN_FRESH_MS = 10 * 60_000;
/** How many silenced alerts are remembered on the phone, so a restart doesn't sound them again. */
export const SIREN_REMEMBER = 500;

/** Off only when the rider turned it off. */
export function parseSirenSetting(v: string | null | undefined): boolean {
  return v !== 'off';
}
export function sirenSettingValue(on: boolean): string {
  return on ? 'on' : 'off';
}

export type EmergencyCall = {
  /** The status tap's id (rider_statuses.id; the same id travels over Bluetooth). */
  id: string;
  rideId: string;
  userId: string;
  /** When it was tapped, ms since 1970 (for a push: when it arrived, so a late upload still sounds). */
  at: number;
  /** When the rider tapped it, when known apart from `at` (a push): a later tap of theirs ends it. */
  tappedAt?: number;
  /** The rider's name, when known. */
  name?: string | null;
  /** Sent by a Crash Alert (Bluetooth carries this flag; the internet path says so in the chat line). */
  possibleCrash?: boolean;
};

/** Whether a status that just arrived should start the siren. */
export function shouldSound(
  s: { id?: string | null; status: string; userId: string; at: number; cancelled?: boolean },
  ctx: { me: string | null; enabled: boolean; silenced: ReadonlySet<string>; now: number },
): boolean {
  if (!ctx.enabled || !s.id) return false;
  if (s.status !== 'emergency' || s.cancelled) return false;
  if (ctx.me && s.userId === ctx.me) return false;
  if (ctx.silenced.has(s.id)) return false;
  // A phone with its clock a little ahead can report a tap from "the future": still fresh.
  return ctx.now - s.at <= SIREN_FRESH_MS;
}

/**
 * The calls waiting to be silenced, newest first. A second call from the same rider replaces the
 * first (one card per rider), and a call already in the list is not added twice (Bluetooth passes
 * the same tap on many times).
 */
export function addCall(calls: readonly EmergencyCall[], c: EmergencyCall): EmergencyCall[] {
  if (calls.some((x) => x.id === c.id)) {
    // Fill in what the first copy didn't know (the rider, a name, the crash flag, the earliest tap
    // time: a push that came without one has only its arrival time). Unchanged: the same list back.
    let changed = false;
    const next = calls.map((x) => {
      if (x.id !== c.id) return x;
      const was = x.tappedAt ?? x.at;
      const tapped = Math.min(was, c.tappedAt ?? c.at);
      const merged: EmergencyCall = {
        ...x,
        userId: isUnknownRider(x.userId) ? c.userId : x.userId,
        name: x.name || c.name,
        possibleCrash: x.possibleCrash || c.possibleCrash,
        tappedAt: tapped === was ? x.tappedAt : tapped,
      };
      changed = merged.userId !== x.userId || merged.name !== x.name || merged.possibleCrash !== x.possibleCrash || merged.tappedAt !== x.tappedAt;
      return changed ? merged : x;
    });
    return changed ? next : (calls as EmergencyCall[]);
  }
  // An older call from the same rider arriving late doesn't replace their newer one.
  const mine = calls.find((x) => x.rideId === c.rideId && x.userId === c.userId);
  if (mine && (mine.tappedAt ?? mine.at) > (c.tappedAt ?? c.at)) return calls as EmergencyCall[];
  const rest = calls.filter((x) => !(x.rideId === c.rideId && x.userId === c.userId));
  return [c, ...rest].sort((a, b) => b.at - a.at);
}

/**
 * A push from a server without the siren update doesn't say who sent it: the call stands in with
 * `item:<id>` until Ride Mode hears the tap and fills in the rider.
 */
/** How late a push may arrive and still count as news (a tap uploaded late after no service). */
export const PUSH_LATE_MAX_MS = 60 * 60_000;

/**
 * The time a pushed EMERGENCY counts from for sounding: when it arrived, so a tap uploaded late
 * (say a Crash Alert with no service) still sounds, but not one tapped over an hour ago (a push the
 * phone only got after hours with no signal), which counts from its tap time and stays quiet.
 */
export function pushCallAt(tappedAt: number | undefined, now: number): number {
  return tappedAt != null && Number.isFinite(tappedAt) && now - tappedAt > PUSH_LATE_MAX_MS ? tappedAt : now;
}

export function unknownRider(id: string): string {
  return `item:${id}`;
}
const isUnknownRider = (userId: string) => userId.startsWith('item:');

/** Drops a call: the rider took it back, or tapped another status since. */
export function dropCall(calls: readonly EmergencyCall[], id: string): EmergencyCall[] {
  return calls.filter((x) => x.id !== id);
}

/**
 * Which of two tap times is later: 1 when `b` is, -1 when `a` is, 0 when it can't be told. Bluetooth
 * carries tap times to the whole second and the server to the millisecond, so milliseconds count
 * only when both times have them; otherwise the same second is a tie.
 */
export function tapOrder(a: number, b: number): -1 | 0 | 1 {
  const exact = a % 1000 !== 0 && b % 1000 !== 0;
  const x = exact ? a : Math.floor(a / 1000);
  const y = exact ? b : Math.floor(b / 1000);
  return y > x ? 1 : y < x ? -1 : 0;
}

/**
 * Whether a status tap that reached this phone is newer than the one already known for that rider.
 * An older one relayed late changes nothing, and neither does one that can't be told apart (the same
 * second over Bluetooth), so every phone settles on the same tap.
 */
export function isNewerTap(known: { id?: string | null; tapped_at: string } | undefined, incoming: { id?: string | null; tapped_at: string }): boolean {
  if (!known) return true;
  return known.id !== incoming.id && tapOrder(Date.parse(known.tapped_at), Date.parse(incoming.tapped_at)) > 0;
}

/**
 * Each rider's newest tap from rows newest upload first, by tap time (tapOrder). In a tie the newer
 * upload stays.
 */
export function newestTapPerRider<T extends { user_id: string; tapped_at: string }>(rows: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) {
    const p = out[r.user_id];
    if (!p || tapOrder(Date.parse(p.tapped_at), Date.parse(r.tapped_at)) > 0) out[r.user_id] = r;
  }
  return out;
}

/**
 * Ride Mode knows each rider's latest status. A call is over once its rider has tapped something
 * newer (I'm OK, Stopped...): these are the ids to drop. A status that is older than the call (the
 * push got here before Ride Mode heard the tap) ends nothing. A cancelled tap is dropped by its id
 * instead (dropCall), since the status shown then is the older one again.
 */
export function endedCalls(
  calls: readonly EmergencyCall[],
  rideId: string,
  latest: Readonly<Record<string, { id?: string | null; status: string; at: number } | undefined>>,
): string[] {
  return calls
    .filter((c) => c.rideId === rideId)
    .filter((c) => {
      const s = latest[c.userId];
      if (!s?.id) return false;
      if (s.id === c.id) return s.status !== 'emergency';
      // A tap that is later (tapOrder) ends it; one that can't be told apart doesn't. Without the tap time (an older server), `at` is when it got here on this phone's clock and
      // the status is on the sender's: only a tap a full minute later counts, so clocks a little
      // apart don't end it at once.
      if (c.tappedAt == null) return s.at > c.at + 60_000;
      return tapOrder(c.tappedAt, s.at) > 0;
    })
    .map((c) => c.id);
}

/** Keeps the newest `SIREN_REMEMBER` silenced ids. */
export function rememberSilenced(list: readonly string[], ids: readonly string[]): string[] {
  const next = [...ids.filter((id) => !list.includes(id)), ...list];
  return [...new Set(next)].slice(0, SIREN_REMEMBER);
}

/** The words on the siren screen (English; the screen translates them). */
export function sirenText(c: Pick<EmergencyCall, 'name' | 'possibleCrash'>, more: number): {
  title: string;
  body: string;
  vars: Record<string, string | number>;
  moreText: string | null;
} {
  const name = c.name?.trim() || 'A rider';
  return {
    title: c.possibleCrash ? 'Possible Crash' : 'EMERGENCY',
    body: c.possibleCrash ? '{name} may have crashed and didn’t tap I’m OK.' : '{name} needs help now.',
    vars: { name },
    moreText: more > 0 ? (more === 1 ? '{n} more rider needs help' : '{n} more riders need help') : null,
  };
}
