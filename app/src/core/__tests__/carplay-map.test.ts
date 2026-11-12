import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CAR_DEFAULT_PACE_MPS, CAR_LINE_MAX_POINTS, carMapDots, carMapGuide, carMapLine, carPlayLabels, carPlayMapState, carPlayState, carTimeLeftS,
} from '../carplay';
import type { LatLng } from '../geo';
import { TRANSLATIONS } from '../translations';

// The car map (CarPlay Navigation): what the phone sends for CarMapScreen.swift to draw.

const app = resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const { carPlaySwitches } = require(join(app, 'plugins/with-carplay.js')) as {
  carPlaySwitches: (o?: { enabled?: boolean; maps?: boolean }, env?: Record<string, string | undefined>) => { on: boolean; mapsOn: boolean };
};

/** A wiggly line `n` points long, about 11 m between points. */
function wiggle(n: number): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat: 38.5 + i * 0.0001, lng: -109.5 + (i % 2 ? 0.00005 : 0) }));
}

describe('car map lines', () => {
  it('thins a long route to what a car screen needs, in [lng, lat] order', () => {
    const l = carMapLine('route', wiggle(2500), '#E5262E', 5)!;
    expect(l.coords.length).toBeLessThanOrEqual(CAR_LINE_MAX_POINTS);
    expect(l.coords[0]).toEqual([-109.5, 38.5]);
    expect(l.coords.at(-1)![1]).toBeCloseTo(38.5 + 2499 * 0.0001, 6);
    expect(l).toMatchObject({ id: 'route', color: '#E5262E', width: 5 });
  });

  it('draws nothing for a line under two points', () => {
    expect(carMapLine('x', [], '#fff', 3)).toBeNull();
    expect(carMapLine('x', [{ lat: 1, lng: 2 }], '#fff', 3)).toBeNull();
    expect(carMapLine('x', null, '#fff', 3)).toBeNull();
  });
});

describe('car map riders', () => {
  const r = (id: string, lat: number | null, live = true) => ({ id, name: `Rider ${id}`, lat, lng: lat == null ? null : -109, live, color: '#4A5A72', ring: null });

  it('leaves out you (the car puck) and riders with no spot', () => {
    const dots = carMapDots([r('me', 38), r('a', 38.1), r('b', null)], 'me');
    expect(dots.map((d) => d.id)).toEqual(['a']);
  });

  it('keeps last-seen riders, marked as not live, so a stale spot never reads as now', () => {
    const [d] = carMapDots([r('a', 38.1, false)], 'me');
    expect(d.live).toBe(false);
  });

  it('keeps names short enough for a car screen', () => {
    const [d] = carMapDots([{ ...r('a', 38), name: 'A Very Long Rider Name That Goes On' }], null);
    expect(d.name.length).toBeLessThanOrEqual(24);
  });
});

describe('car map guidance', () => {
  const line = wiggle(50);
  const base = { name: 'Rim Loop', points: line, onTrail: true, remainingM: 3000, toStartM: 0, tripM: 0, movingS: 0 };

  it('says Follow with the distance left while on the trail', () => {
    const g = carMapGuide(base)!;
    expect(g.instruction).toBe('Follow Rim Loop');
    expect(g.remainingM).toBe(3000);
    expect(g.endLat).toBe(line.at(-1)!.lat);
  });

  it('says Head to the Start, with the distance to it, while off the trail', () => {
    const g = carMapGuide({ ...base, onTrail: false, toStartM: 800 })!;
    expect(g.instruction).toBe('Head to the Start of Rim Loop');
    expect(g.remainingM).toBe(800);
    expect(g.endLat).toBe(line[0].lat);
    expect(g.id).not.toBe(carMapGuide(base)!.id);
  });

  it('names the ride route when there is no trail name', () => {
    expect(carMapGuide({ ...base, name: null })!.instruction).toBe('Follow the Ride Route');
    expect(carMapGuide({ ...base, name: null, onTrail: false })!.instruction).toBe('Head to the Start of the Route');
  });

  it('has no guidance without a line', () => {
    expect(carMapGuide({ ...base, points: [] })).toBeNull();
  });

  it('estimates time left from the moving average, or a slow trail pace before there is one', () => {
    expect(carTimeLeftS(4500, 0, 0)).toBe(Math.round(4500 / CAR_DEFAULT_PACE_MPS));
    // 10 km in 1000 s moving: 10 m/s.
    expect(carTimeLeftS(5000, 10000, 1000)).toBe(500);
  });
});

describe('car map messages', () => {
  it('rides along with the ride and Map Mode states, null when there is none', () => {
    const ride = { rideName: 'Moab', separated: [], watchesBubble: false, canRegroup: false, riders: [], helpCalls: [] };
    expect(carPlayState(ride).map).toBeNull();
    const map = { style: 's', token: 'pk.x', dots: [], lines: [], guide: null };
    expect(carPlayState({ ...ride, map }).map).toBe(map);
    const dash = { speedMps: null, altitudeM: null, headingDeg: null, tripM: 0, movingS: 0, followed: null, recording: null };
    expect(carPlayMapState({ ...dash, map }).map).toBe(map);
  });

  it('tells the car map when CarPlay needs Pro', () => {
    expect(carPlayLabels(true).proNeeded).toBe(true);
    expect(carPlayLabels().proNeeded).toBe(false);
  });

  it('has every car map word in every language', () => {
    const line = wiggle(5);
    const words = [
      carPlayLabels().ride, carPlayLabels().dash,
      ...[true, false].flatMap((onTrail) => [null, 'x'].map((name) => carMapGuide({ name, points: line, onTrail, remainingM: 1, toStartM: 1, tripM: 0, movingS: 0 })!.instruction)),
    ].map((w) => (w === 'Follow x' ? 'Follow {name}' : w === 'Head to the Start of x' ? 'Head to the Start of {name}' : w));
    for (const [lang, dict] of Object.entries(TRANSLATIONS)) {
      for (const w of words) expect(dict?.[w], `${lang}: ${w}`).toBeTruthy();
    }
  });
});

describe('car map switch (plugins/with-carplay.js)', () => {
  it('is off until Apple grants CarPlay Navigation', () => {
    const plugin = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8')).expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === './plugins/with-carplay');
    expect(carPlaySwitches(plugin[1], {})).toEqual({ on: true, mapsOn: false });
  });

  it('turns on with maps or ONMYLEAD_CARPLAY_MAPS=1, never without CarPlay itself', () => {
    expect(carPlaySwitches({ enabled: true, maps: true }, {}).mapsOn).toBe(true);
    expect(carPlaySwitches({ enabled: true }, { ONMYLEAD_CARPLAY_MAPS: '1' }).mapsOn).toBe(true);
    expect(carPlaySwitches({ enabled: true, maps: true }, { ONMYLEAD_CARPLAY_MAPS: '0' }).mapsOn).toBe(false);
    expect(carPlaySwitches({ enabled: true, maps: true }, { ONMYLEAD_CARPLAY: '0' })).toEqual({ on: false, mapsOn: false });
  });

  it('keeps the map code out of builds without it', () => {
    const swift = readFileSync(join(app, 'modules/onmylead-carplay/ios/CarMapScreen.swift'), 'utf8');
    const podspec = readFileSync(join(app, 'modules/onmylead-carplay/ios/OnMyLeadCarPlay.podspec'), 'utf8');
    expect(swift).toMatch(/#if OML_CARPLAY_MAPS && canImport\(MapboxMaps\)/);
    expect(podspec).toMatch(/s\.dependency 'MapboxMaps' if car_map/);
    expect(podspec).toContain('.oml-carplay-maps');
  });
});
