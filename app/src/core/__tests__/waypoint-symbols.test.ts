import { describe, expect, it } from 'vitest';

import {
  isWaypointSymbol, symbolDrawing, symbolInfo, symbolKind, symbolLabel, symbolSvgMarkup, warningTriangle, WAYPOINT_SYMBOLS, waypointSymbol,
} from '../waypoint-symbols';
import { isSymbolsNotSwitchedOn, isPlannedStopsNotSwitchedOn, suggestWaypointName } from '../waypoints';

const ORIGINAL = ['spot', 'camp', 'fuel', 'water', 'view', 'hazard', 'parking'];

describe('waypoint symbols', () => {
  it('has the fifteen Chris picked, each once', () => {
    const ids = WAYPOINT_SYMBOLS.map((s) => s.symbol);
    expect(new Set(ids).size).toBe(15);
    for (const s of [...ORIGINAL, 'gate', 'trailhead', 'crossing', 'food', 'restroom', 'first_aid', 'repair', 'photo']) expect(ids).toContain(s);
    expect(new Set(WAYPOINT_SYMBOLS.map((s) => s.label)).size).toBe(15);
  });

  it('gives every symbol an original kind that older app builds understand', () => {
    for (const s of WAYPOINT_SYMBOLS) expect(ORIGINAL).toContain(s.kind);
    // The original seven keep their own kind; the new ones map to the nearest.
    for (const k of ORIGINAL) expect(symbolKind(k as never)).toBe(k);
    expect(symbolKind('crossing')).toBe('hazard');
    expect(symbolKind('trailhead')).toBe('parking');
    expect(symbolKind('photo')).toBe('view');
    expect(symbolKind('gate')).toBe('spot');
  });

  it('tells symbols apart by drawing, not colour: every one has its own picture', () => {
    const pictures = WAYPOINT_SYMBOLS.map((s) => JSON.stringify([s.paths, s.dots ?? []]));
    expect(new Set(pictures).size).toBe(WAYPOINT_SYMBOLS.length);
    for (const s of WAYPOINT_SYMBOLS) expect(s.paths.length + (s.dots?.length ?? 0)).toBeGreaterThan(0);
  });

  it('paints hazards on a warning triangle', () => {
    expect(symbolInfo('hazard').shape).toBe('triangle');
    expect(symbolInfo('crossing').shape).toBe('triangle');
    expect(symbolInfo('camp').shape).toBe('diamond');
    // On its own (the picker), the hazard brings its triangle with it.
    expect(symbolDrawing('hazard', true).paths[0]).toMatch(/^M12 4L/);
    expect(symbolDrawing('hazard').paths).toEqual(['M12 6.5v6']);
    expect(symbolDrawing('camp', true)).toEqual(symbolDrawing('camp'));
  });

  it('reads the symbol first, then the kind, and falls back to Spot', () => {
    expect(waypointSymbol({ kind: 'spot', symbol: 'gate' })).toBe('gate');
    expect(waypointSymbol({ kind: 'camp', symbol: null })).toBe('camp');
    expect(waypointSymbol({ kind: 'camp' })).toBe('camp');
    // A symbol from a newer app build than this one.
    expect(waypointSymbol({ kind: 'fuel', symbol: 'helipad' })).toBe('fuel');
    expect(waypointSymbol({ kind: 'nonsense' })).toBe('spot');
    expect(symbolLabel('helipad')).toBe('Spot');
    expect(isWaypointSymbol('first_aid')).toBe(true);
    expect(isWaypointSymbol('kind')).toBe(false);
  });

  it('names new waypoints after the symbol', () => {
    expect(suggestWaypointName('crossing', [])).toBe('Water Crossing');
    expect(suggestWaypointName('first_aid', [{ name: 'First Aid' }])).toBe('First Aid 2');
  });

  it('draws web markup with only safe numbers and the colour given', () => {
    const svg = symbolSvgMarkup('restroom', '#0A1626', 14);
    expect(svg).toMatch(/^<svg width="14" height="14" viewBox="0 0 24 24"/);
    expect(svg).toContain('stroke="#0A1626"');
    expect(svg).toContain('<circle');
    expect(symbolSvgMarkup('<script>', '#fff', 10)).toBe(symbolSvgMarkup('spot', '#fff', 10));
  });

  it('builds a point-up triangle inside the box', () => {
    const pts = warningTriangle(30).split(' ').map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(3);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(30);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
    expect(pts[0][1]).toBeLessThan(pts[1][1]);
  });
});

describe('servers without symbols yet', () => {
  it('spots a missing symbol column, so the save is retried with the kind alone', () => {
    expect(isSymbolsNotSwitchedOn("Could not find the 'symbol' column of 'ride_waypoints' in the schema cache", 'PGRST204')).toBe(true);
    expect(isSymbolsNotSwitchedOn('column "symbol" does not exist', '42703')).toBe(true);
    expect(isSymbolsNotSwitchedOn("Could not find the 'planned_stop' column of 'ride_waypoints' in the schema cache", 'PGRST204')).toBe(false);
    expect(isSymbolsNotSwitchedOn('new row violates row-level security policy', '42501')).toBe(false);
    // Planned stop detection is unchanged.
    expect(isPlannedStopsNotSwitchedOn("Could not find the 'planned_stop' column", 'PGRST204')).toBe(true);
  });
});
