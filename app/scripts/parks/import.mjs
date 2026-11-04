#!/usr/bin/env node
/**
 * Park Trails import: pulls every OpenStreetMap track and park road inside each park polygon
 * listed in parks.json and writes the seed migration that fills the park_trails table
 * (supabase/migrations/20261104180000_park_trails.sql).
 *
 *   node scripts/parks/import.mjs            # every park, writes the seed migration
 *   node scripts/parks/import.mjs "Hidden"   # only parks whose name matches
 *   OVERPASS=https://overpass-api.de/api/interpreter node scripts/parks/import.mjs
 *
 * Data: OpenStreetMap (© OpenStreetMap contributors, Open Database License). This script is the
 * published method of derivation the license asks for. It reads the OSM API (one small
 * bounding-box call per park square, cached in scripts/parks/cache/, never committed) or Overpass
 * when OVERPASS is set. Parks' own copyrighted maps are never read.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const cacheDir = join(here, 'cache');
const SEED = join(root, 'supabase', 'migrations', '20261104180100_park_trails_seed.sql');
const UA = 'OnMyLead park trails import (https://onmylead.com; chris@rusoffroad.com)';
const OVERPASS = process.env.OVERPASS || '';
/** OSM API map calls must stay under 0.25 square degrees and 50,000 nodes; parks are tiled this big. */
const TILE_DEG = 0.12;
const filter = process.argv[2] ? process.argv[2].toLowerCase() : '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, body ? { method: 'POST', body, headers: { 'User-Agent': UA } } : { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${await res.text()}`), { fatal: true });
      return await res.json();
    } catch (e) {
      if (e.fatal || attempt === 3) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
}

async function cached(key, make) {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, key.replace(/[^a-z0-9_.-]/gi, '_') + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const v = await make();
  writeFileSync(file, JSON.stringify(v));
  await sleep(1200);
  return v;
}

// --- Geometry ------------------------------------------------------------------------------------

const toRad = (d) => (d * Math.PI) / 180;
function distanceM(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const lineLengthM = (pts) => pts.reduce((m, p, i) => (i ? m + distanceM(pts[i - 1], p) : 0), 0);

function insideRing(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) c = !c;
  }
  return c;
}
const insideAny = (p, rings) => rings.some((r) => insideRing(p, r));

function encodeNumber(v, out) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  while (n >= 0x20) {
    out.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
    n >>= 5;
  }
  out.push(String.fromCharCode(n + 63));
}
function encodePolyline(points) {
  const out = [];
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    const la = Math.round(p.lat * 1e5);
    const ln = Math.round(p.lng * 1e5);
    encodeNumber(la - lat, out);
    encodeNumber(ln - lng, out);
    lat = la;
    lng = ln;
  }
  return out.join('');
}

/** Drop points that add nothing at a meter (Douglas-Peucker on a flat projection). */
function simplify(pts, tolM = 1.5) {
  if (pts.length < 3) return pts;
  const kx = 111320 * Math.cos(toRad(pts[0].lat));
  const xy = (p) => ({ x: p.lng * kx, y: p.lat * 111320 });
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = xy(pts[s]);
    const b = xy(pts[e]);
    let best = -1;
    let bestD = tolM;
    for (let i = s + 1; i < e; i++) {
      const p = xy(pts[i]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      if (d > bestD) [best, bestD] = [i, d];
    }
    if (best >= 0) {
      keep[best] = true;
      stack.push([s, best], [best, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// --- OpenStreetMap --------------------------------------------------------------------------------

/** The park polygon's outer rings (a closed way, or a multipolygon relation's outer ways stitched). */
async function parkRings(osm) {
  const [type, id] = osm.split('/');
  const data = await cached(`${type}-${id}-full`, () => fetchJson(`https://api.openstreetmap.org/api/0.6/${type}/${id}/full.json`));
  const nodes = new Map(data.elements.filter((e) => e.type === 'node').map((n) => [n.id, { lat: n.lat, lng: n.lon }]));
  const ways = new Map(data.elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  const wayPts = (w) => w.nodes.map((n) => nodes.get(n)).filter(Boolean);
  let rings = [];
  if (type === 'way') {
    rings = [wayPts(ways.get(Number(id)))];
  } else {
    const rel = data.elements.find((e) => e.type === 'relation' && e.id === Number(id));
    const outers = rel.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === '') && ways.has(m.ref)).map((m) => wayPts(ways.get(m.ref)));
    // Stitch open ways end to end into closed rings.
    const pending = outers.filter((w) => w.length > 1);
    while (pending.length) {
      const ring = pending.shift().slice();
      let grew = true;
      while (grew && !(ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng)) {
        grew = false;
        const end = ring[ring.length - 1];
        for (let i = 0; i < pending.length; i++) {
          const w = pending[i];
          const a = w[0];
          const b = w[w.length - 1];
          if (a.lat === end.lat && a.lng === end.lng) ring.push(...w.slice(1));
          else if (b.lat === end.lat && b.lng === end.lng) ring.push(...w.slice(0, -1).reverse());
          else continue;
          pending.splice(i, 1);
          grew = true;
          break;
        }
      }
      rings.push(ring);
    }
  }
  const name = (type === 'way' ? ways.get(Number(id)) : data.elements.find((e) => e.type === 'relation'))?.tags?.name ?? null;
  return { rings: rings.filter((r) => r.length >= 4), osmName: name };
}

function bboxOf(rings) {
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
  for (const r of rings) for (const p of r) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, minLng, maxLat, maxLng };
}

const HIGHWAYS = new Set(['track', 'path', 'unclassified', 'service', 'bridleway', 'cycleway', 'footway']);

/** Every way with a highway tag that touches the box, with its node coordinates. */
async function waysInBox(key, box) {
  const elements = [];
  if (OVERPASS) {
    const q = `[out:json][timeout:120];way["highway"](${box.minLat},${box.minLng},${box.maxLat},${box.maxLng});out body;>;out skel qt;`;
    const data = await cached(`${key}-overpass`, () => fetchJson(OVERPASS, q));
    elements.push(...data.elements);
  } else {
    const tiles = [];
    for (let lat = box.minLat; lat < box.maxLat; lat += TILE_DEG) {
      for (let lng = box.minLng; lng < box.maxLng; lng += TILE_DEG) {
        tiles.push({ minLat: lat, minLng: lng, maxLat: Math.min(lat + TILE_DEG, box.maxLat), maxLng: Math.min(lng + TILE_DEG, box.maxLng) });
      }
    }
    for (const t of tiles) {
      const bbox = [t.minLng, t.minLat, t.maxLng, t.maxLat].map((v) => v.toFixed(5)).join(',');
      const data = await cached(`${key}-map-${bbox}`, () => fetchJson(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`));
      elements.push(...data.elements);
    }
  }
  const nodes = new Map();
  const ways = new Map();
  for (const e of elements) {
    if (e.type === 'node') nodes.set(e.id, { lat: e.lat, lng: e.lon });
    else if (e.type === 'way' && e.tags?.highway) ways.set(e.id, e);
  }
  return { nodes, ways: [...ways.values()] };
}

const LEVEL = /\b(?:lvl|level|lv)\.?\s*(\d)\b/i;
const CLOSED_WORD = /\b(closed|do not enter|no entry)\b/i;

function lineOf(w, nodes, park) {
  const tags = w.tags;
  const hw = tags.highway;
  if (!HIGHWAYS.has(hw)) return null;
  // Foot and bike paths stay off unless they are open to motor vehicles.
  const motor = tags.motor_vehicle ?? tags.motorcar ?? tags.atv ?? tags.motorcycle;
  if (['path', 'bridleway', 'cycleway', 'footway'].includes(hw) && !['yes', 'designated', 'permissive'].includes(motor)) return null;
  if (['motor_vehicle', 'motorcar'].some((k) => tags[k] === 'no') && tags.atv !== 'yes' && tags.motorcycle !== 'yes') return null;
  const pts = w.nodes.map((n) => nodes.get(n)).filter(Boolean);
  if (pts.length < 2) return null;
  const inside = pts.filter((p) => insideAny(p, park.rings)).length;
  if (inside < Math.max(2, pts.length * 0.5)) return null;
  const line = simplify(pts);
  const length = Math.round(lineLengthM(line));
  if (length < 20) return null;
  const name = (tags.name ?? tags.ref ?? null)?.trim() || null;
  const level = name ? Number((LEVEL.exec(name) ?? [])[1]) || null : null;
  const closed = ['no', 'private'].includes(tags.access ?? '') || (!!name && CLOSED_WORD.test(name)) || tags.disused === 'yes' || tags.abandoned === 'yes';
  const box = bboxOf([line]);
  return {
    source: 'osm',
    source_id: w.id,
    park_name: park.name,
    park_state: park.state,
    park_website: park.website,
    name: name ? name.replace(/\s*\((?:lvl|level|lv)\.?\s*\d\)\s*/i, ' ').replace(/\s+/g, ' ').trim() : null,
    level: level && level >= 1 && level <= 5 ? level : null,
    kind: hw === 'service' || hw === 'unclassified' ? 'road' : 'trail',
    closed,
    oneway: tags.oneway === 'yes',
    surface: tags.surface ? String(tags.surface).slice(0, 40) : null,
    route_enc: encodePolyline(line),
    length_m: length,
    min_lat: box.minLat, min_lng: box.minLng, max_lat: box.maxLat, max_lng: box.maxLng,
  };
}

// --- Seed migration -------------------------------------------------------------------------------

const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'true' : 'false') : `'${String(v).replace(/'/g, "''")}'`);

function seedSql(parks) {
  const out = [];
  out.push('-- Park Trails seed: generated by app/scripts/parks/import.mjs from OpenStreetMap (© OpenStreetMap');
  out.push('-- contributors, ODbL). Do not edit by hand: change parks.json and run the script again.');
  out.push(`-- ${parks.length} parks, ${parks.reduce((n, p) => n + p.lines.length, 0)} lines, pulled ${new Date().toISOString().slice(0, 10)}.`);
  out.push('-- Rows keep their id and hidden flag; lines that left OpenStreetMap are removed per park.');
  out.push('');
  for (const p of parks) {
    out.push(`-- ${p.name} (${p.state}, osm ${p.osm}): ${p.lines.length} lines`);
    if (p.lines.length) {
      out.push('insert into park_trails (park_osm_id, park_name, park_state, park_website, source, source_id, name, level, kind, closed, oneway, surface, route_enc, length_m, min_lat, min_lng, max_lat, max_lng) values');
      out.push(p.lines.map((l) => `(${[p.osmId, l.park_name, l.park_state, l.park_website, l.source, l.source_id, l.name, l.level, l.kind, l.closed, l.oneway, l.surface, l.route_enc, l.length_m, l.min_lat, l.min_lng, l.max_lat, l.max_lng].map(q).join(', ')})`).join(',\n'));
      out.push('on conflict (source, source_id) do update set park_osm_id = excluded.park_osm_id, park_name = excluded.park_name, park_state = excluded.park_state, park_website = excluded.park_website, name = excluded.name, level = excluded.level, kind = excluded.kind, closed = excluded.closed, oneway = excluded.oneway, surface = excluded.surface, route_enc = excluded.route_enc, length_m = excluded.length_m, min_lat = excluded.min_lat, min_lng = excluded.min_lng, max_lat = excluded.max_lat, max_lng = excluded.max_lng, updated_at = now();');
    }
    out.push(`delete from park_trails where park_osm_id = ${p.osmId} and source = 'osm' and not (source_id = any (array[${p.lines.map((l) => l.source_id).join(', ') || '-1'}]::bigint[]));`);
    out.push('');
  }
  return out.join('\n') + '\n';
}

// --- Main -----------------------------------------------------------------------------------------

const list = JSON.parse(readFileSync(join(here, 'parks.json'), 'utf8')).parks;
const results = [];
for (const park of list) {
  if (filter && !park.name.toLowerCase().includes(filter)) continue;
  const osmId = Number(park.osm.split('/')[1]);
  try {
    const { rings, osmName } = await parkRings(park.osm);
    if (!rings.length) throw new Error('no polygon');
    const box = bboxOf(rings);
    const { nodes, ways } = await waysInBox(park.osm.replace('/', '-'), box);
    const lines = ways.map((w) => lineOf(w, nodes, { ...park, rings })).filter(Boolean);
    const km = lines.reduce((m, l) => m + l.length_m, 0) / 1000;
    console.log(`${park.name} (${park.state}) [${osmName ?? '?'}]: ${lines.length} lines, ${km.toFixed(1)} km, ${lines.filter((l) => l.name).length} named, ${lines.filter((l) => l.level).length} with levels`);
    results.push({ ...park, osmId, lines });
  } catch (e) {
    console.error(`${park.name}: FAILED ${e.message}`);
  }
}
if (!filter) {
  writeFileSync(SEED, seedSql(results));
  const kb = Math.round(seedSql(results).length / 1024);
  console.log(`\nWrote ${SEED} (${kb} KB, ${results.length} parks)`);
} else {
  console.log('\n(filtered run: seed not written)');
}
