import { describe, expect, it, vi } from 'vitest';
import { foregroundPermission, shouldAskForPermission } from '../location-permission';

describe('shouldAskForPermission', () => {
  it('does not ask when access is already granted', () => {
    expect(shouldAskForPermission({ status: 'granted', canAskAgain: true })).toBe(false);
  });
  it('asks the first time', () => {
    expect(shouldAskForPermission({ status: 'undetermined', canAskAgain: true })).toBe(true);
  });
  it('asks again after one "Don\'t allow" while the system still shows the question', () => {
    expect(shouldAskForPermission({ status: 'denied', canAskAgain: true })).toBe(true);
  });
  it('stops asking once it was turned down for good', () => {
    expect(shouldAskForPermission({ status: 'denied', canAskAgain: false })).toBe(false);
  });
});

describe('foregroundPermission', () => {
  const api = (now: { status: string; canAskAgain: boolean }) => ({
    get: vi.fn(async () => now),
    request: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  });

  it('never opens the permission screen when granted (the Android Ride Mode loop)', async () => {
    const a = api({ status: 'granted', canAskAgain: true });
    for (let i = 0; i < 5; i++) expect((await foregroundPermission(a)).status).toBe('granted');
    expect(a.request).not.toHaveBeenCalled();
  });
  it('asks when not granted yet and returns the answer', async () => {
    const a = api({ status: 'undetermined', canAskAgain: true });
    expect((await foregroundPermission(a)).status).toBe('granted');
    expect(a.request).toHaveBeenCalledTimes(1);
  });
  it('returns the denial without asking when it cannot ask again', async () => {
    const a = api({ status: 'denied', canAskAgain: false });
    expect((await foregroundPermission(a)).status).toBe('denied');
    expect(a.request).not.toHaveBeenCalled();
  });
});
