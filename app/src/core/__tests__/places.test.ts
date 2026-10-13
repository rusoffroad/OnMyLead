import { describe, expect, it } from 'vitest';

import { kindOf, parseCoords, parsePlaces, placeDetail, placeLabel, placeSearchUrl } from '../places';

const feature = (props: Record<string, unknown>, coords: [number, number]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: props });

// Trimmed from real Photon answers on 2026-10-12.
const HIDDEN_FALLS = {
  features: [
    feature({ osm_type: 'W', osm_id: 1, osm_key: 'leisure', osm_value: 'park', name: 'Hidden Falls Adventure Park', county: 'Burnet', city: 'Burnet', state: 'Texas', countrycode: 'US' }, [-98.1582254, 30.6079139]),
    feature({ osm_type: 'N', osm_id: 2, osm_key: 'tourism', osm_value: 'picnic_site', name: 'Hidden Falls Water Falls and Picnic Area', city: 'Burnet', state: 'Texas', countrycode: 'US' }, [-98.1362535, 30.614421]),
  ],
};
const HELLS_REVENGE = {
  features: [
    feature({ osm_type: 'W', osm_id: 10, osm_key: 'highway', osm_value: 'track', name: "Hell's Revenge 4x4 Trail", city: 'Moab', state: 'Utah' }, [-109.5399392, 38.5804258]),
    feature({ osm_type: 'W', osm_id: 11, osm_key: 'highway', osm_value: 'track', name: "Hell's Revenge 4x4 Trail", state: 'Utah' }, [-109.5336982, 38.6043433]),
    feature({ osm_type: 'N', osm_id: 12, osm_key: 'highway', osm_value: 'trailhead', name: "Hell's Revenge Trailhead", city: 'Moab', state: 'Utah' }, [-109.5225277, 38.5756225]),
    feature({ osm_type: 'N', osm_id: 13, osm_key: 'highway', osm_value: 'trailhead' }, [-109.52, 38.57]),
  ],
};

describe('place search', () => {
  it('finds Hidden Falls Adventure Park as a park in Burnet, Texas', () => {
    const [park] = parsePlaces(HIDDEN_FALLS);
    expect(park).toMatchObject({ name: 'Hidden Falls Adventure Park', kind: 'Park', where: 'Burnet, Texas', state: 'TX', lat: 30.6079139, lng: -98.1582254 });
    expect(placeDetail(park)).toBe('Park in Burnet, Texas');
    expect(placeLabel(park)).toBe('Hidden Falls Adventure Park, Burnet, TX');
  });

  it('lists a trail drawn in pieces once, keeps its trailhead, and drops nameless points', () => {
    const found = parsePlaces(HELLS_REVENGE);
    expect(found.map((p) => [p.name, p.kind])).toEqual([
      ["Hell's Revenge 4x4 Trail", 'Trail'],
      ["Hell's Revenge Trailhead", 'Trailhead'],
    ]);
  });

  it('names OpenStreetMap tags in rider words', () => {
    expect(kindOf('highway', 'trailhead')).toBe('Trailhead');
    expect(kindOf('amenity', 'parking')).toBe('Parking');
    expect(kindOf('highway', 'residential')).toBe('Road');
    expect(kindOf('shop', 'outdoor')).toBe('Outdoor');
    expect(kindOf(undefined, undefined)).toBe('Place');
  });

  it('reads typed coordinates and ignores words', () => {
    expect(parseCoords('38.5733, -109.5498')).toEqual({ lat: 38.5733, lng: -109.5498 });
    expect(parseCoords('38.5733 -109.5498')).toEqual({ lat: 38.5733, lng: -109.5498 });
    expect(parseCoords('Hidden Falls')).toBeNull();
    expect(parseCoords('95, 10')).toBeNull();
  });

  it('asks for US places only and sends a rounded centre, never the exact spot', () => {
    const url = placeSearchUrl("Hell's Revenge", { lat: 38.57331, lng: -109.54982 });
    expect(url).toContain('q=Hell\'s%20Revenge');
    expect(url).toContain('countrycode=US');
    expect(url).toContain('lat=38.6');
    expect(url).toContain('lon=-109.5');
    expect(url).not.toContain('38.573');
    expect(placeSearchUrl('Moab')).not.toContain('lat=');
  });

  it('copes with an empty or broken answer', () => {
    expect(parsePlaces({})).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({ features: [{ properties: { name: 'No geometry' } }] })).toEqual([]);
  });
});

// Trimmed from real Photon answers for "501 Congress Ave Austin TX" and "4800 W Gate Blvd Austin" on 2026-10-12.
const CONGRESS = {
  features: [
    feature({ osm_type: 'N', osm_id: 20, osm_key: 'shop', osm_value: 'shoes', name: 'Allen Edmonds', housenumber: '501', street: 'Congress Avenue', city: 'Austin', state: 'Texas', postcode: '78701' }, [-97.7428, 30.2672]),
    feature({ osm_type: 'W', osm_id: 21, osm_key: 'building', osm_value: 'yes', housenumber: '501', street: 'Congress Avenue', city: 'Austin', state: 'Texas', postcode: '78701' }, [-97.7429, 30.2673]),
  ],
};

describe('street addresses', () => {
  it('lists a bare house number and street as a street address', () => {
    const [, addr] = parsePlaces(CONGRESS);
    expect(addr).toMatchObject({ name: '501 Congress Avenue', kind: 'Address', where: 'Austin, Texas', state: 'TX', address: null });
    expect(placeDetail(addr)).toBe('Street Address in Austin, Texas');
    expect(placeLabel(addr)).toBe('501 Congress Avenue, Austin, TX');
  });

  it('keeps the street address of a named place', () => {
    const [shop] = parsePlaces(CONGRESS);
    expect(shop).toMatchObject({ name: 'Allen Edmonds', kind: 'Shoes', address: '501 Congress Avenue' });
    expect(placeDetail(shop)).toBe('Shoes at 501 Congress Avenue, Austin');
    expect(placeLabel(shop)).toBe('Allen Edmonds, 501 Congress Avenue, Austin, TX');
  });

  it('sends an address search as typed', () => {
    expect(placeSearchUrl('4800 W Gate Blvd, Austin')).toContain('q=4800%20W%20Gate%20Blvd%2C%20Austin');
  });

  it('keeps the extent of an area so a map can frame all of it', () => {
    const [forest, bad] = parsePlaces({
      features: [
        feature({ osm_type: 'R', osm_id: 20, osm_key: 'boundary', osm_value: 'protected_area', name: 'Uwharrie National Forest', state: 'North Carolina', extent: [-80.1, 35.5, -79.8, 35.2] }, [-79.95, 35.35]),
        feature({ osm_type: 'N', osm_id: 21, osm_key: 'highway', osm_value: 'trailhead', name: 'Flat Spot', extent: [-80, 35, -80, 35] }, [-80, 35]),
      ],
    });
    expect(forest.bounds).toEqual({ north: 35.5, south: 35.2, east: -79.8, west: -80.1 });
    expect(bad.bounds).toBeNull();
  });
});
