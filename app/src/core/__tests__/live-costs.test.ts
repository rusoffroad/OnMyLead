import { describe, expect, it } from 'vitest';

import {
  MAX_REALTIME_IN_VALUES,
  positionsFilter,
  rosterKey,
  capTrackQueue,
  isTrackRefused,
  shouldFlushTrack,
  TRACK_FLUSH_EVERY_MS,
  TRACK_FLUSH_MAX_BACKOFF_MS,
  TRACK_FLUSH_MAX_PENDING,
  TRACK_FLUSH_MIN_GAP_MS,
  TRACK_QUEUE_MAX_POINTS,
} from '../live-costs';

describe('positionsFilter', () => {
  it('listens only to the given riders, sorted and de-duplicated', () => {
    expect(positionsFilter(['b', 'a', 'b'])).toEqual({ filter: 'user_id=in.(a,b)' });
  });
  it('listens to nothing when nobody has joined', () => {
    expect(positionsFilter([])).toBeNull();
    expect(positionsFilter([''])).toBeNull();
  });
  it('falls back to no filter above the Realtime limit, so no rider goes missing', () => {
    const many = Array.from({ length: MAX_REALTIME_IN_VALUES + 1 }, (_, i) => `u${i}`);
    expect(positionsFilter(many)).toEqual({});
    expect(positionsFilter(many.slice(0, MAX_REALTIME_IN_VALUES))?.filter).toMatch(/^user_id=in\./);
  });
});

describe('rosterKey', () => {
  it('ignores order and duplicates', () => {
    expect(rosterKey(['b', 'a', 'a'])).toBe(rosterKey(new Set(['a', 'b'])));
    expect(rosterKey(['a'])).not.toBe(rosterKey(['a', 'b']));
  });
});

describe('shouldFlushTrack', () => {
  const t0 = 1_000_000;
  it('never sends an empty queue', () => {
    expect(shouldFlushTrack(null, t0, 0)).toBe(false);
  });
  it('sends the first batch right away', () => {
    expect(shouldFlushTrack(null, t0, 1)).toBe(true);
  });
  it('waits between batches', () => {
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_EVERY_MS - 1, 5)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_EVERY_MS, 5)).toBe(true);
  });
  it('sends early when many points are waiting, but never on every fix', () => {
    expect(shouldFlushTrack(t0, t0 + 1, TRACK_FLUSH_MAX_PENDING)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_MIN_GAP_MS - 1, 5000)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_MIN_GAP_MS, TRACK_FLUSH_MAX_PENDING)).toBe(true);
  });
  it('backs off after uploads fail, even with many points waiting', () => {
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_MIN_GAP_MS, 500, 1)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_EVERY_MS, 500, 1)).toBe(true);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_EVERY_MS * 2 - 1, 500, 2)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_EVERY_MS * 2, 500, 2)).toBe(true);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_MAX_BACKOFF_MS - 1, 500, 30)).toBe(false);
    expect(shouldFlushTrack(t0, t0 + TRACK_FLUSH_MAX_BACKOFF_MS, 500, 30)).toBe(true);
  });
  it('a ride that keeps refusing the upload asks at most a few times an hour', () => {
    // The 3.1 crash: one refused ride, a fix every second for five minutes.
    let last: number | null = null;
    let failures = 0;
    let uploads = 0;
    for (let s = 0; s < 300; s++) {
      const now = t0 + s * 1000;
      if (shouldFlushTrack(last, now, 200, failures)) {
        uploads++;
        last = now;
        failures++;
      }
    }
    expect(uploads).toBeLessThanOrEqual(3);
  });
});

describe('isTrackRefused', () => {
  it('is a refusal for row security, a missing ride, or 403', () => {
    expect(isTrackRefused({ code: '42501' })).toBe(true);
    expect(isTrackRefused({ code: '23503' })).toBe(true);
    expect(isTrackRefused({ code: 'PGRST301', status: 403 })).toBe(true);
  });
  it('is not a refusal for no service or a server hiccup', () => {
    expect(isTrackRefused(null)).toBe(false);
    expect(isTrackRefused({ code: '', status: 0 })).toBe(false);
    expect(isTrackRefused({ code: '57014', status: 500 })).toBe(false);
  });
});

describe('capTrackQueue', () => {
  it('keeps the newest points', () => {
    const pts = Array.from({ length: TRACK_QUEUE_MAX_POINTS + 5 }, (_, i) => i);
    const capped = capTrackQueue(pts);
    expect(capped).toHaveLength(TRACK_QUEUE_MAX_POINTS);
    expect(capped[0]).toBe(5);
    expect(capTrackQueue([1, 2])).toEqual([1, 2]);
  });
});
