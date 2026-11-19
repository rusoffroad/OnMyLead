import { describe, expect, it } from 'vitest';

import {
  ACTIVITIES, ACTIVITY_IDS, ACTIVITY_KEY, activityById, activityFill, activityHero, activityInk, activityOf, activityPalette,
  cleanPlaceActivities, DEFAULT_ACTIVITY, parseActivity, placeServes, statusesFor,
} from '../activities';
import { buildPalette, DEFAULT_APPEARANCE, SKINS } from '../appearance';
import { contrast } from '../color';
import { STATUS_KINDS } from '../nearby';
import { SYNCED_SETTINGS } from '../synced-settings';
import { TRANSLATIONS } from '../translations';

describe('the activity list', () => {
  it('starts with Offroad, each id once, ids the database accepts', () => {
    expect(ACTIVITIES[0].id).toBe('offroad');
    expect(DEFAULT_ACTIVITY).toBe('offroad');
    expect(new Set(ACTIVITY_IDS).size).toBe(ACTIVITY_IDS.length);
    // Same rule as the check constraint in migration 20261121300000_activities.sql.
    for (const id of ACTIVITY_IDS) expect(id).toMatch(/^[a-z][a-z_]{1,23}$/);
  });

  it('keeps Offroad exactly as the app was: no colour, no hidden or extra buttons, today’s words', () => {
    const o = activityById('offroad');
    expect(o.colors).toBeNull();
    expect(o.hidden).toEqual([]);
    expect(o.moveReplies).toEqual([]);
    expect(o.troubleReplies).toEqual([]);
    expect(o.mapLine).toBe('Trails, recording and offline maps.');
    expect(o.eventsLine).toBe('Rallies and rides');
    expect(o.placesLine).toBe('Parks, forests and trails near you.');
    expect(o.createLine).toBeNull();
  });

  it('never hides Need Help, EMERGENCY, Mechanical or Lost, and only hides real statuses', () => {
    for (const a of ACTIVITIES) {
      for (const k of a.hidden) expect(STATUS_KINDS).toContain(k);
      for (const k of ['need_help', 'emergency', 'mechanical', 'lost', 'ok', 'stopped'] as const) expect(a.hidden).not.toContain(k);
    }
  });

  it('drops Flat Tire for sleds, Stuck on the road, and adds their own messages', () => {
    expect(statusesFor('snowmobile', ['need_fuel', 'mechanical', 'flat_tire', 'stuck'])).toEqual(['need_fuel', 'mechanical', 'stuck']);
    expect(activityById('snowmobile').troubleReplies).toContain('Belt Broke');
    expect(statusesFor('road_trip', ['need_fuel', 'flat_tire', 'stuck'])).toEqual(['need_fuel', 'flat_tire']);
    expect(activityById('road_trip').moveReplies).toEqual(['Food Stop', 'Restroom Stop']);
    expect(statusesFor('offroad', STATUS_KINDS)).toEqual([...STATUS_KINDS]);
  });

  it('keeps extra messages short enough for one Bluetooth packet and distinct from the built-in replies', () => {
    for (const a of ACTIVITIES) for (const m of [...a.moveReplies, ...a.troubleReplies]) {
      expect(m.length).toBeLessThanOrEqual(24);
      expect(['On My Way', 'Running Late', 'Need a Minute', 'All Good', 'Beverage Break']).not.toContain(m);
    }
  });

  it('has every rider-facing line translated in every language', () => {
    for (const a of ACTIVITIES) {
      const lines = [a.name, a.line, a.mapLine, a.eventsLine, a.placesLine, ...(a.createLine ? [a.createLine] : []), ...a.moveReplies, ...a.troubleReplies];
      for (const [code, dict] of Object.entries(TRANSLATIONS)) for (const l of lines) expect(dict[l], `${code}: ${l}`).toBeTruthy();
    }
  });
});

describe('reading an activity', () => {
  it('treats anything unknown, missing or from a newer app as Offroad', () => {
    expect(parseActivity('snowmobile')).toBe('snowmobile');
    expect(parseActivity('kayak')).toBe('offroad');
    expect(parseActivity(null)).toBe('offroad');
    expect(parseActivity(7)).toBe('offroad');
    expect(activityOf({ activity: 'road_trip' })).toBe('road_trip');
    expect(activityOf({})).toBe('offroad');
    expect(activityOf(null)).toBe('offroad');
  });

  it('follows the account across devices', () => {
    expect(SYNCED_SETTINGS[ACTIVITY_KEY]).toBeTruthy();
  });
});

describe('places', () => {
  it('a place from before Activities is Offroad only', () => {
    expect(placeServes(null, 'offroad')).toBe(true);
    expect(placeServes([], 'snowmobile')).toBe(false);
    expect(placeServes(['offroad', 'snowmobile'], 'snowmobile')).toBe(true);
    expect(placeServes(['offroad'], 'motorcycle')).toBe(false);
  });

  it('cleans what the admin saves: known ids, list order, never empty', () => {
    expect(cleanPlaceActivities(['snowmobile', 'offroad', 'snowmobile', 'kayak'])).toEqual(['offroad', 'snowmobile']);
    expect(cleanPlaceActivities([])).toEqual(['offroad']);
    expect(cleanPlaceActivities(null)).toEqual(['offroad']);
  });
});

describe('colours', () => {
  const base = buildPalette(DEFAULT_APPEARANCE, 'dark');

  it('Offroad leaves every colour exactly as it was', () => {
    for (const skin of SKINS) for (const mode of ['dark', 'light'] as const) {
      const a = { ...DEFAULT_APPEARANCE, skin: skin.id, mode };
      const scheme = mode;
      expect(buildPalette(a, null, (s, e) => activityPalette('offroad', s, e))).toEqual(buildPalette(a, null));
      expect(activityPalette('offroad', scheme, '#000000')).toBeNull();
    }
  });

  it('another activity changes the accent and the tile edges, never danger, Glass red or the ride colours', () => {
    const p = buildPalette(DEFAULT_APPEARANCE, 'dark', (s, e) => activityPalette('snowmobile', s, e));
    expect(p.colors.accent).not.toBe(base.colors.accent);
    expect(p.colors.tileEdge).not.toBe(base.colors.tileEdge);
    expect(p.colors.danger).toBe(base.colors.danger);
    expect(p.glass).toEqual(base.glass);
    expect(p.ride).toEqual(base.ride);
    expect(p.map).toEqual(base.map);
  });

  it('white text still reads on every activity’s accent, and its own text on its chip', () => {
    for (const a of ACTIVITIES) for (const scheme of ['dark', 'light'] as const) {
      const over = activityPalette(a.id, scheme, '#2C3B53');
      if (over) expect(contrast(over.accent, over.onAccent), `${a.id} ${scheme}`).toBeGreaterThanOrEqual(4.3);
      const fill = activityFill(a.id, scheme);
      if (fill) expect(contrast(fill.fill, fill.on), `${a.id} ${scheme} chip`).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('Join a Ride keeps its red for Offroad and its white words read in every other activity', () => {
    expect(activityHero('offroad')).toBeNull();
    for (const a of ACTIVITIES.filter((x) => x.colors)) {
      const h = activityHero(a.id)!;
      expect(contrast(h.top, '#FFFFFF'), a.id).toBeGreaterThanOrEqual(4.3);
      expect(contrast(h.bottom, '#FFFFFF'), a.id).toBeGreaterThanOrEqual(4.3);
      expect(contrast('#FFFFFF', h.joinText), a.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('each activity has its own colour, none teal, none the EMERGENCY red', () => {
    const fills = ACTIVITIES.filter((a) => a.colors).map((a) => a.colors!.bright.toUpperCase());
    expect(new Set(fills).size).toBe(fills.length);
    expect(fills).not.toContain('#E5262E');
    expect(fills).not.toContain('#57E3C3');
    expect(activityInk('offroad', 'dark', '#E5262E')).toBe('#E5262E');
  });
});
