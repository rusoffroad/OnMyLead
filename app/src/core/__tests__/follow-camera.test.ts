import { describe, expect, it } from 'vitest';
import {
  FOLLOW_CAM_START, FOLLOW_ME_LABEL, FOLLOW_NEAR_M, followCamActive, followCamReducer, followCamShouldMove, followMeStatus, followMeTap,
  nearFollowedTrail, type FollowCamEvent, FOLLOW_FRAME_START, FOLLOW_MIN_ZOOM, followBox, followFrameAfter, followMove, insideFollowBox, leadInset,
} from '../follow-camera';

const run = (...events: FollowCamEvent[]) => events.reduce(followCamReducer, FOLLOW_CAM_START);
const idle = { recording: false, following: false, nearTrail: false };

describe('follow-me camera', () => {
  it('follows while recording', () => {
    expect(followCamActive(run('record'), { ...idle, recording: true })).toBe(true);
  });
  it('does not follow in plain Explore until Center on Me', () => {
    expect(followCamActive(FOLLOW_CAM_START, idle)).toBe(false);
    expect(followCamActive(run('center'), idle)).toBe(true);
  });
  it('panning pauses it, even while recording; Center on Me turns it back on', () => {
    const panned = run('record', 'pan');
    expect(followCamActive(panned, { ...idle, recording: true })).toBe(false);
    expect(followCamActive(followCamReducer(panned, 'center'), { ...idle, recording: true })).toBe(true);
  });
  it('panning after Center on Me drops the forced follow too', () => {
    expect(followCamActive(run('center', 'pan'), idle)).toBe(false);
  });
  it('starting to record or follow again resumes after a pan', () => {
    expect(run('pan', 'record').paused).toBe(false);
    expect(run('pan', 'follow').paused).toBe(false);
  });
  it('follows a followed trail only when the rider is near it', () => {
    expect(followCamActive(run('follow'), { ...idle, following: true, nearTrail: false })).toBe(false);
    expect(followCamActive(run('follow'), { ...idle, following: true, nearTrail: true })).toBe(true);
  });
  it('keeps the same state object when nothing changes', () => {
    const s = run('center');
    expect(followCamReducer(s, 'center')).toBe(s);
    const p = run('pan');
    expect(followCamReducer(p, 'pan')).toBe(p);
  });
});

describe('nearFollowedTrail', () => {
  it('is near on the trail, close to it or close to its start', () => {
    expect(nearFollowedTrail(null)).toBe(false);
    expect(nearFollowedTrail({ onTrail: true, toStartM: 9000, offTrailM: 10 })).toBe(true);
    expect(nearFollowedTrail({ onTrail: false, toStartM: FOLLOW_NEAR_M - 1, offTrailM: 5000 })).toBe(true);
    expect(nearFollowedTrail({ onTrail: false, toStartM: 5000, offTrailM: 300 })).toBe(true);
    expect(nearFollowedTrail({ onTrail: false, toStartM: 5000, offTrailM: 5000 })).toBe(false);
  });
});

describe('followCamShouldMove', () => {
  const a = { lat: 38.5733, lng: -109.5498 };
  it('moves on the first fix and after a real step, not for jitter', () => {
    expect(followCamShouldMove(null, a)).toBe(true);
    expect(followCamShouldMove(a, { lat: a.lat + 0.000005, lng: a.lng })).toBe(false); // ~0.5 m
    expect(followCamShouldMove(a, { lat: a.lat + 0.0001, lng: a.lng })).toBe(true); // ~11 m
  });
});

describe('Follow Me switch', () => {
  it('on: follows everywhere, not only while recording, until a pan', () => {
    const on = { ...idle, followMe: true };
    expect(followCamActive(FOLLOW_CAM_START, on)).toBe(true);
    expect(followCamActive(run('pan'), on)).toBe(false);
    expect(followCamActive(run('pan', 'center'), on)).toBe(true);
  });
  it('off: never follows, even while recording or after Center on Me', () => {
    const off = { recording: true, following: true, nearTrail: true, followMe: false };
    expect(followCamActive(FOLLOW_CAM_START, off)).toBe(false);
    expect(followCamActive(run('center'), off)).toBe(false);
  });
  it('shows off, following or paused, and a held-still map (Measure) reads as paused', () => {
    expect(followMeStatus(false, FOLLOW_CAM_START)).toBe('off');
    expect(followMeStatus(true, FOLLOW_CAM_START)).toBe('following');
    expect(followMeStatus(true, run('pan'))).toBe('paused');
    expect(followMeStatus(true, FOLLOW_CAM_START, true)).toBe('paused');
    expect(FOLLOW_ME_LABEL.following).toBe('Following');
  });
  it('a tap turns it on, resumes it, or turns it off', () => {
    expect(followMeTap('off')).toBe('turn-on');
    expect(followMeTap('paused')).toBe('resume');
    expect(followMeTap('following')).toBe('turn-off');
  });
});

describe('keeping the dot on screen: zoom out once, then center and follow', () => {
  const size = { width: 400, height: 800 };
  const inset = { top: 100, right: 0, bottom: 300, left: 0 };
  // Open map: x 0-400, y 100-500; edge band 10% (40 pt each side): box x 40-360, y 140-460.

  it('leaves the map alone while the dot is in the middle', () => {
    expect(followMove(FOLLOW_FRAME_START, { pt: { x: 200, y: 300 }, size, inset, zoom: 14, screenHeadingDeg: 0 })).toEqual({ kind: 'stay' });
    expect(insideFollowBox({ x: 41, y: 459 }, size, inset)).toBe(true);
    // Within 10% of the edge is outside the box.
    expect(insideFollowBox({ x: 39, y: 300 }, size, inset)).toBe(false);
    expect(insideFollowBox({ x: 200, y: 461 }, size, inset)).toBe(false);
  });

  it('zooms out one step the first time the dot gets within 10% of an edge', () => {
    const m = followMove(FOLLOW_FRAME_START, { pt: { x: 200, y: 130 }, size, inset, zoom: 14, screenHeadingDeg: 0 });
    expect(m).toEqual({ kind: 'zoom-out', zoom: 13 });
    expect(followFrameAfter(FOLLOW_FRAME_START, m)).toEqual({ zoomedOut: true, locked: false });
  });

  it('the second time, centers the dot and keeps it centered on every fix after', () => {
    const zoomed = { zoomedOut: true, locked: false };
    const m = followMove(zoomed, { pt: { x: 380, y: 300 }, size, inset, zoom: 13, screenHeadingDeg: 90 });
    expect(m).toEqual({ kind: 'pan', inset });
    const locked = followFrameAfter(zoomed, m);
    expect(locked).toEqual({ zoomedOut: true, locked: true });
    // Even right in the middle, the map keeps moving with the dot.
    expect(followMove(locked, { pt: { x: 200, y: 300 }, size, inset, zoom: 13, screenHeadingDeg: 0 })).toEqual({ kind: 'pan', inset });
    expect(followFrameAfter(locked, { kind: 'pan', inset })).toBe(locked);
  });

  it('a whole run: middle, edge (zoom out), middle, edge (center), then follows', () => {
    let f = FOLLOW_FRAME_START;
    const kinds: string[] = [];
    for (const pt of [{ x: 200, y: 300 }, { x: 395, y: 300 }, { x: 300, y: 300 }, { x: 5, y: 300 }, { x: 200, y: 300 }, { x: 210, y: 290 }]) {
      const m = followMove(f, { pt, size, inset, zoom: 15, screenHeadingDeg: 0 });
      kinds.push(m.kind);
      f = followFrameAfter(f, m);
    }
    expect(kinds).toEqual(['stay', 'zoom-out', 'stay', 'pan', 'pan', 'pan']);
  });

  it('centers and follows at once when it cannot zoom out: switch off, at a junction, too far out, or the dot is way off screen', () => {
    for (const ctx of [
      { pt: { x: 0, y: 300 }, zoom: 17, noZoomOut: true },
      { pt: { x: 0, y: 300 }, zoom: FOLLOW_MIN_ZOOM + 0.5 },
      { pt: { x: 5000, y: 300 }, zoom: 14 },
      // Mapbox on iPhone answers (-1, -1) for a spot off the screen.
      { pt: { x: -1, y: -1 }, zoom: 14 },
    ]) {
      const m = followMove(FOLLOW_FRAME_START, { size, inset, screenHeadingDeg: 0, ...ctx });
      expect(m.kind).toBe('pan');
      expect(followFrameAfter(FOLLOW_FRAME_START, m).locked).toBe(true);
    }
  });

  it('keeps the dot in view when the map cannot say where it is', () => {
    expect(followMove(FOLLOW_FRAME_START, { pt: null, size, inset, zoom: 14, screenHeadingDeg: null })).toEqual({ kind: 'pan', inset });
  });

  it('puts the dot behind the middle so the way ahead has room', () => {
    // Heading up the screen: the dot goes below the middle, so the top inset grows.
    const up = leadInset(inset, size, 0);
    expect(up.top).toBeGreaterThan(inset.top);
    expect(up.bottom).toBe(inset.bottom);
    // Heading right: the dot goes left of the middle, so the right inset grows.
    const right = leadInset(inset, size, 90);
    expect(right.right).toBeGreaterThan(0);
    expect(right.left).toBe(0);
    expect(Math.round(right.top)).toBe(inset.top);
    expect(leadInset(inset, size, null)).toBe(inset);
  });

  it('never turns the box inside out on a tiny open map', () => {
    const b = followBox({ width: 100, height: 100 }, { top: 40, right: 40, bottom: 40, left: 40 });
    expect(b.left).toBeLessThanOrEqual(b.right);
    expect(b.top).toBeLessThanOrEqual(b.bottom);
  });
});
