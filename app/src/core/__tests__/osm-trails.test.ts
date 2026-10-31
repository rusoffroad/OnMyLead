import Pbf from 'pbf';
import { describe, expect, it } from 'vitest';

import {
  decodeOsmTrails, drawableOsm, nearestOsmTrail, OSM_MAX_TILES, OSM_VIEW_MIN_Z, osmTilesForRegion, osmTileZoom, templateFromTileJson, trailLabels,
} from '../osm-trails';
import { mapZoom, tileFor } from '../trails';

// Hidden Falls Adventure Park, Marble Falls, Texas: named tracks in OpenStreetMap, none in federal data.
const hiddenFalls = { lat: 30.6079, lng: -98.1582 };

type Feat = { cls: string; name?: string; surface?: string; access?: string; line: [number, number][] };

/** A tiny Mapbox Vector Tile, written the way OpenMapTiles lays out its road layers. */
function mvt(layers: Record<string, Feat[]>, extent = 4096): Uint8Array {
  const pbf = new Pbf();
  const zz = (n: number) => (n << 1) ^ (n >> 31);
  for (const [name, feats] of Object.entries(layers)) {
    pbf.writeMessage(3, (_: unknown, p: Pbf) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, name);
      const keys: string[] = [];
      const values: string[] = [];
      const idx = (arr: string[], v: string) => (arr.includes(v) ? arr.indexOf(v) : arr.push(v) - 1);
      const encoded = feats.map((f) => {
        const tags: number[] = [];
        for (const [k, v] of Object.entries({ class: f.cls, name: f.name, surface: f.surface, access: f.access })) {
          if (v) tags.push(idx(keys, k), idx(values, v));
        }
        const geom: number[] = [1 | (1 << 3)];
        let [cx, cy] = [0, 0];
        f.line.forEach(([x, y], i) => {
          if (i === 1) geom.push(2 | ((f.line.length - 1) << 3));
          geom.push(zz(x - cx), zz(y - cy));
          [cx, cy] = [x, y];
        });
        return { tags, geom };
      });
      for (const e of encoded) {
        p.writeMessage(2, (_: unknown, q: Pbf) => {
          q.writePackedVarint(2, e.tags);
          q.writeVarintField(3, 2);
          q.writePackedVarint(4, e.geom);
        }, null);
      }
      for (const k of keys) p.writeStringField(3, k);
      for (const v of values) p.writeMessage(4, (_: unknown, q: Pbf) => q.writeStringField(1, v), null);
      p.writeVarintField(5, extent);
    }, null);
  }
  return pbf.finish();
}

describe('which squares to read', () => {
  it('draws tracks from about 15 miles across, from zoom 13 squares, and never asks past 14', () => {
    expect(osmTileZoom(9)).toBeNull();
    expect(osmTileZoom(10.9)).toBeNull();
    expect(osmTileZoom(NaN)).toBeNull();
    expect(osmTileZoom(OSM_VIEW_MIN_Z)).toBe(13);
    expect(osmTileZoom(12.5)).toBe(13);
    expect(osmTileZoom(13.9)).toBe(13);
    expect(osmTileZoom(14)).toBe(14);
    expect(osmTileZoom(18)).toBe(14);
  });

  it('reads a far-out phone view in one go', () => {
    // A phone (390 by about 700 points) at zoom 11 shows about 6 by 11 zoom 13 squares.
    const lngDelta = (390 / (256 * 2 ** 11)) * 360;
    const region = { latitude: hiddenFalls.lat, longitude: hiddenFalls.lng, latitudeDelta: lngDelta * 1.6, longitudeDelta: lngDelta };
    expect(mapZoom(region, 390)).toBeCloseTo(11, 5);
    const tiles = osmTilesForRegion(region, osmTileZoom(mapZoom(region, 390))!);
    expect(tiles.length).toBeGreaterThan(40);
    expect(tiles.length).toBeLessThanOrEqual(OSM_MAX_TILES);
  });

  it('covers the view, middle first, capped', () => {
    const region = { latitude: hiddenFalls.lat, longitude: hiddenFalls.lng, latitudeDelta: 0.03, longitudeDelta: 0.02 };
    const tiles = osmTilesForRegion(region, 14);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0]).toEqual(tileFor(hiddenFalls, 14));
    const wide = { ...region, latitudeDelta: 1, longitudeDelta: 1 };
    expect(osmTilesForRegion(wide, 14)).toHaveLength(OSM_MAX_TILES);
  });

  it('reads the current square address from OpenFreeMap', () => {
    expect(templateFromTileJson({ tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'] })).toBe(
      'https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf',
    );
    expect(templateFromTileJson({})).toBeNull();
    expect(templateFromTileJson({ tiles: ['http://insecure/{z}/{x}/{y}'] })).toBeNull();
    expect(templateFromTileJson(null)).toBeNull();
  });
});

describe('decoding a square', () => {
  const t = tileFor(hiddenFalls, 14);
  const data = mvt({
    transportation: [
      { cls: 'track', surface: 'unpaved', line: [[100, 100], [2000, 2000], [4000, 2100]] },
      { cls: 'track', access: 'no', line: [[0, 3000], [4096, 3000]] },
      { cls: 'secondary', line: [[0, 0], [4096, 4096]] },
    ],
    transportation_name: [
      { cls: 'track', name: 'Carnage Canyon (lvl 5)', line: [[100, 100], [2000, 2000], [4000, 2100]] },
      { cls: 'track', name: 'Gated Ranch Road', line: [[0, 3000], [4096, 3000]] },
      { cls: 'service', name: 'Park Road 1', line: [[0, 500], [4096, 500]] },
    ],
  });

  it('keeps dirt tracks only, with names from the name layer', () => {
    const trails = decodeOsmTrails(data, t);
    expect(trails).toHaveLength(4);
    expect(trails.filter((x) => x.name).map((x) => x.name)).toEqual(['Carnage Canyon (lvl 5)', 'Gated Ranch Road']);
    expect(trails[0].surface).toBe('unpaved');
    // The first point sits inside this square.
    const p = trails[0].parts[0][0];
    expect(tileFor(p, 14)).toEqual(t);
  });

  it('draws each track once, one piece per item', () => {
    const trails = decodeOsmTrails(data, t);
    const drawn = drawableOsm(trails);
    expect(drawn).toHaveLength(2);
    expect(drawn.every((x) => x.name === null && x.parts.length === 1)).toBe(true);
    expect(drawableOsm(trails, 1)).toHaveLength(1);
    const many = { key: '14/1/1/l0', name: null, surface: null, closed: false, parts: Array.from({ length: 10 }, () => [hiddenFalls, hiddenFalls]) };
    const capped = drawableOsm([many, { ...many, key: '14/1/1/l1' }], 4);
    expect(capped).toHaveLength(4);
    expect(capped.every((x) => x.key.startsWith('14/1/1/l0#'))).toBe(true);
  });

  it('keeps the longest pieces when there are too many', () => {
    const step = (n: number) => [hiddenFalls, { lat: hiddenFalls.lat + n / 1000, lng: hiddenFalls.lng }];
    const track = { key: '13/1/1/l0', name: null, surface: null, closed: false, parts: [step(1), step(5), step(2), step(9)] };
    const kept = drawableOsm([track], 2);
    expect(kept.map((x) => x.key)).toEqual(['13/1/1/l0#1', '13/1/1/l0#3']);
  });

  it('hands back the same pieces in the same order however the squares arrive', () => {
    const trails = decodeOsmTrails(data, t);
    const other = { key: '13/9/9/l0', name: null, surface: null, closed: false, parts: [[hiddenFalls, hiddenFalls]] };
    const a = drawableOsm([...trails, other]);
    const b = drawableOsm([other, ...trails]);
    expect(b.map((x) => x.key)).toEqual(a.map((x) => x.key));
    // The very same objects, so the map leaves those lines alone instead of redrawing them.
    b.forEach((x, i) => expect(x).toBe(a[i]));
    expect(b[0].parts[0]).toBe(a[0].parts[0]);
  });

  it('names the track under a tap and ignores taps far away', () => {
    const trails = decodeOsmTrails(data, t);
    const on = trails[0].parts[0][1];
    const info = nearestOsmTrail(on, trails, 20)!;
    expect(info.title).toBe('Carnage Canyon (lvl 5)');
    expect(info.source).toBe('osm');
    expect(info.attribution).toMatch(/OpenStreetMap/);
    expect(nearestOsmTrail({ lat: on.lat + 0.01, lng: on.lng }, trails, 20)).toBeNull();
    expect(info.closure).toBeNull();
  });

  it('marks tracks mapped with no public access as closed, by name too', () => {
    const trails = decodeOsmTrails(data, t);
    expect(trails.filter((x) => x.closed)).toHaveLength(1);
    const gated = trails.find((x) => x.closed)!.parts[0][1];
    const info = nearestOsmTrail(gated, trails, 20)!;
    expect(info.title).toBe('Gated Ranch Road');
    expect(info.closure?.label).toBe('No Public Access');
  });

  it('tags each named track once, at the middle of its line', () => {
    const trails = decodeOsmTrails(data, t);
    const labels = trailLabels([...trails, ...trails], 10);
    expect(labels.map((l) => l.name)).toEqual(['Carnage Canyon (lvl 5)', 'Gated Ranch Road']);
    expect(labels.map((l) => l.closed)).toEqual([false, true]);
    // Halfway along the gated road's straight line is the middle of the square.
    const gated = trails.find((x) => x.name === 'Gated Ranch Road')!.parts[0];
    expect(labels[1].at.lng).toBeCloseTo((gated[0].lng + gated[1].lng) / 2, 6);
    expect(trailLabels(trails, 1)).toHaveLength(1);
    // A gap as big as the square keeps only the first tag.
    expect(trailLabels(trails, 10, { lat: 1, lng: 1 })).toHaveLength(1);
  });

  it('survives a broken square', () => {
    expect(decodeOsmTrails(new Uint8Array([1, 2, 3, 255]), t)).toEqual([]);
  });
});
