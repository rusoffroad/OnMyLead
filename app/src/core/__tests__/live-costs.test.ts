import { describe, expect, it } from 'vitest';

import {
  MAX_REALTIME_IN_VALUES,
  positionsFilter,
  rosterKey,
  shouldFlushTrack,
  TRACK_FLUSH_EVERY_MS,
  TRACK_FLUSH_MAX_PENDING,
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
  it('sends early when many points are waiting', () => {
    expect(shouldFlushTrack(t0, t0 + 1, TRACK_FLUSH_MAX_PENDING)).toBe(true);
  });
});
