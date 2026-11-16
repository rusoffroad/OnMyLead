import { describe, expect, it } from 'vitest';
import { carRiderBar } from '../carplay';
import { APART_M, CATCH_UP_MS, CATCH_UP_STALE_MS, LineSmoother, SNAP_M, spotNow, TOGETHER_M } from '../convoy-sync';
import { FreerideTracker, extendTrail, summarizeFreeride, withPlaced, type LeaderTrail } from '../freeride';
import { distanceM, type LatLng } from '../geo';
import { makeRoute, RouteTracker, summarizeMe, type PlacedRider, type RouteRider } from '../route';
import { rankRiders, spreadRuler, convoyLayout } from '../route-order';

const start: LatLng = { lat: 38.5, lng: -109.5 };
/** A spot `m` meters north of the start. */
const north = (m: number): LatLng => ({ lat: start.lat + m / 111_195, lng: start.lng });
const route = makeRoute({ points: Array.from({ length: 201 }, (_, i) => north(i * 25)), source: 'drawn' });

const placedAt = (id: string, alongM: number, role: PlacedRider['role'] = 'rider'): PlacedRider => ({
  id, role, at: null, place: { alongM, offRouteM: 0, onRoute: true },
});
const along = (rs: PlacedRider[], id: string) => rs.find((r) => r.id === id)!.place!.alongM;

describe('spotNow', () => {
  const fix = { ...north(1000), atMs: 100_000, speedMps: 13.4, headingDeg: 0 };

  it('moves a moving rider forward along their heading to the same moment', () => {
    const p = spotNow(fix, 105_000);
    expect(distanceM(north(1000), p)).toBeCloseTo(67, 0);
    expect(p.lat).toBeGreaterThan(fix.lat);
  });

  it('moves at most CATCH_UP_MS worth', () => {
    const p = spotNow(fix, 100_000 + CATCH_UP_MS + 5_000);
    expect(distanceM(north(1000), p)).toBeCloseTo(13.4 * (CATCH_UP_MS / 1000), 0);
  });

  it('leaves stopped, unknown-heading, stale and future fixes where they are', () => {
    const here = { lat: fix.lat, lng: fix.lng };
    expect(spotNow({ ...fix, speedMps: 0.5 }, 105_000)).toEqual(here);
    expect(spotNow({ ...fix, speedMps: null }, 105_000)).toEqual(here);
    expect(spotNow({ ...fix, headingDeg: -1 }, 105_000)).toEqual(here);
    expect(spotNow({ ...fix, headingDeg: null }, 105_000)).toEqual(here);
    expect(spotNow(fix, 100_000 + CATCH_UP_STALE_MS + 1)).toEqual(here);
    expect(spotNow(fix, 99_000)).toEqual(here);
    expect(spotNow({ ...fix, speedMps: 200 }, 105_000)).toEqual(here);
  });
});

describe('the reported jump: a friend riding right beside the leader', () => {
  // Leader and friend side by side at 30 mph. The friend's own phone is fresh every second; the
  // leader's shared spot only lands every 5 seconds, so it ages up to 5 s (about 220 ft) behind.
  const SPEED = 13.4;
  const LEAD_FIX_EVERY_MS = 5_000;
  function frames(fixed: boolean) {
    const tracker = new RouteTracker();
    const smoother = new LineSmoother();
    const gaps: number[] = [];
    for (let t = 1_000; t <= 60_000; t += 1_000) {
      const leadFixAt = Math.floor(t / LEAD_FIX_EVERY_MS) * LEAD_FIX_EVERY_MS;
      const leadFix = { ...north(100 + (SPEED * leadFixAt) / 1000), atMs: leadFixAt, speedMps: SPEED, headingDeg: 0 };
      const meFix = { ...north(100 + (SPEED * t) / 1000), atMs: t, speedMps: SPEED, headingDeg: 0 };
      const riders: RouteRider[] = [
        { id: 'lead', role: 'leader', at: fixed ? spotNow(leadFix, t) : { lat: leadFix.lat, lng: leadFix.lng } },
        { id: 'me', role: 'rider', at: fixed ? spotNow(meFix, t) : { lat: meFix.lat, lng: meFix.lng } },
      ];
      const placed = tracker.place(route, riders);
      const shown = fixed ? smoother.smooth(placed, t) : placed;
      gaps.push(Math.abs(along(shown, 'lead') - along(shown, 'me')));
    }
    return gaps;
  }

  it('used to swing between a few yards and about 200 ft', () => {
    const gaps = frames(false);
    expect(Math.min(...gaps)).toBeLessThan(TOGETHER_M);
    expect(Math.max(...gaps)).toBeGreaterThan(50);
  });

  it('now stays with the leader the whole time, on the phone strip and the car line', () => {
    const gaps = frames(true);
    expect(Math.max(...gaps)).toBeLessThan(TOGETHER_M);
  });
});

describe('LineSmoother', () => {
  it('keeps the leader exactly where they were placed', () => {
    const s = new LineSmoother();
    s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 800)], 0);
    const out = s.smooth([placedAt('lead', 1100, 'leader'), placedAt('a', 700)], 1000);
    expect(along(out, 'lead')).toBe(1100);
  });

  it('eases a rider toward a new spot rather than snapping', () => {
    const s = new LineSmoother();
    s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 800)], 0);
    const out = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 700)], 1000);
    const back = 1000 - along(out, 'a');
    expect(back).toBeGreaterThan(200);
    expect(back).toBeLessThan(300);
    // ...and catches up after a while.
    const later = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 700)], 20_000);
    expect(1000 - along(later, 'a')).toBeCloseTo(300, 0);
  });

  it('shows a real jump at once', () => {
    const s = new LineSmoother();
    s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 900)], 0);
    const out = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 900 - SNAP_M - 50)], 1000);
    expect(along(out, 'a')).toBe(900 - SNAP_M - 50);
  });

  it('keeps a rider with the leader until they are clearly apart', () => {
    const s = new LineSmoother();
    s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 990)], 0);
    // GPS wobble pushes the measured gap past 30 m for a moment: still with the leader.
    let out = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 1000 - (APART_M - 5))], 5_000);
    expect(1000 - along(out, 'a')).toBeLessThan(TOGETHER_M);
    // Really dropping back: apart.
    out = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 1000 - (APART_M + 20))], 10_000);
    expect(1000 - along(out, 'a')).toBeGreaterThanOrEqual(TOGETHER_M);
  });

  it('starts over when the leader changes', () => {
    const s = new LineSmoother();
    s.smooth([placedAt('lead', 1000, 'leader'), placedAt('a', 900)], 0);
    const out = s.smooth([placedAt('lead2', 1000, 'leader'), placedAt('a', 950)], 500);
    expect(along(out, 'a')).toBe(950);
  });

  it('measures from the rider out front when no leader is on the line', () => {
    const s = new LineSmoother();
    const out = s.smooth([placedAt('a', 1000), placedAt('b', 900), { id: 'c', role: 'rider', at: null, place: null }], 0);
    expect(along(out, 'a')).toBe(1000);
    expect(along(out, 'b')).toBe(900);
    expect(out[2].place).toBeNull();
  });

  it('keeps the phone strip and the car line in agreement', () => {
    const s = new LineSmoother();
    const shown = s.smooth([placedAt('lead', 1000, 'leader'), placedAt('me', 990), placedAt('s', 500, 'sweep')], 0);
    const ranked = rankRiders(shown);
    const ruler = spreadRuler(ranked, convoyLayout(ranked, () => 20, 300));
    const car = carRiderBar(shown, 'me', () => ({ color: '#fff', ring: null, live: true }));
    expect(car?.spread).toBe(ruler?.label);
    expect(summarizeMe(route, shown, 'me')?.compared).toBe("You're right with the leader.");
  });
});

describe('withPlaced (Freeride)', () => {
  it('works the spread and distances out again from the smoothed spots', () => {
    let trail: LeaderTrail | null = null;
    for (let m = 0; m <= 1000; m += 20) trail = extendTrail(trail, 'ride', 'lead', north(m), 1000);
    const line = new FreerideTracker().place(trail, 'lead', [
      { id: 'lead', role: 'leader', at: north(1000) },
      { id: 'me', role: 'rider', at: north(990) },
      { id: 'b', role: 'rider', at: north(600) },
    ]);
    const s = new LineSmoother();
    const out = withPlaced(line, s.smooth(line.placed, 0));
    expect(out.behindM.lead).toBe(0);
    expect(out.behindM.me).toBeCloseTo(10, 0);
    expect(out.spanM).toBeCloseTo(400, 0);
    expect(summarizeFreeride(out, 'me').compared).toBe("You're right with the leader.");
  });

  it('leaves a line with no leader alone', () => {
    const line = new FreerideTracker().place(null, null, [{ id: 'a', role: 'rider', at: north(0) }]);
    expect(withPlaced(line, line.placed)).toBe(line);
  });
});
