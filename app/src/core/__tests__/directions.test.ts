import { describe, expect, it } from 'vitest';

import { appleMapsUrl, googleMapsUrl, MAX_VIA, mapsAppsFor, pickedApp, rideDirections, routeDirections } from '../directions';
import { cumulativeM } from '../route';

const MEET = { lat: 38.5733, lng: -109.5498 };

describe('directions links', () => {
  it('opens Apple Maps driving directions to a spot', () => {
    expect(appleMapsUrl({ title: 'Meeting Point', to: MEET })).toBe('https://maps.apple.com/directions?destination=38.573300%2C-109.549800&mode=driving');
  });

  it('opens Google Maps driving directions to a spot', () => {
    expect(googleMapsUrl({ title: 'Meeting Point', to: MEET })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=38.573300%2C-109.549800&travelmode=driving',
    );
  });

  it('looks up a typed address or place name', () => {
    const t = { title: 'Destination', to: " Hell's Revenge, Moab, UT " };
    expect(appleMapsUrl(t)).toContain("destination=Hell's%20Revenge%2C%20Moab%2C%20UT&");
    expect(googleMapsUrl(t)).toContain("destination=Hell's%20Revenge%2C%20Moab%2C%20UT&");
  });

  it('passes stops on the way in order', () => {
    const t = { title: 'Route', to: MEET, via: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] };
    expect(appleMapsUrl(t)).toContain('waypoint=1.000000%2C2.000000&waypoint=3.000000%2C4.000000&mode=driving');
    expect(googleMapsUrl(t)).toContain('waypoints=1.000000%2C2.000000%7C3.000000%2C4.000000');
  });
});

describe('which maps app', () => {
  it('only offers Google Maps on Android', () => {
    expect(mapsAppsFor('android')).toEqual(['google']);
    expect(pickedApp('ask', 'android')).toBe('google');
    expect(pickedApp('apple', 'android')).toBe('google');
  });

  it('asks on an iPhone unless the rider picked an app', () => {
    expect(mapsAppsFor('ios')).toEqual(['apple', 'google']);
    expect(pickedApp('ask', 'ios')).toBeNull();
    expect(pickedApp('google', 'ios')).toBe('google');
  });
});

describe('directions along a route', () => {
  // A straight line north, one point every ~111 m.
  const line = Array.from({ length: 101 }, (_, i) => ({ lat: 38 + i * 0.001, lng: -109 }));

  it('uses a short drawn route point for point', () => {
    const pts = line.slice(0, 4);
    const t = routeDirections({ points: pts }, 'Route')!;
    expect(t.via).toEqual(pts.slice(0, 3));
    expect(t.to).toEqual(pts[3]);
  });

  it('samples a long line into at most the stops Google Maps takes, ending at the finish', () => {
    const t = routeDirections({ points: line }, 'Route')!;
    expect(t.via!.length).toBeLessThanOrEqual(MAX_VIA);
    expect(t.via![0]).toEqual(line[0]);
    expect(t.to).toEqual(line[100]);
  });

  it('leaves out the stops behind a rider partway along', () => {
    const cum = cumulativeM(line);
    const t = routeDirections({ points: line }, 'Route', cum[60])!;
    expect(t.via!.every((p) => p.lat > line[60].lat)).toBe(true);
    expect(t.to).toEqual(line[100]);
  });

  it('has nothing to follow without a line', () => {
    expect(routeDirections({ points: [MEET] }, 'Route')).toBeNull();
  });
});

describe('a ride’s directions', () => {
  const line = Array.from({ length: 50 }, (_, i) => ({ lat: 38 + i * 0.001, lng: -109 }));

  it('lists the meeting point, the route and the destination in riding order', () => {
    const rows = rideDirections({ meet: { ...MEET, label: 'Gas station, Moab, UT' }, route: { points: line }, destination: "Hell's Revenge, Moab, UT" });
    expect(rows.map((r) => r.title)).toEqual(['Meeting Point', 'Along the Route', 'Destination']);
    expect(rows[0].detail).toBe('Gas station, Moab, UT');
    expect(rows[2].target.to).toBe("Hell's Revenge, Moab, UT");
  });

  it('picks the route up from where the rider is, and puts a regroup point first', () => {
    const rows = rideDirections({ route: { points: line }, alongM: 2000, regroup: MEET });
    expect(rows.map((r) => r.title)).toEqual(['Regroup Point', 'Continue Along the Route']);
  });

  it('offers nothing to someone not on the ride with no destination', () => {
    expect(rideDirections({ meet: null, destination: '  ' })).toEqual([]);
  });
});
