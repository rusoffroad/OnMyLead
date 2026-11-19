import { describe, expect, it } from 'vitest';

import { GREETING_MIN_HEIGHT, homeHeader } from '../home';
import {
  boundsOfSpots, googleMapsUrl, isOwnSpotPhoto, mapModeHref, parseMapAt, parseSpotPage, phoneDigits, phoneText, ratingText,
  REVIEW_MAX_PHOTOS, reviewProblem, spotPhotoPath, spotShareUrl, starShapes, trailLevels,
} from '../spots';

const UID = '0f5a1000-0000-4000-8000-000000000001';

describe('place phone numbers', () => {
  it('turns a written number into digits a dialer takes', () => {
    expect(phoneDigits('830-798-9820')).toBe('8307989820');
    expect(phoneDigits('(903) 522-1901')).toBe('9035221901');
    expect(phoneDigits('+1 435 259 2444')).toBe('+14352592444');
  });
  it('refuses things that are not phone numbers', () => {
    expect(phoneDigits(null)).toBeNull();
    expect(phoneDigits('call the office')).toBeNull();
    expect(phoneDigits('123')).toBeNull();
    expect(phoneDigits('javascript:alert(1)')).toBeNull();
  });
  it('shows US numbers the usual way and others as written', () => {
    expect(phoneText('830-798-9820')).toBe('(830) 798-9820');
    expect(phoneText('1-830-798-9820')).toBe('(830) 798-9820');
    expect(phoneText('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});

describe('links', () => {
  it('opens the place on Google Maps by name and spot', () => {
    const u = googleMapsUrl({ name: 'Hidden Falls Adventure Park', lat: 30.607912, lng: -98.158221 });
    expect(u.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(decodeURIComponent(u)).toContain('Hidden Falls Adventure Park 30.60791,-98.15822');
  });
  it('shares the website link', () => {
    expect(spotShareUrl('https://onmylead.com/', 'abc')).toBe('https://onmylead.com/spot/abc');
  });
});

describe('Open in Map Mode', () => {
  it('round-trips a place through ?at=', () => {
    const href = mapModeHref({ lat: 30.607912, lng: -98.158221 });
    expect(href).toBe('/nav?at=30.60791,-98.15822');
    expect(parseMapAt(href.split('=')[1])).toEqual({ lat: 30.60791, lng: -98.15822 });
  });
  it('ignores a missing or bad spot', () => {
    expect(parseMapAt(undefined)).toBeNull();
    expect(parseMapAt('')).toBeNull();
    expect(parseMapAt('91,10')).toBeNull();
    expect(parseMapAt('10,181')).toBeNull();
    expect(parseMapAt('abc')).toBeNull();
    expect(parseMapAt(['38.5,-109.5'])).toEqual({ lat: 38.5, lng: -109.5 });
  });
});

describe('Favorite Places map frame', () => {
  it('is null with no favorites', () => expect(boundsOfSpots([])).toBeNull());
  it('frames one favorite at least 15 miles across', () => {
    const b = boundsOfSpots([{ lat: 30.6, lng: -98.15 }])!;
    expect(b.minLat).toBeLessThan(30.6);
    expect(b.maxLat).toBeGreaterThan(30.6);
    expect((b.maxLat - b.minLat) * 69).toBeGreaterThan(14);
  });
  it('holds every favorite with a margin', () => {
    const b = boundsOfSpots([{ lat: 30, lng: -100 }, { lat: 38, lng: -109 }])!;
    expect(b.minLat).toBeLessThan(30);
    expect(b.maxLat).toBeGreaterThan(38);
    expect(b.minLng).toBeLessThan(-109);
    expect(b.maxLng).toBeGreaterThan(-100);
  });
});

describe('reviews', () => {
  it('rounds the rating and draws half stars', () => {
    expect(ratingText(4.666)).toBe('4.7');
    expect(ratingText(5)).toBe('5.0');
    expect(starShapes(4.7)).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(starShapes(3.2)).toEqual(['full', 'full', 'full', 'empty', 'empty']);
    expect(starShapes(9)).toEqual(['full', 'full', 'full', 'full', 'full']);
  });
  it('keeps photos in the rider’s own folder', () => {
    const p = spotPhotoPath(UID, 'f1');
    expect(p.startsWith(`${UID}/`)).toBe(true);
    expect(isOwnSpotPhoto(UID, p)).toBe(true);
    expect(isOwnSpotPhoto(UID, `someone-else/${'x'}.jpg`)).toBe(false);
    expect(isOwnSpotPhoto(UID, `${UID}/../x.jpg`)).toBe(false);
  });
  it('needs stars, and keeps words and photos in bounds', () => {
    expect(reviewProblem({ stars: 0, body: '', photos: [] })).not.toBeNull();
    expect(reviewProblem({ stars: 4, body: '', photos: [] })).toBeNull();
    expect(reviewProblem({ stars: 4, body: 'x'.repeat(1001), photos: [] })).not.toBeNull();
    expect(reviewProblem({ stars: 4, body: '', photos: Array(REVIEW_MAX_PHOTOS + 1).fill('p') })).not.toBeNull();
  });
});

describe('trail levels', () => {
  it('lists only the levels the park has, easiest first', () => {
    const t = { trails: 9, miles: 20, easy: 3, medium: 0, hard: 4, extreme: 2, unrated: 0, closed: 1 };
    expect(trailLevels(t).map((l) => l.label)).toEqual(['Level 1–2', 'Level 4', 'Level 5']);
  });
});

describe('place page from the server', () => {
  const spot = { id: 's1', source: 'osm', name: 'Hidden Falls', kind: 'park', lat: 30.6, lng: -98.15, state: 'TX', area_name: null, description: null, website: null, vehicle_types: [], license: null, attribution: null };
  it('reads details, hours by line, reviews and favorite', () => {
    const p = parseSpotPage({
      spot: { ...spot, address: '7030 E FM 1431', phone: '830-798-9820', hours: 'Mon–Thu 9 AM–5 PM\nFri 9 AM–7 PM\n', fees: null, season: null, details_source: 'The park’s website', details_checked: '2026-11-18' },
      trails: { trails: 3, miles: 4.2, easy: 1, medium: 1, hard: 1, extreme: 0, unrated: 0, closed: 0 },
      reviews: { count: 1, average: 5, photos: [], list: [{ id: 'r', stars: 5, body: 'Great', photos: [], name: 'Dusty', mine: false, at: '2026-11-01' }, { id: 'bad', stars: 9 }], mine: null },
      favorite: true,
    })!;
    expect(p.spot.hours).toEqual(['Mon–Thu 9 AM–5 PM', 'Fri 9 AM–7 PM']);
    expect(p.spot.phone).toBe('830-798-9820');
    expect(p.trails?.trails).toBe(3);
    expect(p.reviews.list.map((r) => r.id)).toEqual(['r']);
    expect(p.favorite).toBe(true);
  });
  it('is null for junk, and copes with an old server', () => {
    expect(parseSpotPage(null)).toBeNull();
    expect(parseSpotPage({ spot: null })).toBeNull();
    const p = parseSpotPage({ spot })!;
    expect(p.spot.hours).toEqual([]);
    expect(p.trails).toBeNull();
    expect(p.reviews.count).toBe(0);
    expect(p.favorite).toBe(false);
  });
});

describe('Home on one screen', () => {
  it('keeps the tablet header as it was', () => {
    expect(homeHeader(820, false)).toEqual({ hero: 300, overlap: 78, greeting: true, tight: false });
  });
  it('keeps the greeting on the big phones and drops it on smaller ones', () => {
    expect(homeHeader(956, true).greeting).toBe(true);
    expect(homeHeader(932, true).greeting).toBe(true);
    expect(homeHeader(874, true)).toMatchObject({ greeting: false, tight: true });
    expect(homeHeader(667, true).greeting).toBe(false);
    expect(homeHeader(GREETING_MIN_HEIGHT, true).greeting).toBe(true);
  });
  it('starts the cards higher on a phone than on a tablet', () => {
    const phone = homeHeader(956, true);
    const tablet = homeHeader(820, false);
    expect(phone.hero - phone.overlap).toBeLessThan(tablet.hero - tablet.overlap);
    const small = homeHeader(852, true);
    expect(small.hero - small.overlap).toBeLessThan(phone.hero - phone.overlap);
  });
});
