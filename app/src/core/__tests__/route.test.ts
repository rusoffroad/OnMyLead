import { describe, expect, it } from 'vitest';
import { milesToMeters } from '../geo';
import {
  cumulativeM, fromStored, locateOnRoute, OFF_ROUTE_M, parseGpx, placeRiders, routeFromGpx, routeFromWaypoints, RouteTracker, simplifyLine,
  summarizeMe, toStored,
} from '../route';

// A straight line due north from Moab, about 1 mile per 0.01449 degrees of latitude.
const start = { lat: 38.5733, lng: -109.5498 };
const north = (mi: number, eastMi = 0) => ({
  lat: start.lat + mi / 69.05,
  lng: start.lng + eastMi / (69.05 * Math.cos((start.lat * Math.PI) / 180)),
});

describe('drawn routes', () => {
  it('measures the line between taps', () => {
    const r = routeFromWaypoints([north(0), north(5), north(10)]);
    expect(r.lengthM / milesToMeters(1)).toBeCloseTo(10, 1);
    expect(r.source).toBe('drawn');
    expect(r.waypoints).toHaveLength(3);
  });

  it('round-trips through the stored form', () => {
    const r = routeFromWaypoints([north(0), north(2), north(2, 1)], 'Fins and Things');
    const s = toStored(r);
    expect(s.route_geojson.geometry.type).toBe('LineString');
    const back = fromStored(JSON.parse(JSON.stringify(s.route_geojson)), s.waypoints)!;
    expect(back.points).toHaveLength(3);
    expect(back.name).toBe('Fins and Things');
    expect(back.lengthM).toBeCloseTo(r.lengthM, 0);
  });

  it('rejects junk from storage', () => {
    expect(fromStored(null, [])).toBeNull();
    expect(fromStored({ geometry: { type: 'Point', coordinates: [1, 2] } }, [])).toBeNull();
    expect(fromStored({ geometry: { type: 'LineString', coordinates: [[1, 2]] } }, [])).toBeNull();
    expect(fromStored({ geometry: { type: 'LineString', coordinates: [[500, 2], [1, 2], 'x', [1, 3]] } }, 'nope')!.points).toHaveLength(2);
  });
});

describe('GPX import', () => {
  const gpx = (body: string) => `<?xml version="1.0"?><gpx version="1.1" creator="test">${body}</gpx>`;

  it('reads a track with its name', () => {
    const r = routeFromGpx(gpx(`<trk><name>Hell&apos;s Revenge</name><trkseg>
      <trkpt lat="38.60" lon="-109.53"><ele>1300</ele></trkpt>
      <trkpt lon='-109.52' lat='38.61'/>
      <trkpt lat="38.60" lon="-109.50"></trkpt></trkseg></trk>`));
    expect(r.name).toBe("Hell's Revenge");
    expect(r.points).toHaveLength(3);
    expect(r.points[1]).toEqual({ lat: 38.61, lng: -109.52 });
    expect(r.source).toBe('gpx');
  });

  it('falls back to a route, then to waypoints', () => {
    expect(parseGpx(gpx('<rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte>')).points).toHaveLength(2);
    expect(parseGpx(gpx('<wpt lat="1" lon="2"/><wpt lat="1.1" lon="2"/><wpt lat="1.2" lon="2"/>')).points).toHaveLength(3);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => parseGpx('{"type":"FeatureCollection"}')).toThrow(/not a GPX/);
    expect(() => parseGpx(gpx('<trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk>'))).toThrow(/no track/);
  });

  it('thins long tracks without bending them', () => {
    const pts = Array.from({ length: 20_000 }, (_, i) => north(i / 1000, Math.sin(i / 300) * 0.2));
    const thin = simplifyLine(pts);
    expect(thin.length).toBeLessThanOrEqual(2500);
    expect(thin[0]).toEqual(pts[0]);
    expect(thin[thin.length - 1]).toEqual(pts[pts.length - 1]);
    const straight = Array.from({ length: 500 }, (_, i) => north(i / 100));
    expect(simplifyLine(straight)).toHaveLength(2);
  });
});

describe('placing riders on the route', () => {
  const route = routeFromWaypoints([north(0), north(10)]);
  const cum = cumulativeM(route.points);

  it('measures progress and distance off the line', () => {
    const p = locateOnRoute(route.points, cum, north(4, 0.02), null)!;
    expect(p.alongM / milesToMeters(1)).toBeCloseTo(4, 1);
    expect(p.offRouteM).toBeGreaterThan(25);
    expect(p.onRoute).toBe(true);
    const far = locateOnRoute(route.points, cum, north(4, 1), null)!;
    expect(far.offRouteM).toBeGreaterThan(OFF_ROUTE_M);
    expect(far.onRoute).toBe(false);
  });

  it('keeps a rider on the way out from jumping to the way back on an out-and-back', () => {
    const outBack = routeFromWaypoints([north(0), north(5), north(5, 0.01), north(0, 0.01)]);
    const c = cumulativeM(outBack.points);
    const at = north(2, 0.005); // exactly between the two legs
    const goingOut = locateOnRoute(outBack.points, c, at, milesToMeters(1.8))!;
    const comingBack = locateOnRoute(outBack.points, c, at, milesToMeters(8.1))!;
    expect(goingOut.alongM / milesToMeters(1)).toBeCloseTo(2, 0);
    expect(comingBack.alongM / milesToMeters(1)).toBeCloseTo(8, 0);
  });

  it('tells a rider where the leader is', () => {
    const placed = placeRiders(route, [
      { id: 'L', role: 'leader', at: north(6) },
      { id: 'me', role: 'rider', at: north(5) },
      { id: 'S', role: 'sweep', at: north(3) },
      { id: 'quiet', role: 'rider', at: null },
    ]);
    const s = summarizeMe(route, placed, 'me')!;
    expect(s.doneMi).toBe('5.0');
    expect(s.totalMi).toBe('10.0');
    expect(s.toGo).toBe('5.0 mi to go');
    expect(s.compared).toBe('The leader is 1.0 mi ahead.');
    expect(s.offRoute).toBeNull();
  });

  it('tells the leader how far back the sweep is', () => {
    const placed = placeRiders(route, [
      { id: 'L', role: 'leader', at: north(6) },
      { id: 'b', role: 'rider', at: north(5) },
      { id: 'S', role: 'sweep', at: north(3.5) },
    ]);
    expect(summarizeMe(route, placed, 'L')!.compared).toBe("You're out front. Sweep is 2.5 mi back.");
  });

  it('flags the last rider and anyone off route', () => {
    const placed = placeRiders(route, [
      { id: 'L', role: 'leader', at: north(6) },
      { id: 'me', role: 'rider', at: north(2, 0.5) },
    ]);
    const s = summarizeMe(route, placed, 'me')!;
    expect(s.compared).toBe('The leader is 4.0 mi ahead. Nobody is behind you.');
    expect(s.offRoute).toBe("You're 0.5 mi off the route.");
  });

  it('says nothing when the rider has no position', () => {
    expect(summarizeMe(route, placeRiders(route, [{ id: 'me', role: 'rider', at: null }]), 'me')).toBeNull();
    const alone = summarizeMe(route, placeRiders(route, [{ id: 'me', role: 'rider', at: north(1) }]), 'me')!;
    expect(alone.compared).toMatch(/Nobody else/);
  });
});

describe('RouteTracker', () => {
  it('remembers progress so a rider stays on their leg of an out-and-back', () => {
    const outBack = routeFromWaypoints([north(0), north(5), north(5, 0.01), north(0, 0.01)]);
    const t = new RouteTracker();
    t.place(outBack, [{ id: 'a', role: 'rider', at: north(1.8, 0.004) }]);
    const [a] = t.place(outBack, [{ id: 'a', role: 'rider', at: north(2, 0.005) }]);
    expect(a.place!.alongM / milesToMeters(1)).toBeCloseTo(2, 0);
  });
});
