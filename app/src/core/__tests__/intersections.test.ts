import { describe, expect, it } from 'vitest';

import type { LatLng } from '../geo';
import {
  isJunctionLine, JUNCTION_CLEAR_M, JUNCTION_HOLD_MAX_MS, JUNCTION_STAY_ZOOMED_M, JUNCTION_STAY_ZOOMED_MI, junctionPassed, JUNCTION_ZOOM_START, junctionLines, junctionTriggerM, junctionZoomStep, nextJunction, type JunctionZoom,
} from '../intersections';

const O: LatLng = { lat: 39.5, lng: -105.8 };
/** A spot `east` and `north` meters from O. */
const at = (east: number, north: number): LatLng => ({
  lat: O.lat + north / 110_540,
  lng: O.lng + east / (111_320 * Math.cos((O.lat * Math.PI) / 180)),
});

describe('finding the next junction ahead', () => {
  // A north-south road the rider is on, and an east-west road crossing it 100 m north.
  const road = [at(0, -300), at(0, 300)];
  const cross = [at(-200, 100), at(200, 100)];

  it('finds a crossing ahead of the rider', () => {
    const j = nextJunction(O, 0, [road, cross]);
    expect(j).not.toBeNull();
    expect(j!.distM).toBeGreaterThan(95);
    expect(j!.distM).toBeLessThan(105);
  });

  it('ignores a junction behind the rider or off to the side', () => {
    expect(nextJunction(O, 180, [road, cross])).toBeNull();
    expect(nextJunction(O, 90, [road, cross])).toBeNull();
  });

  it('finds a T junction where a side road ends on the road', () => {
    const side = [at(0, 80), at(150, 160)];
    const j = nextJunction(O, 0, [road, side]);
    expect(j!.distM).toBeGreaterThan(75);
    expect(j!.distM).toBeLessThan(85);
  });

  it('does not count one road drawn in two pieces as a junction', () => {
    const a = [at(0, -300), at(0, 120)];
    const b = [at(0, 120), at(2, 400)];
    expect(nextJunction(O, 0, [a, b])).toBeNull();
  });

  it('looks only so far ahead, and needs a heading', () => {
    const far = [at(-200, 500), at(200, 500)];
    expect(nextJunction(O, 0, [[at(0, -300), at(0, 900)], far])).toBeNull();
    expect(nextJunction(O, null, [road, cross])).toBeNull();
  });

  it('reads road, track and trail lines from the drawn map, and skips rivers and boundaries', () => {
    expect(isJunctionLine({ class: 'track' })).toBe(true);
    expect(isJunctionLine({ class: 'secondary' })).toBe(true);
    expect(isJunctionLine({ class: 'river' })).toBe(false);
    expect(isJunctionLine({ admin_level: 2 })).toBe(false);
    expect(isJunctionLine({ path: false, closed: false })).toBe(true);
    const lines = junctionLines([
      { geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: { class: 'path' } },
      { geometry: { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] }, properties: { class: 'street' } },
      { geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: { class: 'stream' } },
      { geometry: { type: 'Polygon', coordinates: [] }, properties: { class: 'street' } },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0][0]).toEqual({ lng: 1, lat: 2 });
  });
});

describe('zooming in at a junction and back out', () => {
  const junction = { at: at(0, 100), distM: 100 };

  it('zooms in when a junction is close enough at riding speed, remembering the zoom to go back to', () => {
    const r = junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 13, junction });
    expect(r.zoom).toBe(17);
    expect(r.next).toMatchObject({ state: 'in', restoreZoom: 14 });
  });

  it('waits until the junction is within about 9 seconds', () => {
    expect(junctionTriggerM(5)).toBe(70);
    expect(junctionTriggerM(15)).toBe(135);
    expect(junctionTriggerM(40)).toBe(200);
    const r = junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 5, junction });
    expect(r.zoom).toBeNull();
  });

  it('does nothing when the switch is off, the rider is stopped, or the map is already close', () => {
    expect(junctionZoomStep(JUNCTION_ZOOM_START, { on: false, nowMs: 0, zoom: 14, at: O, speedMps: 13, junction }).zoom).toBeNull();
    expect(junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 0.5, junction }).zoom).toBeNull();
    expect(junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 17.8, at: O, speedMps: 13, junction }).zoom).toBeNull();
  });

  it('holds the close-up through the junction and zooms back once clear of it', () => {
    let s: JunctionZoom = junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 13, junction }).next;
    // Coming up on it and through the middle: hold.
    for (const north of [50, 90, 100, 110]) {
      const r = junctionZoomStep(s, { on: true, nowMs: 1000, zoom: 17, at: at(0, north), speedMps: 13, junction: null });
      expect(r.zoom).toBeNull();
      s = r.next;
    }
    // Clear of it: back to the zoom from before.
    const r = junctionZoomStep(s, { on: true, nowMs: 2000, zoom: 17, at: at(0, 150), speedMps: 13, junction: null });
    expect(r.zoom).toBe(14);
    expect(r.next).toEqual(JUNCTION_ZOOM_START);
  });

  it('goes back if the rider stops there too long, or turns the switch off', () => {
    const s = junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 13, junction }).next;
    expect(junctionZoomStep(s, { on: true, nowMs: JUNCTION_HOLD_MAX_MS, zoom: 17, at: at(0, 98), speedMps: 0, junction: null }).zoom).toBe(14);
    expect(junctionZoomStep(s, { on: false, nowMs: 10, zoom: 17, at: at(0, 20), speedMps: 13, junction: null }).zoom).toBe(14);
  });

  describe('look-ahead: staying zoomed in when another junction is close', () => {
    const inAt = () => junctionZoomStep(JUNCTION_ZOOM_START, { on: true, nowMs: 0, zoom: 14, at: O, speedMps: 13, junction }).next;

    it('looks a quarter mile ahead, a tunable constant', () => {
      expect(JUNCTION_STAY_ZOOMED_MI).toBe(0.25);
      expect(JUNCTION_STAY_ZOOMED_M).toBeCloseTo(402.3, 1);
    });

    it('knows when the rider is through the junction', () => {
      let s = inAt();
      expect(junctionPassed(JUNCTION_ZOOM_START, at(0, 150))).toBe(false);
      s = junctionZoomStep(s, { on: true, nowMs: 500, zoom: 17, at: at(0, 100), speedMps: 13, junction: null }).next;
      expect(junctionPassed(s, at(0, 110))).toBe(false);
      expect(junctionPassed(s, at(0, 100 + JUNCTION_CLEAR_M + 1))).toBe(true);
    });

    it('stays zoomed in through a run of close junctions, then zooms out once after the last', () => {
      let s = inAt();
      const zooms: (number | null)[] = [];
      const ride = (north: number, next: { at: ReturnType<typeof at>; distM: number } | null, nowMs: number) => {
        const r = junctionZoomStep(s, { on: true, nowMs, zoom: 17, at: at(0, north), speedMps: 13, junction: next });
        zooms.push(r.zoom);
        s = r.next;
      };
      ride(100, null, 1000);
      // Through the first; the next is 200 m on: stay in and watch that one.
      ride(140, { at: at(0, 340), distM: 200 }, 2000);
      expect(s).toMatchObject({ state: 'in', restoreZoom: 14, at: at(0, 340) });
      ride(340, null, 3000);
      // Through the second; the next is a mile away: zoom back out to where it was.
      ride(380, { at: at(0, 1990), distM: 1610 }, 4000);
      expect(zooms).toEqual([null, null, null, 14]);
      expect(s).toEqual(JUNCTION_ZOOM_START);
    });

    it('does not treat the junction just passed as the next one', () => {
      let s = inAt();
      s = junctionZoomStep(s, { on: true, nowMs: 500, zoom: 17, at: at(0, 100), speedMps: 13, junction: null }).next;
      const r = junctionZoomStep(s, { on: true, nowMs: 1000, zoom: 17, at: at(0, 150), speedMps: 13, junction: { at: at(0, 110), distM: 40 } });
      expect(r.zoom).toBe(14);
    });

    it('gives the next junction its own time limit, and still zooms out if the switch goes off', () => {
      let s = inAt();
      s = junctionZoomStep(s, { on: true, nowMs: 40_000, zoom: 17, at: at(0, 100), speedMps: 13, junction: null }).next;
      s = junctionZoomStep(s, { on: true, nowMs: 50_000, zoom: 17, at: at(0, 150), speedMps: 13, junction: { at: at(0, 300), distM: 150 } }).next;
      expect(junctionZoomStep(s, { on: true, nowMs: 70_000, zoom: 17, at: at(0, 200), speedMps: 13, junction: null }).zoom).toBeNull();
      expect(junctionZoomStep(s, { on: false, nowMs: 70_000, zoom: 17, at: at(0, 200), speedMps: 13, junction: null }).zoom).toBe(14);
    });
  });
});
