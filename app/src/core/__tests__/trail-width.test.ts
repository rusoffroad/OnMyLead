import { describe, expect, it } from 'vitest';

import {
  fitName, inches, middleWidth, mvumWidthLimitIn, parseRiderWidths, parseWidth, rigFit, shownWidth, trailLineKey, widthLabel, NO_RIDER_WIDTHS,
} from '../trail-width';
import { parseBlm, parseFsClosed, parseMvum } from '../trails';

describe('mvumWidthLimitIn', () => {
  it('is 50" when only the 50 inch classes are open', () => {
    expect(mvumWidthLimitIn({ atv: 'open', motorcycle: 'open', other_ohv_lt50inches: 'open', other_ohv_gt50inches: null })).toBe(50);
    expect(mvumWidthLimitIn({ atv: 'Open' })).toBe(50);
    expect(mvumWidthLimitIn({ tracked_ohv_lt50inches: 'open' })).toBe(50);
  });
  it('has no limit when anything wider may use it', () => {
    expect(mvumWidthLimitIn({ atv: 'open', other_ohv_gt50inches: 'open' })).toBeNull();
    expect(mvumWidthLimitIn({ atv: 'open', highclearancevehicle: 'open' })).toBeNull();
    expect(mvumWidthLimitIn({ passengervehicle: 'open' })).toBeNull();
  });
  it('gives no number for single track (dirt bikes only) or no data', () => {
    expect(mvumWidthLimitIn({ motorcycle: 'open' })).toBeNull();
    expect(mvumWidthLimitIn({})).toBeNull();
    expect(mvumWidthLimitIn({ atv: 'closed' })).toBeNull();
  });
  it('flows into the trail card info', () => {
    const t = parseMvum({ id: '731', forestname: 'Fishlake National Forest', atv: 'open', other_ohv_lt50inches: 'open' }, 'trail');
    expect(t.widthLimitIn).toBe(50);
    expect(t.lineKey).toBe('731@Fishlake National Forest');
    expect(parseMvum({ id: '12', fourwd_gt50inches: 'open' }, 'road').widthLimitIn).toBeNull();
    expect(parseFsClosed({ id: '9' }).widthLimitIn).toBeNull();
    expect(parseBlm({ ROUTE_ID: 'R1', ADMIN_ST: 'UT' }).lineKey).toBe('R1@UT');
  });
});

describe('trailLineKey', () => {
  it('keys agency lines by route id and forest or state, OpenStreetMap by nothing', () => {
    expect(trailLineKey('mvum', { id: '731', forestname: 'Dixie' })).toBe('731@Dixie');
    expect(trailLineKey('mvum', { id: null })).toBeNull();
    expect(trailLineKey('blm', {})).toBeNull();
    expect(trailLineKey('osm', { id: 'x' })).toBeNull();
    expect(trailLineKey('mvum', { id: 'x'.repeat(100), forestname: 'F' })!.length).toBe(80);
  });
});

describe('parseWidth', () => {
  it('reads plain inches and common spellings', () => {
    expect(parseWidth('50')).toEqual({ ok: true, value: 50 });
    expect(parseWidth(' 64" ')).toEqual({ ok: true, value: 64 });
    expect(parseWidth('72 in')).toEqual({ ok: true, value: 72 });
    expect(parseWidth('60.4')).toEqual({ ok: true, value: 60 });
    expect(parseWidth('')).toEqual({ ok: true, value: null });
  });
  it('refuses nonsense and out-of-range widths', () => {
    expect(parseWidth('wide').ok).toBe(false);
    expect(parseWidth('12').ok).toBe(false);
    expect(parseWidth('200').ok).toBe(false);
    expect(parseWidth('24', 20, 120)).toEqual({ ok: true, value: 24 });
  });
});

describe('middleWidth', () => {
  it('takes the middle, narrower on a tie, so one wrong entry cannot move it', () => {
    expect(middleWidth([])).toBeNull();
    expect(middleWidth([64])).toBe(64);
    expect(middleWidth([50, 120])).toBe(50);
    expect(middleWidth([64, 50, 52])).toBe(52);
    expect(middleWidth([50, 50, 50, 30])).toBe(50);
  });
});

describe('shownWidth', () => {
  it('prefers the agency limit and mentions riders when they differ', () => {
    expect(shownWidth(50, NO_RIDER_WIDTHS)).toEqual({ widthIn: 50, label: '50" Width Limit', detail: 'From the Forest Service vehicle rules.' });
    expect(shownWidth(50, { widthIn: 60, count: 3, mine: null })?.detail).toContain('Riders report 60"');
  });
  it('uses riders where the agency says nothing', () => {
    expect(shownWidth(null, { widthIn: 60, count: 1, mine: 60 })).toEqual({ widthIn: 60, label: '60" Width Limit', detail: 'Added by 1 rider.' });
    expect(shownWidth(null, { widthIn: 64, count: 4, mine: null })?.detail).toBe("Middle of 4 riders' entries.");
    expect(shownWidth(null, NO_RIDER_WIDTHS)).toBeNull();
  });
});

describe('parseRiderWidths', () => {
  it('reads the server answer and survives junk', () => {
    expect(parseRiderWidths({ width_in: 52, count: 3, mine: 50 })).toEqual({ widthIn: 52, count: 3, mine: 50 });
    expect(parseRiderWidths({ width_in: null, count: 0, mine: null })).toEqual(NO_RIDER_WIDTHS);
    expect(parseRiderWidths({ width_in: '60', count: '2' })).toEqual({ widthIn: 60, count: 2, mine: null });
    expect(parseRiderWidths(null)).toEqual(NO_RIDER_WIDTHS);
  });
});

describe('rigFit', () => {
  const rzr = { id: '1', name: 'RZR', widthIn: 64 };
  const atv = { id: '2', name: 'Grizzly', widthIn: 48 };
  const jeep = { id: '3', name: 'Jeep', widthIn: null };
  it('says nothing without a limit or Garage widths', () => {
    expect(rigFit(null, [rzr]).line).toBeNull();
    expect(rigFit(50, [jeep]).line).toBeNull();
  });
  it('names the one machine', () => {
    expect(rigFit(50, [rzr]).line).toBe('Your RZR Is Too Wide (64")');
    expect(rigFit(50, [atv]).line).toBe('Your Grizzly Fits (48")');
    expect(rigFit(64, [rzr]).line).toBe('Your RZR Fits (64")');
  });
  it('sums up several', () => {
    expect(rigFit(50, [rzr, atv, jeep]).line).toBe('Your RZR Is Too Wide (64")');
    expect(rigFit(50, [rzr, { id: '4', name: 'X3', widthIn: 72 }, atv]).line).toBe('Too Wide: RZR, X3');
    expect(rigFit(40, [rzr, atv]).line).toBe('Your Machines Are Too Wide');
    expect(rigFit(70, [rzr, atv]).line).toBe('Your Machines Fit');
  });
});

describe('labels', () => {
  it('formats inches and names', () => {
    expect(inches(50.4)).toBe('50"');
    expect(widthLabel(50)).toBe('50" (4 ft 2 in)');
    expect(widthLabel(60)).toBe('60" (5 ft)');
    expect(fitName({ nickname: ' Red ', make: 'Polaris' })).toBe('Red');
    expect(fitName({ make: 'Polaris', model: 'RZR' })).toBe('Polaris RZR');
    expect(fitName({})).toBe('Machine');
  });
});
