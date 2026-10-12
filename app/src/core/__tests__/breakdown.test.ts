import { describe, expect, it } from 'vitest';
import { breakdownKey, breakdownSpot, isActiveCall, spokenBreakdown, STATUS_SHOWN_MS } from '../breakdown';
import { CARPLAY_STATUS_BUTTONS, carPlayState, parseCarPlayAction } from '../carplay';

const now = Date.parse('2026-10-12T20:00:00Z');
const at = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('Mechanical Issue', () => {
  it('stays up until the rider sends another status', () => {
    expect(isActiveCall({ status: 'mechanical', tapped_at: at(3 * 60 * 60_000) }, now)).toBe(true);
    expect(isActiveCall({ status: 'ok', tapped_at: at(1000) }, now)).toBe(false);
    expect(isActiveCall(undefined, now)).toBe(false);
  });

  it('lets other statuses drop off after 30 minutes', () => {
    expect(isActiveCall({ status: 'flat_tire', tapped_at: at(STATUS_SHOWN_MS - 1000) }, now)).toBe(true);
    expect(isActiveCall({ status: 'flat_tire', tapped_at: at(STATUS_SHOWN_MS + 1000) }, now)).toBe(false);
  });

  it('places the rider at their live position, else where they tapped', () => {
    const tapped = { status: 'mechanical' as const, tapped_at: at(0), lat: 38.5, lng: -109.5 };
    expect(breakdownSpot(tapped, { lat: 38.6, lng: -109.6 })).toEqual({ lat: 38.6, lng: -109.6 });
    expect(breakdownSpot(tapped, null)).toEqual({ lat: 38.5, lng: -109.5 });
    expect(breakdownSpot({ ...tapped, lat: null, lng: null }, null)).toBeNull();
    expect(breakdownSpot({ ...tapped, status: 'stopped' }, null)).toBeNull();
  });

  it('treats a second tap as a new breakdown', () => {
    expect(breakdownKey('u', { status: 'mechanical', tapped_at: at(0) })).not.toBe(breakdownKey('u', { status: 'mechanical', tapped_at: at(1) }));
    expect(spokenBreakdown('Mike')).toBe('Mike has a mechanical issue. Their location is on the map.');
  });

  it('is a CarPlay button that sends the mechanical status', () => {
    const b = CARPLAY_STATUS_BUTTONS.find((x) => x.id === 'status:mechanical');
    expect(b?.title).toBe('Mechanical Issue');
    expect(parseCarPlayAction('status:mechanical')).toEqual({ type: 'status', kind: 'mechanical' });
    for (const canRegroup of [true, false]) {
      const ids = carPlayState({ rideName: 'R', separated: [], watchesBubble: false, canRegroup, riders: [], helpCalls: [] }).buttons.map((x) => x.id);
      expect(ids).toContain('status:mechanical');
      expect(ids).toContain('emergency');
    }
  });
});
