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
    // The queued pass starts the moment the first one ends.
    expect(runs).toBe(2);
    await second;
    expect(runs).toBe(2);
    await go();
    expect(runs).toBe(3);
  });
  it('a call made as one pass ends waits its turn behind the queued pass, never beside it', async () => {
    let runs = 0;
    let inFlight = 0;
    let most = 0;
    let release: () => void = () => {};
    const go = singleFlight(async () => {
      runs += 1;
      inFlight += 1;
      most = Math.max(most, inFlight);
      if (runs === 1) await new Promise<void>((r) => (release = r));
      inFlight -= 1;
    });
    const first = go();
    const queued = go();
    release();
    await first;
    const late = go();
    expect(late).not.toBe(queued);
    await late;
    expect(runs).toBe(3);
    expect(most).toBe(1);
  });
  it('turns a throw before the first await into a failed pass, first or queued', async () => {
    let runs = 0;
    let release: () => void = () => {};
    const go = singleFlight(() => {
      runs += 1;
      if (runs === 1) return new Promise<void>((r) => (release = r));
      if (runs === 2) throw new Error('at once');
      return Promise.resolve();
    });
    const first = go();
    const queued = go();
    release();
    await first;
    await expect(queued).rejects.toThrow('at once');
    await expect(go()).resolves.toBeUndefined();
    const alone = singleFlight(() => {
      throw new Error('sync');
    });
    await expect(alone()).rejects.toThrow('sync');
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
