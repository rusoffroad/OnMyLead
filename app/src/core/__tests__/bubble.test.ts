import { describe, expect, it } from 'vitest';
import { BUBBLE_PRESETS, BubbleRider, computeBubble } from '../bubble';

const now = 1_800_000_000_000;
const settings = BUBBLE_PRESETS.default;
// ~0.0145 degrees of latitude is about 1 mile.
const MILE_LAT = 1 / 69;

function rider(id: string, latMiles: number, opts: Partial<BubbleRider> = {}, speed = 8): BubbleRider {
  return {
    id,
    name: id,
    role: 'rider',
    sharing: true,
    fix: { lat: 38 + latMiles * MILE_LAT, lng: -109.5, at: now - 5_000, speedMps: speed, headingDeg: 0 },
    lastMovedAt: now - 5_000,
    ...opts,
  };
}

describe('computeBubble', () => {
  it('keeps a tight group green', () => {
    const r = computeBubble(
      [rider('Lead', 0, { role: 'leader' }), rider('A', -0.1), rider('B', -0.2), rider('Sweep', -0.3, { role: 'sweep' })],
      settings,
      now,
    );
    expect(r.groupMoving).toBe(true);
    expect(r.riders.every((s) => s.status === 'green')).toBe(true);
    expect(r.alerts).toHaveLength(0);
  });

  it('flags a rider 1.7 miles behind as red with a readable message', () => {
    const r = computeBubble(
      [
        rider('Lead', 0, { role: 'leader' }),
        rider('A', -0.1),
        rider('B', -0.2),
        rider('Mike', -1.9, { lastMovedAt: now - 4 * 60_000 }, 0),
      ],
      settings,
      now,
    );
    const mike = r.riders.find((s) => s.riderId === 'Mike')!;
    expect(mike.status).toBe('red');
    expect(mike.message).toBe('Mike is 1.7 miles behind the group. Last moving 4 minutes ago.');
    expect(r.alerts.map((a) => a.riderId)).toEqual(['Mike']);
  });

  it('uses yellow between thresholds', () => {
    const r = computeBubble([rider('Lead', 0, { role: 'leader' }), rider('A', -0.1), rider('C', -0.9)], settings, now);
    expect(r.riders.find((s) => s.riderId === 'C')!.status).toBe('yellow');
  });

  it('measures a rider far ahead too', () => {
    const r = computeBubble([rider('Lead', 0, { role: 'leader' }), rider('A', -0.1), rider('Fast', 2)], settings, now);
    const fast = r.riders.find((s) => s.riderId === 'Fast')!;
    expect(fast.status).toBe('red');
    expect(fast.message).toContain('ahead of the group');
  });

  it('only counts stopping while the group is moving', () => {
    const stopped = { lastMovedAt: now - 10 * 60_000 };
    const parked = computeBubble(
      [rider('Lead', 0, { role: 'leader', ...stopped }, 0), rider('A', -0.05, stopped, 0)],
      settings,
      now,
    );
    expect(parked.groupMoving).toBe(false);
    expect(parked.riders.every((s) => s.status === 'green')).toBe(true);

    const moving = computeBubble(
      [rider('Lead', 0, { role: 'leader' }), rider('A', -0.05), rider('B', -0.1), rider('Flat', -0.12, { lastMovedAt: now - 6 * 60_000 }, 0)],
      settings,
      now,
    );
    const flat = moving.riders.find((s) => s.riderId === 'Flat')!;
    expect(flat.status).toBe('red');
    expect(flat.reason).toBe('stopped');
    expect(flat.message).toBe('Flat has stopped. Last moving 6 minutes ago.');
  });

  it('treats riders who are not sharing as unknown, never separated', () => {
    const r = computeBubble([rider('Lead', 0, { role: 'leader' }), rider('Private', -5, { sharing: false })], settings, now);
    const p = r.riders.find((s) => s.riderId === 'Private')!;
    expect(p.status).toBe('unknown');
    expect(p.reason).toBe('not_sharing');
    expect(r.alerts).toHaveLength(0);
  });

  it('marks a stale rider red with a last-known message', () => {
    const r = computeBubble(
      [
        rider('Lead', 0, { role: 'leader' }),
        rider('A', -0.1),
        rider('Gone', -0.2, { fix: { lat: 38, lng: -109.5, at: now - 8 * 60_000, speedMps: 0 } }),
      ],
      settings,
      now,
    );
    const gone = r.riders.find((s) => s.riderId === 'Gone')!;
    expect(gone.status).toBe('red');
    expect(gone.reason).toBe('no_update');
    expect(gone.message).toBe('No update from Gone for 8 minutes. Showing last known location.');
  });

  it('is green for a rider alone', () => {
    const r = computeBubble([rider('Solo', 0, { role: 'leader' })], settings, now);
    expect(r.riders[0].status).toBe('green');
  });
});
