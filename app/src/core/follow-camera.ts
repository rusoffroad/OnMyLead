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
import type { Inset } from './map-center';

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

/**
 * Keeping the dot on screen (2.1). The dot rides freely through the middle of the open map. The
 * first time it gets within FOLLOW_EDGE_FRACTION of an edge, the map zooms out one step. The next
 * time it reaches an edge (or the first time, with Zoom Out at the Edge off or already zoomed far
 * out), the map centers on the dot and from then on keeps it centered on every fix, so the dot is
 * always on screen. Follow Me starting again (Center on Me, the button, a resume after a drag)
 * goes back to the start: free in the middle, one zoom out allowed.
 */
export const FOLLOW_EDGE_FRACTION = 0.1;
/** The edge band is never thinner than this many points. */
export const FOLLOW_EDGE_MIN_PT = 24;
/** How far behind the middle the dot sits when zoomed in at an intersection, as a share of the open map's smaller side. */
export const FOLLOW_LEAD = 0.18;
/** Never zoom out past this Mapbox zoom (about 30 km across a phone). */
export const FOLLOW_MIN_ZOOM = 10;
/** The one zoom out at the edge, in zoom levels (twice as much ground across). */
export const FOLLOW_ZOOM_OUT_STEP = 1;

export type ScreenPoint = { x: number; y: number };
export type ScreenSize = { width: number; height: number };
type Box = { left: number; top: number; right: number; bottom: number };

/** Remembered for one stretch of following: the one zoom out used, and whether the map now keeps the dot centered. */
export type FollowFrame = { zoomedOut: boolean; locked: boolean };
export const FOLLOW_FRAME_START: FollowFrame = { zoomedOut: false, locked: false };

export type FollowMove =
  | { kind: 'stay' }
  | { kind: 'zoom-out'; zoom: number }
  | { kind: 'pan'; inset: Inset };

/** The part of the map the dot may move through without the camera moving. */
export function followBox(size: ScreenSize, inset: Inset): Box {
  const left = inset.left;
  const top = inset.top;
  const right = Math.max(left + 1, size.width - inset.right);
  const bottom = Math.max(top + 1, size.height - inset.bottom);
  const mx = Math.max(FOLLOW_EDGE_MIN_PT, (right - left) * FOLLOW_EDGE_FRACTION);
  const my = Math.max(FOLLOW_EDGE_MIN_PT, (bottom - top) * FOLLOW_EDGE_FRACTION);
  // On a very small open map the box shrinks to its middle point rather than turning inside out.
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  return {
    left: Math.min(cx, left + mx), right: Math.max(cx, right - mx),
    top: Math.min(cy, top + my), bottom: Math.max(cy, bottom - my),
  };
}

export function insideFollowBox(pt: ScreenPoint, size: ScreenSize, inset: Inset): boolean {
  const b = followBox(size, inset);
  return pt.x >= b.left && pt.x <= b.right && pt.y >= b.top && pt.y <= b.bottom;
}

/**
 * The inset that centers the dot a little behind the middle of the open map, against the way the
 * rider is heading (screen degrees clockwise from up), so the road ahead has the room. Without a
 * heading, plain middle.
 */
export function leadInset(inset: Inset, size: ScreenSize, screenHeadingDeg: number | null): Inset {
  if (screenHeadingDeg == null || !Number.isFinite(screenHeadingDeg)) return inset;
  const w = Math.max(1, size.width - inset.left - inset.right);
  const h = Math.max(1, size.height - inset.top - inset.bottom);
  const lead = Math.min(w, h) * FOLLOW_LEAD;
  const r = (screenHeadingDeg * Math.PI) / 180;
  // The dot sits `lead` behind the middle: up-screen heading puts it below the middle.
  const dx = -Math.sin(r) * lead;
  const dy = Math.cos(r) * lead;
  // Centering in an inset puts the point at the inset's middle, so grow the side it moves away from.
  return {
    top: inset.top + Math.max(0, 2 * dy),
    bottom: inset.bottom + Math.max(0, -2 * dy),
    left: inset.left + Math.max(0, 2 * dx),
    right: inset.right + Math.max(0, -2 * dx),
  };
}

/** What the camera does with the rider's newest spot on screen. */
export function followMove(
  frame: FollowFrame,
  ctx: { pt: ScreenPoint | null; size: ScreenSize; inset: Inset; zoom: number; screenHeadingDeg: number | null; noZoomOut?: boolean },
): FollowMove {
  const center: FollowMove = { kind: 'pan', inset: ctx.inset };
  // Following centered: every fix keeps the dot in the middle of the open map.
  if (frame.locked) return center;
  // Can't tell where the dot is on screen (the map is still drawing): just keep it in view.
  if (!ctx.pt) return center;
  if (insideFollowBox(ctx.pt, ctx.size, ctx.inset)) return { kind: 'stay' };
  // Mapbox on iPhone and iPad answers (-1, -1) for a spot off the screen.
  const unknown = ctx.pt.x === -1 && ctx.pt.y === -1;
  const off = unknown || ctx.pt.x < -ctx.size.width || ctx.pt.x > 2 * ctx.size.width || ctx.pt.y < -ctx.size.height || ctx.pt.y > 2 * ctx.size.height;
  const zoom = ctx.zoom - FOLLOW_ZOOM_OUT_STEP;
  if (!frame.zoomedOut && !ctx.noZoomOut && !off && zoom >= FOLLOW_MIN_ZOOM) return { kind: 'zoom-out', zoom };
  return center;
}

export function followFrameAfter(frame: FollowFrame, move: FollowMove): FollowFrame {
  if (move.kind === 'zoom-out') return { ...frame, zoomedOut: true };
  if (move.kind === 'pan' && !frame.locked) return { ...frame, locked: true };
  return frame;
}
