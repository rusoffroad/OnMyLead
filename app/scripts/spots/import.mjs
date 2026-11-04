#!/usr/bin/env node
// Builds the Scout seed: places to ride from openly licensed sources, written as one SQL file that
// upserts into public.riding_spots (supabase/migrations/20261104170000_riding_spots.sql).
//
//   NODE_USE_ENV_PROXY=1 node scripts/spots/import.mjs            (from app/)
//
// Sources (all free, no key):
//  - USFS Recreation Opportunities, activity group "OHV Riding & Camping" (US Forest Service,
//    public domain): apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01
//  - BLM National Recreation Sites, layer 7 "OHV Designated Area" (Bureau of Land Management,
//    public domain): gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts
//  - OpenStreetMap off-road parks, motocross tracks and OHV areas found through Photon
//    (photon.komoot.io). OSM data is © OpenStreetMap contributors under the ODbL, so each row keeps
//    its OSM id and credit, and this seed (in a public repo) stays available under the ODbL.
//    Photon is fair use: one request at a time, about one a second. Run it rarely, by hand.
//
// Re-running keeps ids stable (source + source_id), so an admin's hide or edit is not undone:
// the upsert only refreshes rows the admin has not touched (edited_by_admin = false).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyOsm, cleanText, kindFromName, spotKey } from './classify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../supabase/migrations/20261104170100_riding_spots_seed.sql');
const UA = 'OnMyLead-Scout-import/1.0 (+https://onmylead.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Answers are cached (SCOUT_CACHE, default the temp folder) so a re-run after a rule change
// doesn't ask Photon again.
const CACHE = process.env.SCOUT_CACHE || join(tmpdir(), 'onmylead-scout-cache');
mkdirSync(CACHE, { recursive: true });
const cacheFile = (url) => join(CACHE, `${Buffer.from(url).toString('base64url').slice(-180)}.json`);

async function getJson(url) {
  const file = cacheFile(url);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const got = await fetchJson(url);
  if (got) writeFileSync(file, JSON.stringify(got));
  return got;
}

async function fetchJson(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      console.warn(res.status, url);
    } catch (e) {
      console.warn(String(e), url);
    }
    await sleep(2000 * 2 ** i);
  }
  return null;
}

async function usfs() {
  const q = new URLSearchParams({
    where: "markeractivitygroup='OHV Riding & Camping'",
    outFields: 'recareaname,longitude,latitude,recareaurl,forestname,recareaid,markeractivity,recareadescription,openstatus',
    returnGeometry: 'false',
    f: 'json',
  });
  const d = await getJson(`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0/query?${q}`);
  return (d?.features ?? []).map(({ attributes: a }) => ({
    source: 'usfs',
    source_id: String(a.recareaid),
    name: cleanText(a.recareaname, 120),
    kind: kindFromName(a.recareaname, a.markeractivity === 'OHV Open Area Riding' ? 'ohv_area' : 'trail_system'),
    lat: Number(a.latitude),
    lng: Number(a.longitude),
    state: null,
    area: cleanText(a.forestname, 120),
    description: cleanText(a.recareadescription, 600),
    website: a.recareaurl || null,
    vehicles: ['ATV', 'UTV', 'Dirt Bike', '4x4'],
  }));
}

async function blm() {
  const q = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', f: 'json' });
  const d = await getJson(`https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/7/query?${q}`);
  return (d?.features ?? [])
    .map(({ attributes: a }) => a)
    .filter((a) => a.FET_NAME && a.WEB_DISPLAY !== 'NO')
    .map((a) => ({
      source: 'blm',
      source_id: String(a.GlobalID || a.OBJECTID).replace(/[{}]/g, ''),
      name: cleanText(a.FET_NAME, 120),
      kind: kindFromName(a.FET_NAME, 'ohv_area'),
      lat: Number(a.LAT),
      lng: Number(a.LONG),
      state: a.ADMIN_ST || null,
      area: cleanText(a.UNIT_NAME, 120),
      description: cleanText(a.DESCRIPTION, 600),
      website: a.WEB_LINK || null,
      vehicles: ['ATV', 'UTV', 'Dirt Bike', '4x4'],
    }));
}

// The searches that find riding places in OpenStreetMap names. Photon matches loosely, so "ORV
// park" also finds OHV and off-road vehicle parks; fewer, broader terms keep the import polite.
const TERMS = ['off road park', 'ORV park', 'OHV area', 'ATV park', 'motocross', 'mud park', '4x4 park', 'adventure park'];

async function osm(states) {
  const out = new Map();
  for (const s of states) {
    for (const term of TERMS) {
      const q = new URLSearchParams({ q: term, limit: '50', lang: 'en', bbox: `${s.minLng},${s.minLat},${s.maxLng},${s.maxLat}` });
      const url = `https://photon.komoot.io/api/?${q}`;
      const cached = existsSync(cacheFile(url));
      const d = await getJson(url);
      if (!cached) await sleep(1100);
      for (const f of d?.features ?? []) {
        const spot = classifyOsm(f);
        if (spot && !out.has(spot.source_id)) out.set(spot.source_id, spot);
      }
    }
    console.log(s.code, out.size);
  }
  return [...out.values()];
}

const sql = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a?.length ? `array[${a.map(sql).join(', ')}]::text[]` : `'{}'::text[]`);

const CREDIT = {
  usfs: ['US Forest Service', 'public domain'],
  blm: ['Bureau of Land Management', 'public domain'],
  osm: ['© OpenStreetMap contributors', 'ODbL 1.0'],
};

async function main() {
  const { US_STATES } = await import('./states.mjs');
  // --no-osm skips OpenStreetMap; --states=TX,OK limits it (for a quick look).
  const pick = process.argv.find((a) => a.startsWith('--states='))?.slice(9).split(',');
  const only = process.argv.includes('--no-osm') ? [] : US_STATES.filter((s) => !pick || pick.includes(s.code));
  const dry = process.argv.includes('--dry');
  const rows = [...(await usfs()), ...(await blm()), ...(await osm(only))]
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180);
  // Drop near-duplicates across sources (same name within about a mile), keeping the agency row.
  const seen = new Set();
  const kept = [];
  for (const r of rows) {
    const k = spotKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(r);
  }
  kept.sort((a, b) => (a.source + a.source_id).localeCompare(b.source + b.source_id));
  const values = kept.map((r) => {
    const [attribution, license] = CREDIT[r.source];
    return `  (${[sql(r.source), sql(r.source_id), sql(r.name), sql(r.kind), r.lat.toFixed(6), r.lng.toFixed(6), sql(r.state), sql(r.area), sql(r.description), sql(r.website), arr(r.vehicles), sql(license), sql(attribution)].join(', ')})`;
  });
  const body = `-- Scout seed: ${kept.length} places to ride (scripts/spots/import.mjs, ${new Date().toISOString().slice(0, 10)}).
-- USFS and BLM rows are public domain. OpenStreetMap rows are © OpenStreetMap contributors, ODbL 1.0.
-- Upserts by (source, source_id) and never overwrites a row an admin edited or hid. State is filled
-- from the source; rows without one show the state the app guesses from the point.
insert into riding_spots (source, source_id, name, kind, lat, lng, state, area_name, description, website, vehicle_types, license, attribution)
values
${values.join(',\n')}
on conflict (source, source_id) do update set
  name = excluded.name, kind = excluded.kind, lat = excluded.lat, lng = excluded.lng,
  state = coalesce(excluded.state, riding_spots.state), area_name = excluded.area_name,
  description = excluded.description, website = excluded.website, vehicle_types = excluded.vehicle_types,
  license = excluded.license, attribution = excluded.attribution, updated_at = now()
where not riding_spots.edited_by_admin;
`;
  if (dry) return console.log(kept.filter((r) => r.source === 'osm').map((r) => `${r.kind}\t${r.state}\t${r.name}`).join('\n'));
  writeFileSync(OUT, body);
  console.log(`wrote ${kept.length} spots to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
