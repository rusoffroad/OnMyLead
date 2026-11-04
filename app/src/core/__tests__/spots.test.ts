import { describe, expect, it } from 'vitest';

import {
  createRideHref, distanceText, filterKinds, fractionToMiles, kindCounts, milesToFraction, nearestStepIndex, parseSavedMiles,
  parseSpotDetail, parseSpots, placeLine, safeWebsite, SCOUT_DEFAULT_MILES, SCOUT_MILE_STEPS, sourceCredit, spotFromParams,
  stepMiles, suggestionProblem, toggleKind, websiteHost,
} from '../spots';
// The import's rules live beside the import script (plain JavaScript, run by hand).
import { classifyOsm, cleanText, kindFromName, spotKey, stateCode } from '../../../scripts/spots/classify.mjs';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1', name: 'Hidden Falls Adventure Park', kind: 'park', lat: 30.6079, lng: -98.1582, state: 'TX', area_name: 'Burnet County',
  website: 'https://www.hiddenfallsadventure.com', source: 'osm', attribution: '© OpenStreetMap contributors', distance_mi: 42.4, rides_coming_up: 2,
  ...over,
});

describe('search distance', () => {
  it('starts at 250 miles and reads junk back as 250', () => {
    expect(SCOUT_DEFAULT_MILES).toBe(250);
    expect(parseSavedMiles(null)).toBe(250);
    expect(parseSavedMiles('lots')).toBe(250);
    expect(parseSavedMiles('100')).toBe(100);
    expect(parseSavedMiles('120')).toBe(100);
    expect(parseSavedMiles('5000')).toBe(1000);
  });

  it('steps one stop at a time and holds at the ends', () => {
    expect(stepMiles(250, 1)).toBe(300);
    expect(stepMiles(250, -1)).toBe(200);
    expect(stepMiles(1000, 1)).toBe(1000);
    expect(stepMiles(10, -1)).toBe(10);
  });

  it('maps the slider both ways, evenly spaced', () => {
    for (const m of SCOUT_MILE_STEPS) expect(fractionToMiles(milesToFraction(m))).toBe(m);
    expect(fractionToMiles(0)).toBe(10);
    expect(fractionToMiles(1)).toBe(1000);
    expect(fractionToMiles(-3)).toBe(10);
    expect(fractionToMiles(9)).toBe(1000);
    expect(fractionToMiles(Number.NaN)).toBe(10);
    expect(nearestStepIndex(260)).toBe(SCOUT_MILE_STEPS.indexOf(250));
  });
});

describe('results', () => {
  it('reads the server rows nearest first and drops bad ones', () => {
    const spots = parseSpots([
      row(),
      row({ id: 'b2', name: 'Rasor OHV Area', kind: 'ohv_area', distance_mi: '3.5', rides_coming_up: null, state: null, lat: 35.08, lng: -116.19, source: 'blm' }),
      row({ id: 'c3', kind: 'helipad' }),
      row({ id: 'd4', lat: 'x' }),
      row({ id: '', name: 'No id' }),
      null,
    ]);
    expect(spots.map((s) => s.id)).toEqual(['b2', 'a1']);
    expect(spots[0]).toMatchObject({ distanceMi: 3.5, ridesComingUp: 0, state: null, source: 'blm' });
    expect(spots[1]).toMatchObject({ areaName: 'Burnet County', ridesComingUp: 2 });
    expect(parseSpots('nope')).toEqual([]);
  });

  it('keeps only web links that are safe to open', () => {
    expect(safeWebsite('https://www.fs.usda.gov/recarea/x')).toBe('https://www.fs.usda.gov/recarea/x');
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(safeWebsite('ftp://x.com')).toBeNull();
    expect(parseSpots([row({ website: 'javascript:alert(1)' })])[0].website).toBeNull();
    expect(websiteHost('https://www.fs.usda.gov/recarea/x')).toBe('fs.usda.gov');
  });

  it('reads a place page row', () => {
    const d = parseSpotDetail({ ...row(), description: ' Big park ', vehicle_types: ['ATV', 3, ''], license: 'ODbL 1.0' });
    expect(d).toMatchObject({ name: 'Hidden Falls Adventure Park', description: 'Big park', vehicleTypes: ['ATV'], license: 'ODbL 1.0' });
    expect(d).not.toHaveProperty('distanceMi');
    expect(parseSpotDetail(null)).toBeNull();
  });

  it('counts and filters by kind; every kind on is the same as none', () => {
    const spots = parseSpots([row(), row({ id: 'b', kind: 'track' }), row({ id: 'c', kind: 'track' })]);
    expect(kindCounts(spots)).toMatchObject({ park: 1, track: 2, trailhead: 0 });
    expect(filterKinds(spots, ['track']).map((s) => s.id)).toEqual(['b', 'c']);
    expect(filterKinds(spots, [])).toHaveLength(3);
    let k = toggleKind([], 'track');
    expect(k).toEqual(['track']);
    k = toggleKind(k, 'park');
    expect(k).toEqual(['park', 'track']);
    expect(toggleKind(k, 'track')).toEqual(['park']);
    expect(toggleKind(['park', 'ohv_area', 'trail_system', 'trailhead'], 'track')).toEqual([]);
  });

  it('words distance, place and credit', () => {
    expect(distanceText(0.4)).toBe('Under 1 mi');
    expect(distanceText(1234.4)).toBe('1,234 mi');
    expect(placeLine({ areaName: 'Ocala National Forest', state: 'FL' })).toBe('Ocala National Forest, Florida');
    expect(placeLine({ areaName: null, state: 'TX' })).toBe('Texas');
    expect(placeLine({ areaName: null, state: null })).toBe('');
    expect(sourceCredit({ source: 'osm', attribution: null })).toMatch(/OpenStreetMap contributors/);
    expect(sourceCredit({ source: 'usfs', attribution: null })).toMatch(/Forest Service/);
  });
});

describe('Create a Ride Here', () => {
  it('round-trips the place into the Create a Ride link', () => {
    const href = createRideHref({ name: 'Gator Run & Offroad Park', lat: 30.123456, lng: -95.654321, state: 'TX' });
    expect(href.startsWith('/ride/new?')).toBe(true);
    const p = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(p.type).toBe('public');
    expect(spotFromParams(p)).toEqual({ name: 'Gator Run & Offroad Park', lat: 30.12346, lng: -95.65432, state: 'TX' });
  });

  it('ignores a link without a usable place', () => {
    expect(spotFromParams({})).toBeNull();
    expect(spotFromParams({ spot: 'X', lat: '100', lng: '0' })).toBeNull();
    expect(spotFromParams({ spot: '  ', lat: '1', lng: '1' })).toBeNull();
    expect(spotFromParams({ spot: 'X', lat: '1', lng: '1', state: 'texas' })?.state).toBeNull();
  });
});

describe('Suggest a Place', () => {
  const ok = { name: 'Katemcy Rocks', kind: 'park' as const, at: { lat: 30.9, lng: -99.2 }, website: '', note: '' };
  it('says what is missing', () => {
    expect(suggestionProblem(ok)).toBeNull();
    expect(suggestionProblem({ ...ok, name: 'K' })).toMatch(/name/);
    expect(suggestionProblem({ ...ok, kind: null })).toMatch(/kind/);
    expect(suggestionProblem({ ...ok, at: null })).toMatch(/where/);
    expect(suggestionProblem({ ...ok, website: 'katemcyrocks.com' })).toBeNull();
    expect(suggestionProblem({ ...ok, website: 'not a site' })).toMatch(/website/);
    expect(suggestionProblem({ ...ok, note: 'x'.repeat(501) })).toMatch(/500/);
  });
});

describe('import rules (scripts/spots)', () => {
  const f = (name: string, osm_value = 'park', extra: Record<string, unknown> = {}) => ({
    properties: { name, osm_value, osm_key: 'leisure', osm_id: 1, osm_type: 'W', countrycode: 'US', state: 'Texas', extent: [0, 0, 1, 1], ...extra },
    geometry: { coordinates: [-98.15, 30.6] },
  });

  it('keeps riding places and files them by kind', () => {
    expect(classifyOsm(f('Hidden Falls Adventure Park'))).toMatchObject({ kind: 'park', state: 'TX', source: 'osm', source_id: '1' });
    expect(classifyOsm(f('Gator Run Offroad Park', 'sports_centre'))?.kind).toBe('park');
    expect(classifyOsm(f('Rio Bravo Motocross Park'))?.kind).toBe('track');
    expect(classifyOsm(f('Haystack Mountain Off-Highway Vehicle Area'))?.kind).toBe('ohv_area');
  });

  it('drops look-alikes', () => {
    expect(classifyOsm(f('McLane Off-Leash Dog Park', 'dog_park'))).toBeNull();
    expect(classifyOsm(f('Stanley Lake MUD Park'))).toBeNull();
    expect(classifyOsm(f('Mud Creek Park'))).toBeNull();
    expect(classifyOsm(f('Adventure Park'))).toBeNull();
    expect(classifyOsm(f('Treetop Adventure Park'))).toBeNull();
    expect(classifyOsm(f('Bolder Adventure Park', 'park', { osm_type: 'N', extent: undefined }))).toBeNull();
    expect(classifyOsm(f('Moab Jeep Rentals', 'shop'))).toBeNull();
    expect(classifyOsm(f('Urban Air Adventure Park'))).toBeNull();
    expect(classifyOsm(f('Burning Rock Outdoor Adventure Park'))?.kind).toBe('park');
    expect(classifyOsm(f('Motocross Track'))).toBeNull();
    expect(classifyOsm(f('Private Motocross Track'))).toBeNull();
    expect(classifyOsm(f('Motocross Lane', 'track'))).toBeNull();
    expect(classifyOsm(f('Pocono ATV Tours'))).toBeNull();
    expect(classifyOsm(f('Ontario ORV Park', 'park', { countrycode: 'CA' }))).toBeNull();
  });

  it('names kinds, cleans agency text, and matches duplicates', () => {
    expect(kindFromName('Snow Dog Trailhead')).toBe('trailhead');
    expect(kindFromName('Great Western Trail North Staging Area')).toBe('trailhead');
    expect(kindFromName('Mill Creek Trail', 'park')).toBe('trail_system');
    expect(kindFromName('Rasor Off Highway Vehicle Area')).toBe('ohv_area');
    expect(kindFromName('Rasor OHV Area')).toBe('ohv_area');
    expect(cleanText('<p><!--x-->Ride&nbsp;here &amp; camp</p>')).toBe('Ride here & camp');
    expect(cleanText('word '.repeat(200), 50)!.length).toBeLessThanOrEqual(51);
    expect(stateCode('Texas')).toBe('TX');
    expect(stateCode('UT')).toBe('UT');
    expect(spotKey({ name: 'Rasor OHV Area', lat: 35.0799, lng: -116.1937 })).toBe(spotKey({ name: 'rasor ohv area', lat: 35.081, lng: -116.194 }));
  });
});
