import { describe, expect, it } from 'vitest';
import {
  boundsAround, guessState, inState, inviteMessage, mailUrl, normalizeState, regionFor, smsUrl, stateByCode, US_STATES, withinRadius,
} from '../discovery';

const moab = { lat: 38.5733, lng: -109.5498 };
const ride = (id: string, lat: number, lng: number, meet_state: string | null = null) => ({
  id, meet_area_lat: lat, meet_area_lng: lng, meet_state,
});

describe('states', () => {
  it('has the 50 states plus DC with sane boxes', () => {
    expect(US_STATES).toHaveLength(51);
    for (const s of US_STATES) {
      expect(s.minLat).toBeLessThan(s.maxLat);
      expect(s.minLng).toBeLessThan(s.maxLng);
    }
  });

  it('normalizes what reverse geocoding returns', () => {
    expect(normalizeState('UT')).toBe('UT');
    expect(normalizeState('Utah')).toBe('UT');
    expect(normalizeState(' new mexico ')).toBe('NM');
    expect(normalizeState('Ontario')).toBeNull();
    expect(normalizeState(null)).toBeNull();
  });

  it('guesses the state of well-known riding spots', () => {
    expect(guessState(moab)).toBe('UT');
    expect(guessState({ lat: 32.98, lng: -115.27 })).toBe('CA'); // Glamis dunes
    expect(guessState({ lat: 37.7, lng: -81.9 })).toBe('WV'); // Hatfield-McCoy trails
    expect(guessState({ lat: 30.27, lng: -97.74 })).toBe('TX');
    expect(guessState({ lat: 51.0, lng: -114.0 })).toBeNull(); // Calgary
  });

  it('frames a state on the map', () => {
    const r = regionFor(stateByCode('co')!);
    expect(r.latitude).toBeCloseTo(39, 0);
    expect(r.longitudeDelta).toBeGreaterThan(7);
  });
});

describe('distance search', () => {
  it('keeps rides inside the radius, nearest first', () => {
    const rides = [
      ride('far', 39.07, -108.55), // Grand Junction, about 75 miles
      ride('near', 38.6, -109.5),
      ride('way-off', 33.4, -112.0), // Phoenix
    ];
    expect(withinRadius(rides, moab, 25).map((r) => r.id)).toEqual(['near']);
    const fifty = withinRadius(rides, moab, 100);
    expect(fifty.map((r) => r.id)).toEqual(['near', 'far']);
    expect(fifty[1].distanceMi).toBeGreaterThan(60);
    expect(fifty[1].distanceMi).toBeLessThan(90);
  });

  it('builds a query box that contains the whole circle', () => {
    const b = boundsAround(moab, 100);
    for (const p of [{ lat: moab.lat + 1.44, lng: moab.lng }, { lat: moab.lat, lng: moab.lng - 1.8 }]) {
      expect(p.lat).toBeLessThanOrEqual(b.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(b.minLng);
    }
  });
});

describe('state search', () => {
  it('uses the saved state and falls back to a guess for older rides', () => {
    const rides = [ride('saved-ut', 38.6, -109.5, 'UT'), ride('saved-co-near-border', 38.9, -109.06, 'CO'), ride('old', 38.6, -109.5)];
    expect(inState(rides, 'UT').map((r) => r.id)).toEqual(['saved-ut', 'old']);
    expect(inState(rides, 'CO').map((r) => r.id)).toEqual(['saved-co-near-border']);
  });
});

describe('sharing a private ride', () => {
  const r = { name: 'Friends only', invite_code: 'PRIV1234', visibility: 'private' };
  it('includes the link and the code', () => {
    const msg = inviteMessage(r, 'https://onmylead.com/r/PRIV1234');
    expect(msg).toContain('private ride "Friends only"');
    expect(msg).toContain('https://onmylead.com/r/PRIV1234');
    expect(msg).toContain('PRIV1234');
    expect(inviteMessage(r, null)).not.toContain('Open:');
  });

  it('builds text and email links', () => {
    expect(smsUrl('hi there', 'ios')).toBe('sms:&body=hi%20there');
    expect(smsUrl('hi', 'android')).toBe('sms:?body=hi');
    expect(mailUrl('Ride', 'a&b')).toBe('mailto:?subject=Ride&body=a%26b');
  });
});
