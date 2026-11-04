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

describe('keeping the dot on screen: zoom out once, then move the map', () => {
  const size = { width: 400, height: 800 };
  const inset = { top: 100, right: 0, bottom: 300, left: 0 };
  // Open map: x 0-400, y 100-500; box: x 80-320, y 180-420.

  it('leaves the map alone while the dot is in the middle', () => {
    expect(followMove(FOLLOW_FRAME_START, { pt: { x: 200, y: 300 }, size, inset, zoom: 14, screenHeadingDeg: 0 })).toEqual({ kind: 'stay' });
    expect(insideFollowBox({ x: 81, y: 419 }, size, inset)).toBe(true);
  });

  it('zooms out one step the first time the dot nears an edge', () => {
    const m = followMove(FOLLOW_FRAME_START, { pt: { x: 200, y: 150 }, size, inset, zoom: 14, screenHeadingDeg: 0 });
    expect(m).toEqual({ kind: 'zoom-out', zoom: 13 });
    expect(followFrameAfter(FOLLOW_FRAME_START, m)).toEqual({ zoomedOut: true });
  });

  it('moves the map every time after that, never zooming out again', () => {
    const frame = { zoomedOut: true };
    const m = followMove(frame, { pt: { x: 380, y: 300 }, size, inset, zoom: 13, screenHeadingDeg: 90 });
    expect(m.kind).toBe('pan');
    expect(followFrameAfter(frame, m)).toBe(frame);
  });

  it('moves instead of zooming while zoomed in at a junction, when too far out, or when the dot is way off screen', () => {
    expect(followMove(FOLLOW_FRAME_START, { pt: { x: 0, y: 300 }, size, inset, zoom: 17, screenHeadingDeg: 0, noZoomOut: true }).kind).toBe('pan');
    expect(followMove(FOLLOW_FRAME_START, { pt: { x: 0, y: 300 }, size, inset, zoom: FOLLOW_MIN_ZOOM + 0.5, screenHeadingDeg: 0 }).kind).toBe('pan');
    expect(followMove(FOLLOW_FRAME_START, { pt: { x: 5000, y: 300 }, size, inset, zoom: 14, screenHeadingDeg: 0 }).kind).toBe('pan');
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
