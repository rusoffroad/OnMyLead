#!/usr/bin/env node
// Places to Ride for the other activities (4.0, Chris 2026-11-19: "depending on what activity you
// are in be sure to change the places we ride searches for the activity"). Writes one SQL seed that
// upserts into public.riding_spots with each place's activities
// (supabase/migrations/20261121550000_activity_places.sql explains the kinds).
//
//   NODE_USE_ENV_PROXY=1 node scripts/spots/import-activities.mjs      (from app/)
//
// Sources (all public domain, free, no key):
//  - USFS Recreation Opportunities (apps.fs.usda.gov EDW_RecreationOpportunities_01):
//      Snowmobiling                      -> Snowmobile Area (snowmobile)
//      Scenic Driving                    -> Scenic Drive (road trip, motorcycle)
//      Campground Camping, RV Camping    -> Campground (road trip, motorcycle)
//  - BLM National Recreation Sites, layer 2 "Campground" -> Campground (road trip, motorcycle)
//
// A place already in the table (the same source and id, such as a Forest Service area that is
// also an OHV area) keeps its kind and gains the new activities; nothing an admin edited changes.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanText } from './classify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../supabase/migrations/20261121550100_activity_places_seed.sql');
const UA = 'OnMyLead-Scout-import/1.0 (+https://onmylead.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
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
  throw new Error(`failed: ${url}`);
}

const USFS = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0/query';
const USFS_KINDS = {
  Snowmobiling: { kind: 'snow_area', activities: ['snowmobile'], vehicles: ['Snowmobile'] },
  'Scenic Driving': { kind: 'scenic_drive', activities: ['road_trip', 'motorcycle'], vehicles: ['Motorcycle', 'Car', 'RV'] },
  'Campground Camping': { kind: 'campground', activities: ['road_trip', 'motorcycle'], vehicles: ['Car', 'RV', 'Motorcycle'] },
  'RV Camping': { kind: 'campground', activities: ['road_trip', 'motorcycle'], vehicles: ['RV', 'Car', 'Motorcycle'] },
};

async function usfs() {
  const out = [];
  for (const [activity, info] of Object.entries(USFS_KINDS)) {
    for (let offset = 0; ; offset += 1000) {
      const q = new URLSearchParams({
        where: `markeractivity='${activity}'`,
        outFields: 'recareaname,longitude,latitude,recareaurl,forestname,recareaid,recareadescription,openstatus',
        returnGeometry: 'false',
        orderByFields: 'objectid',
        resultOffset: String(offset),
        resultRecordCount: '1000',
        f: 'json',
      });
      const d = await getJson(`${USFS}?${q}`);
      const fs = d?.features ?? [];
      for (const { attributes: a } of fs) {
        if (a.openstatus && /closed/i.test(a.openstatus) && /perman/i.test(a.openstatus)) continue;
        out.push({
          source: 'usfs', source_id: String(a.recareaid), name: cleanText(a.recareaname, 120), ...info,
          lat: Number(a.latitude), lng: Number(a.longitude), state: null, area: cleanText(a.forestname, 120),
          description: cleanText(a.recareadescription, 600), website: a.recareaurl || null,
          license: 'public domain', attribution: 'US Forest Service',
        });
      }
      if (fs.length < 1000) break;
      await sleep(500);
    }
  }
  return out;
}

async function blmCampgrounds() {
  const q = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', f: 'json' });
  const d = await getJson(`https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/2/query?${q}`);
  return (d?.features ?? [])
    .map(({ attributes: a }) => a)
    .filter((a) => a.FET_NAME && a.WEB_DISPLAY !== 'NO')
    .map((a) => ({
      source: 'blm', source_id: String(a.GlobalID || a.OBJECTID).replace(/[{}]/g, ''), name: cleanText(a.FET_NAME, 120),
      kind: 'campground', activities: ['road_trip', 'motorcycle'], vehicles: ['Car', 'RV', 'Motorcycle'],
      lat: Number(a.LAT), lng: Number(a.LONG), state: /^[A-Z]{2}$/.test(a.ADMIN_ST ?? '') ? a.ADMIN_ST : null,
      area: cleanText(a.UNIT_NAME, 120), description: cleanText(a.DESCRIPTION, 600), website: a.WEB_LINK || null,
      license: 'public domain', attribution: 'Bureau of Land Management',
    }));
}

const sql = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(sql).join(', ')}]::text[]`;

const rows = [...(await usfs()), ...(await blmCampgrounds())]
  .filter((r) => r.name && r.name.length >= 2 && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180 && r.lat !== 0)
  .map((r) => ({ ...r, website: r.website && /^https?:\/\//i.test(r.website) && r.website.length <= 300 ? r.website : null }));

// One row per source id: a place listed for two activities keeps both (and the first kind).
const byKey = new Map();
for (const r of rows) {
  const k = `${r.source}:${r.source_id}`;
  const had = byKey.get(k);
  if (had) had.activities = [...new Set([...had.activities, ...r.activities])];
  else byKey.set(k, { ...r });
}
const list = [...byKey.values()].sort((a, b) => `${a.source}${a.source_id}`.localeCompare(`${b.source}${b.source_id}`));
const counts = list.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});

const values = list.map((r) =>
  `  (${sql(r.source)}, ${sql(r.source_id)}, ${sql(r.name)}, ${sql(r.kind)}, ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}, ${sql(r.state)}, ${sql(r.area)}, ` +
  `${sql(r.description)}, ${sql(r.website)}, ${arr(r.vehicles)}, ${sql(r.license)}, ${sql(r.attribution)}, ${arr(r.activities)})`);

writeFileSync(OUT, `-- Places to Ride for the other activities: ${list.length} places (scripts/spots/import-activities.mjs, ${new Date().toISOString().slice(0, 10)}).
-- ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}. US Forest Service and BLM data, public domain.
-- A place already here keeps its kind and gains these activities; a row an admin edited is left alone.
insert into riding_spots (source, source_id, name, kind, lat, lng, state, area_name, description, website, vehicle_types, license, attribution, activities)
values
${values.join(',\n')}
on conflict (source, source_id) do update set
  activities = (select array(select distinct unnest(riding_spots.activities || excluded.activities) order by 1)),
  updated_at = now()
where not riding_spots.edited_by_admin;
`);
console.log(`wrote ${list.length} places`, counts, OUT);
