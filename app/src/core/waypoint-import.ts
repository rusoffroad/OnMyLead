/**
 * Import Waypoints (4.0): read the pins out of a file a rider exported from another map app
 * (GPX or KML from apps like onX, Gaia GPS and Google Earth; GeoJSON from CalTopo and others).
 * Only the points come in; lines and tracks are counted so the sheet can say they were left out.
 *
 * A KMZ is a zip with a KML inside; the caller unzips it and passes the KML text here.
 *
 * Pure, so it is tested without a phone.
 */
import type { WaypointSymbol } from './waypoint-symbols';
import { WAYPOINT_NAME_MAX, WAYPOINT_NOTE_MAX } from './waypoints';

export type ImportFormat = 'gpx' | 'kml' | 'geojson';

export type ImportedPin = { name: string; note: string | null; lat: number; lng: number; symbol: WaypointSymbol };

export type ImportResult = { format: ImportFormat; pins: ImportedPin[]; lines: number };

/** The most pins one file brings in (Map Mode keeps 2,000 in all). */
export const IMPORT_MAX = 2000;

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The first <tag>…</tag> directly in this chunk of XML, decoded. */
const child = (xml: string, tag: string) => {
  const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
};

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
  return m ? Number(m[1]) : NaN;
};

/** Which file it is, from its text (file names and types from share sheets aren't reliable). */
export function detectFormat(text: string): ImportFormat | null {
  const head = text.slice(0, 4000);
  if (/<gpx[\s>]/i.test(head)) return 'gpx';
  if (/<kml[\s>]/i.test(head) || /<(?:\w+:)?Placemark\b/i.test(text)) return 'kml';
  if (/^\s*\{/.test(head) && /"type"\s*:\s*"(FeatureCollection|Feature|Point|MultiPoint)"/.test(head)) return 'geojson';
  return null;
}

function fromGpx(xml: string): ImportResult {
  const pins: ImportedPin[] = [];
  const re = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[2] ?? '';
    const name = child(body, 'name');
    const note = child(body, 'desc') || child(body, 'cmt');
    pins.push(pin(attr(m[1], 'lat'), attr(m[1], 'lon'), name, note, child(body, 'sym') || child(body, 'type')));
  }
  const lines = (xml.match(/<trk\b/gi)?.length ?? 0) + (xml.match(/<rte\b/gi)?.length ?? 0);
  return { format: 'gpx', pins: keep(pins), lines };
}

function fromKml(xml: string): ImportResult {
  const pins: ImportedPin[] = [];
  let lines = 0;
  const re = /<(?:\w+:)?Placemark\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Placemark>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[1];
    if (/<(?:\w+:)?(LineString|Polygon|Track|LinearRing)\b/i.test(body) && !/<(?:\w+:)?Point\b/i.test(body)) {
      lines++;
      continue;
    }
    const point = /<(?:\w+:)?Point\b[^>]*>[\s\S]*?<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/i.exec(body);
    if (!point) continue;
    const [lng, lat] = point[1].trim().split(/[\s,]+/).map(Number);
    const style = /<(?:\w+:)?styleUrl>([\s\S]*?)<\/(?:\w+:)?styleUrl>/i.exec(body)?.[1] ?? '';
    pins.push(pin(lat, lng, child(body, 'name'), child(body, 'description'), style));
  }
  return { format: 'kml', pins: keep(pins), lines };
}

function fromGeoJson(text: string): ImportResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read. Export it again and try once more.');
  }
  const features: { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }[] = [];
  const d = doc as { type?: string; features?: unknown[] };
  if (d?.type === 'FeatureCollection' && Array.isArray(d.features)) features.push(...(d.features as typeof features));
  else if (d?.type === 'Feature') features.push(d as (typeof features)[number]);
  else if (d?.type) features.push({ geometry: d as { type?: string; coordinates?: unknown } });
  const pins: ImportedPin[] = [];
  let lines = 0;
  for (const f of features) {
    const g = f?.geometry;
    const p = f?.properties ?? {};
    const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
    const name = str('name') || str('title');
    const note = str('description') || str('notes') || str('desc');
    const hint = str('marker-symbol') || str('icon') || str('sym');
    if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
      pins.push(pin(Number(g.coordinates[1]), Number(g.coordinates[0]), name, note, hint));
    } else if (g?.type === 'MultiPoint' && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates as unknown[]) if (Array.isArray(c)) pins.push(pin(Number(c[1]), Number(c[0]), name, note, hint));
    } else if (g?.type) {
      lines++;
    }
  }
  return { format: 'geojson', pins: keep(pins), lines };
}

/**
 * Read a file's pins. Throws with a plain message when it isn't a file we read, or has no pins
 * (the message says when it has only tracks).
 */
export function parseWaypointFile(text: string): ImportResult {
  const format = detectFormat(text);
  if (!format) throw new Error('That file is not a GPX, KML or KMZ file. Export your waypoints as GPX or KML and try again.');
  const r = format === 'gpx' ? fromGpx(text) : format === 'kml' ? fromKml(text) : fromGeoJson(text);
  if (!r.pins.length) {
    throw new Error(
      r.lines
        ? 'That file has tracks but no waypoints. To ride a track, import it in Draw a Route.'
        : 'That file has no waypoints in it.',
    );
  }
  return r;
}

const NAMELESS = 'Imported Waypoint';

function pin(lat: number, lng: number, name: string, note: string, hint: string): ImportedPin {
  const cleanName = (name || NAMELESS).slice(0, WAYPOINT_NAME_MAX).trim() || NAMELESS;
  const cleanNote = note && note !== name ? note.slice(0, WAYPOINT_NOTE_MAX).trim() || null : null;
  return { name: cleanName, note: cleanNote, lat, lng, symbol: guessSymbol(`${hint} ${name}`) };
}

const keep = (pins: ImportedPin[]) => pins.filter((p) => validLatLng(p.lat, p.lng) && !(p.lat === 0 && p.lng === 0)).slice(0, IMPORT_MAX);

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Words in a pin's name or icon that pick one of our symbols. First match wins, so hazards come first. */
const WORDS: [RegExp, WaypointSymbol][] = [
  [/\b(hazard|danger|caution|warning|washout|wash out|rockfall|obstacle|sketchy|careful|slow)\b/i, 'hazard'],
  [/\b(first ?aid|medical|hospital|aed|emergency)\b/i, 'first_aid'],
  [/\b(water ?crossing|crossing|ford|creek crossing|river crossing)\b/i, 'crossing'],
  [/\b(gate|cattle ?guard|barrier)\b/i, 'gate'],
  [/\b(trail ?head|th)\b/i, 'trailhead'],
  [/\b(camp|campsite|camping|campground|tent|bivy|dispersed)\b/i, 'camp'],
  [/\b(fuel|gas|diesel|petrol|station)\b/i, 'fuel'],
  [/\b(water|spring|well|tank|refill)\b/i, 'water'],
  [/\b(food|restaurant|cafe|diner|grill|burger|pizza|eat|lunch)\b/i, 'food'],
  [/\b(restroom|toilet|bathroom|outhouse|vault|wc|latrine)\b/i, 'restroom'],
  [/\b(repair|mechanic|tire|tyre|shop|garage|parts)\b/i, 'repair'],
  [/\b(photo|picture|selfie)\b/i, 'photo'],
  [/\b(view|viewpoint|overlook|vista|lookout|scenic|summit|peak)\b/i, 'view'],
  [/\b(parking|park here|lot|staging|trailer)\b/i, 'parking'],
];

/** A symbol from a pin's name or the other app's icon name; Spot when nothing fits. */
export function guessSymbol(text: string): WaypointSymbol {
  const t = text.replace(/[_\-#]+/g, ' ');
  for (const [re, s] of WORDS) if (re.test(t)) return s;
  return 'spot';
}

/** Two pins are the same when they share a name (any case) and sit within this many metres. */
export const DUPLICATE_M = 25;

/** Which of the file's pins the rider already has (same name, about the same spot). */
export function markDuplicates(pins: ImportedPin[], existing: { name: string; lat: number; lng: number }[]): boolean[] {
  const seen = existing.map((e) => ({ ...e, key: e.name.trim().toLowerCase() }));
  return pins.map((p) => {
    const key = p.name.trim().toLowerCase();
    const dup = seen.some((e) => e.key === key && metres(e, p) <= DUPLICATE_M);
    if (!dup) seen.push({ ...p, key });
    return dup;
  });
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
