import { describe, expect, it } from 'vitest';

import {
  formatAgo, HEARTBEAT_SEC, LIVE_SEC, LOST_SEC, riderFreshness, shareStillOn, shouldSendFix, VIEWER_OFFLINE_SEC,
  viewerOfflineSince,
} from '../freshness';
import { distanceM } from '../geo';

const t0 = 1_800_000_000_000;
const sec = 1000;

describe('rider location freshness', () => {
  it('is live under a minute, delayed after, lost after three minutes', () => {
    expect(riderFreshness(t0, t0 + 10 * sec).state).toBe('live');
    expect(riderFreshness(t0, t0 + (LIVE_SEC - 1) * sec).state).toBe('live');
    expect(riderFreshness(t0, t0 + LIVE_SEC * sec).state).toBe('delayed');
    expect(riderFreshness(t0, t0 + (LOST_SEC - 1) * sec).state).toBe('delayed');
    expect(riderFreshness(t0, t0 + LOST_SEC * sec).state).toBe('lost');
  });

  it('labels each state for the map tag and the rider list', () => {
    expect(riderFreshness(t0, t0 + 5 * sec).label).toBe('Live');
    expect(riderFreshness(t0, t0 + 125 * sec).label).toBe('2 Min Ago');
    expect(riderFreshness(t0, t0 + 8 * 60 * sec).label).toBe('No Signal, 8 Min Ago');
  });

  it('treats a fix from a phone whose clock runs ahead as just taken', () => {
    const f = riderFreshness(t0 + 20 * sec, t0);
    expect(f.ageSec).toBe(0);
    expect(f.state).toBe('live');
  });

  it('never calls a rider lost just because this phone lost service', () => {
    const offlineSince = t0 + 30 * sec; // rider's last fix came in 30 s before we lost service
    const f = riderFreshness(t0, t0 + 20 * 60 * sec, offlineSince);
    expect(f.state).toBe('delayed');
    expect(f.label).toBe('20 Min Ago');
  });

  it('still calls a rider lost if they went quiet well before this phone did', () => {
    const offlineSince = t0 + (LOST_SEC + 60) * sec;
    expect(riderFreshness(t0, t0 + 30 * 60 * sec, offlineSince).state).toBe('lost');
  });

  it('never shows a rider as live while this phone is offline', () => {
    const offlineSince = t0 + 5 * sec;
    expect(riderFreshness(t0, t0 + 20 * sec, offlineSince).state).toBe('delayed');
  });
});

describe('formatAgo', () => {
  it('reads naturally at every scale', () => {
    expect(formatAgo(0)).toBe('Just Now');
    expect(formatAgo(59)).toBe('Just Now');
    expect(formatAgo(60)).toBe('1 Min Ago');
    expect(formatAgo(59 * 60 + 59)).toBe('59 Min Ago');
    expect(formatAgo(3600)).toBe('1 Hr Ago');
    expect(formatAgo(3600 + 5 * 60)).toBe('1 Hr 5 Min Ago');
    expect(formatAgo(24 * 3600)).toBe('1 Day Ago');
    expect(formatAgo(3 * 24 * 3600)).toBe('3 Days Ago');
    expect(formatAgo(-30)).toBe('Just Now');
  });
});

describe('this phone being offline', () => {
  it('goes offline after a stretch with nothing heard, and says since when', () => {
    expect(viewerOfflineSince(t0, t0 + (VIEWER_OFFLINE_SEC - 1) * sec)).toBeNull();
    expect(viewerOfflineSince(t0, t0 + VIEWER_OFFLINE_SEC * sec)).toBe(t0);
  });
});

describe('sending fixes', () => {
  const here = { lat: 39.5, lng: -105.0 };
  it('sends the first fix, a move of 25 m, and a heartbeat when parked', () => {
    expect(shouldSendFix(null, { ...here, at: t0 }, distanceM)).toBe(true);
    const last = { ...here, at: t0 };
    expect(shouldSendFix(last, { ...here, at: t0 + 5 * sec }, distanceM)).toBe(false);
    expect(shouldSendFix(last, { lat: 39.5003, lng: -105.0, at: t0 + 5 * sec }, distanceM)).toBe(true);
    expect(shouldSendFix(last, { ...here, at: t0 + HEARTBEAT_SEC * sec }, distanceM)).toBe(true);
  });

  it('heartbeats faster than a parked rider would turn delayed', () => {
    expect(HEARTBEAT_SEC * 2).toBeLessThan(LIVE_SEC);
  });
});

describe('share end on the phone', () => {
  it('stops at the end time even with no service, and open-ended shares keep going', () => {
    expect(shareStillOn(t0, t0 - 1)).toBe(true);
    expect(shareStillOn(t0, t0)).toBe(false);
    expect(shareStillOn(null, t0)).toBe(true);
  });
});
