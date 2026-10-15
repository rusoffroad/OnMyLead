import { describe, expect, it } from 'vitest';

import { applyPositionChange, RosterGate, ROSTER_RECHECK_MS } from '../live-roster';

type P = { user_id: string; lat: number; lng: number };
const a: P = { user_id: 'a', lat: 1, lng: 1 };

describe('applyPositionChange', () => {
  it('adds a rider who starts sharing and moves one who is already there', () => {
    const added = applyPositionChange<P>({}, { eventType: 'INSERT', new: a, old: null });
    expect(added).toEqual({ a });
    const moved = applyPositionChange<P>(added, { eventType: 'UPDATE', new: { ...a, lat: 2 }, old: { user_id: 'a' } });
    expect(moved.a.lat).toBe(2);
  });
  it('drops the dot when the row is removed', () => {
    const prev = { a, b: { user_id: 'b', lat: 0, lng: 0 } };
    expect(applyPositionChange<P>(prev, { eventType: 'DELETE', new: {}, old: { user_id: 'a' } })).toEqual({ b: prev.b });
  });
  it('ignores changes it cannot place', () => {
    const prev = { a };
    expect(applyPositionChange<P>(prev, { eventType: 'DELETE', new: {}, old: { user_id: 'z' } })).toBe(prev);
    expect(applyPositionChange<P>(prev, { eventType: 'UPDATE', new: {}, old: null })).toBe(prev);
  });
});

describe('RosterGate', () => {
  it('reloads the list for a rider it has not seen, once per gap', () => {
    const g = new RosterGate();
    expect(g.shouldReload('new', false, 0)).toBe(true);
    expect(g.shouldReload('new', false, 1_000)).toBe(false);
    expect(g.shouldReload('new', false, ROSTER_RECHECK_MS)).toBe(true);
  });
  it('never reloads for a rider already in the list', () => {
    const g = new RosterGate();
    expect(g.shouldReload('m', true, 0)).toBe(false);
  });
  it('asks again at once if a member leaves and comes back', () => {
    const g = new RosterGate();
    g.shouldReload('x', false, 0);
    g.shouldReload('x', true, 1_000);
    expect(g.shouldReload('x', false, 2_000)).toBe(true);
  });
  it('tracks each unknown rider on its own', () => {
    const g = new RosterGate();
    expect(g.shouldReload('x', false, 0)).toBe(true);
    expect(g.shouldReload('y', false, 0)).toBe(true);
  });
});
