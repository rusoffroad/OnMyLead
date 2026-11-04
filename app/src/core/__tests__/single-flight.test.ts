import { describe, expect, it } from 'vitest';

import { singleFlight } from '../../lib/single-flight';

describe('single flight', () => {
  it('runs once at a time and queues exactly one more pass', async () => {
    let runs = 0;
    let release: () => void = () => {};
    const go = singleFlight(() => {
      runs += 1;
      return runs === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    });
    const first = go();
    expect(go()).toBe(first);
    expect(go()).toBe(first);
    expect(runs).toBe(1);
    release();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    expect(runs).toBe(2);
    await go();
    expect(runs).toBe(3);
  });
  it('still runs again after a failed pass', async () => {
    let runs = 0;
    const go = singleFlight(() => {
      runs += 1;
      return runs === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
    });
    await expect(go()).rejects.toThrow('offline');
    await go();
    expect(runs).toBe(2);
  });
});
