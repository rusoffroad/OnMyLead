import { describe, expect, it } from 'vitest';

import { singleFlight } from '../../lib/single-flight';

describe('single flight', () => {
  it('runs once at a time; calls made mid-run share one pass after it and settle with it', async () => {
    let runs = 0;
    let release: () => void = () => {};
    const go = singleFlight(() => {
      runs += 1;
      return runs === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    });
    const first = go();
    const second = go();
    expect(second).not.toBe(first);
    expect(go()).toBe(second);
    expect(runs).toBe(1);
    release();
    await first;
    expect(runs).toBe(1);
    await second;
    expect(runs).toBe(2);
    await go();
    expect(runs).toBe(3);
  });
  it('reports a failed pass to whoever asked for it, and runs again after', async () => {
    let runs = 0;
    let fail: (e: Error) => void = () => {};
    const go = singleFlight(() => {
      runs += 1;
      if (runs === 1) return new Promise<void>((_, reject) => (fail = reject));
      return runs === 2 ? Promise.reject(new Error('offline')) : Promise.resolve();
    });
    const first = go();
    const second = go();
    fail(new Error('first'));
    await expect(first).rejects.toThrow('first');
    await expect(second).rejects.toThrow('offline');
    await go();
    expect(runs).toBe(3);
  });
});
