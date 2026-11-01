/**
 * Navigation Mode's follow-me camera: when the map keeps the rider in view by itself.
 *
 * It follows while a trail is being recorded, while a followed trail is near (on it, or close to
 * its start), and after Center on Me. Dragging or pinching the map pauses it, so a rider can look
 * ahead without the map snapping back; Center on Me (or starting to record or follow) turns it on
 * again. Pure, so the rules are tested without a phone.
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
  ctx: { recording: boolean; following: boolean; nearTrail: boolean },
): boolean {
  if (s.paused) return false;
  return ctx.recording || s.forced || (ctx.following && ctx.nearTrail);
}

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
