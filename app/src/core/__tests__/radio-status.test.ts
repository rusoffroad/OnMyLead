import { describe, expect, it } from 'vitest';

import { radioStatus } from '../radio-status';

const base = { link: 'ready', battery: null, channelUtil: null, problem: null } as const;

describe('radio status', () => {
  it('shows connected with battery and channel use once the radio is ready', () => {
    expect(radioStatus({ ...base, battery: 76, channelUtil: 12.4 })).toEqual({ tone: 'good', detail: 'Connected · Battery 76% · Channel busy 12%', problem: null });
    expect(radioStatus({ ...base, battery: 101 }).detail).toBe('Connected · Plugged in');
  });

  it('says why the radio can’t carry ride packets', () => {
    const s = radioStatus({ ...base, problem: 'region' });
    expect(s.tone).toBe('bad');
    expect(s.problem).toMatch(/United States/);
    expect(radioStatus({ ...base, problem: 'ham' }).problem).toMatch(/ham/);
    // Not until the radio has said so (its settings arrive once connected).
    expect(radioStatus({ ...base, link: 'connecting', problem: 'region' }).problem).toBeNull();
  });

  it('names every link state, unknown ones as not connected', () => {
    expect(radioStatus({ ...base, link: 'disconnected' }).detail).toMatch(/Not in range/);
    expect(radioStatus({ ...base, link: 'pairing_failed' }).tone).toBe('bad');
    expect(radioStatus({ ...base, link: 'something_new' }).detail).toBe('Not connected');
  });
});
