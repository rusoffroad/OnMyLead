/**
 * Follow Me: when a live map (Ride Mode, Navigate) keeps the rider's own dot in view by itself.
 *
 * Follow Me is a switch the rider sets (remembered on the phone, on by default). While it is on,
 * the map follows the rider everywhere. Dragging or pinching the map pauses it, so a rider can
 * look ahead or at the group without the map snapping back; Center on Me, the Follow Me button, or
 * starting to record or follow a trail turns it back on. While it is off, the map never moves by
 * itself and Center on Me centers once.
 *
 * Without a Follow Me setting (older callers) Navigate's first rules apply: follow while recording,
 * while a followed trail is near, and after Center on Me. Pure, so the rules are tested without a
 * phone.
 */
import { distanceM, type LatLng } from './geo';

export type FollowCam = {
  /** The rider moved the map by hand: don't follow until they ask again. */
  paused: boolean;
  /** Center on Me was tapped: follow even with nothing being recorded or followed. */
  forced: boolean;
};

export const FOLLOW_CAM_START: FollowCam = { paused: false, forced: false };

export type FollowCamEvent =
  | 'record' // started (or resumed) recording
  | 'follow' // started following a trail
  | 'pan' // the rider dragged or pinched the map
  | 'center'; // Center on Me

export function followCamReducer(s: FollowCam, e: FollowCamEvent): FollowCam {
  switch (e) {
    case 'record':
    case 'follow':
      return s.paused ? { ...s, paused: false } : s;
    case 'pan':
      return s.paused && !s.forced ? s : { paused: true, forced: false };
    case 'center':
      return !s.paused && s.forced ? s : { paused: false, forced: true };
  }
}

/** A followed trail counts as near within this distance (on it, or to its start). */
export const FOLLOW_NEAR_M = 800;

/** Whether the camera should follow the rider right now. */
export function followCamActive(
  s: FollowCam,
  ctx: { recording: boolean; following: boolean; nearTrail: boolean; followMe?: boolean },
): boolean {
  if (ctx.followMe === false || s.paused) return false;
  if (ctx.followMe) return true;
  return ctx.recording || s.forced || (ctx.following && ctx.nearTrail);
}

/** What the Follow Me button shows: off (the rider's choice), following, or paused by a drag. */
export type FollowMeStatus = 'off' | 'following' | 'paused';

export function followMeStatus(followMe: boolean, s: FollowCam, holdStill = false): FollowMeStatus {
  if (!followMe) return 'off';
  return s.paused || holdStill ? 'paused' : 'following';
}

/**
 * A tap on the Follow Me button: off turns it on, paused picks it back up (both center on the
 * rider), and following turns it off.
 */
export function followMeTap(status: FollowMeStatus): 'turn-on' | 'resume' | 'turn-off' {
  return status === 'off' ? 'turn-on' : status === 'paused' ? 'resume' : 'turn-off';
}

/** What the button says, in Title Case like the rest of the app. */
export const FOLLOW_ME_LABEL: Record<FollowMeStatus, string> = {
  off: 'Follow Me',
  following: 'Following',
  paused: 'Paused',
};

/** Near a followed trail: on it, or within FOLLOW_NEAR_M of the line or its start. */
export function nearFollowedTrail(p: { onTrail: boolean; toStartM: number; offTrailM: number } | null): boolean {
  if (!p) return false;
  return p.onTrail || p.toStartM <= FOLLOW_NEAR_M || p.offTrailM <= FOLLOW_NEAR_M;
}

/** Skip camera moves for GPS jitter: only move once the rider has moved this far (m). */
export const FOLLOW_MIN_STEP_M = 2;

export function followCamShouldMove(last: LatLng | null, next: LatLng): boolean {
  return !last || distanceM(last, next) >= FOLLOW_MIN_STEP_M;
}
