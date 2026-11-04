// Rules for the Scout import (import.mjs): which OpenStreetMap places are places to ride, and
// what kind each one is. Plain functions so classify.test.mjs can check them.

const STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};

export function stateCode(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^[A-Z]{2}$/.test(t)) return t;
  return STATE_NAMES[t.toLowerCase()] ?? null;
}

// A name that says motor vehicles ride here.
const RIDE_NAME = /\b(orv|ohv|ohrv|atv|utv|sxs|off[- ]?road|off[- ]?highway|4x4|4 x 4|4wd|jeep|motocross|mx|moto|dirt ?bike|mud|motorsports?|enduro|trials|riding area|adventure park|trail system|rock crawl\w*)\b/i;
// Names that look like a match but aren't places to ride.
const NOT_RIDING = /\b(dog|leash|bark|canine|zip ?line|rope|aerial|tree ?top|trampoline|water ?park|splash|playground|kids|mini ?golf|golf|laser|escape|paintball|airsoft|shop|store|dealer|sales|repair|service|parts|rental office|museum|school|church|hotel|motel|inn|restaurant|bar|grill|apartments?|rv park|mobile home|storage|bicycle|bmx|mountain bike|mtb|skate|equestrian|horse|archery|climb\w*|boulder\w*|bolder|gym|fitness|ninja)\b/i;
// OSM categories a riding place can be filed under.
const OSM_VALUES = new Set([
  'park', 'track', 'sports_centre', 'nature_reserve', 'recreation_ground', 'raceway', 'motocross', 'pitch',
  'attraction', 'theme_park', 'trailhead', 'protected_area', 'common', 'camp_site', 'leisure', 'area', 'stadium',
]);

// Off-road parks named "Adventure Park" (add one here when riders suggest it).
const ADVENTURE_OFFROAD = /^(hidden falls|burning rock( outdoor)?|red rock canyon|windrock|wildcat|mines and meadows|hatfield|top trails|catawba|devils den|rocky mountain) adventure park$/i;

/** 'trailhead' | 'track' | 'ohv_area' | 'trail_system' | 'park', from a place's name. */
export function kindFromName(name, fallback = 'park') {
  const n = String(name ?? '');
  if (/\b(trail ?head|staging( area)?|th)\b/i.test(n)) return 'trailhead';
  if (/\b(motocross|mx|raceway|speedway|race ?track|track)\b/i.test(n)) return 'track';
  if (/\b(o[hr]v|ohrv|off[- ]highway|riding|open|vehicle|vehicular)( recreation)? area\b|\b(recreation area|sva|svra)\b/i.test(n)) return 'ohv_area';
  if (/\btrails?\b|\btrail system\b/i.test(n) && !/\bpark\b/i.test(n)) return 'trail_system';
  if (/\bpark\b/i.test(n)) return 'park';
  return fallback;
}

/** Plain text from an agency's HTML description, cut at a word near `max` characters. */
export function cleanText(html, max = 600) {
  if (html == null) return null;
  const text = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)).trim()}…`;
}

/** A Photon (OpenStreetMap) search result as a spot, or null when it isn't a place to ride. */
export function classifyOsm(feature) {
  const p = feature?.properties ?? {};
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (p.countrycode && p.countrycode !== 'US') return null;
  if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const sportish = p.osm_key === 'sport' || /motocross|motor|4wd|atv/.test(String(p.osm_value));
  if (!sportish && !OSM_VALUES.has(p.osm_value)) return null;
  if (!RIDE_NAME.test(p.name) || NOT_RIDING.test(p.name)) return null;
  // Texas "MUD" parks belong to Municipal Utility Districts, and "Mud Creek" is a creek.
  if (/\bMUD\b/.test(p.name) || /\bmud (creek|lake|river|island|run|pond)\b/i.test(p.name)) return null;
  if (/\bmud\b/i.test(p.name) && !/\bmud (park|bog|pit|hole|ranch|fest)\b|\bmudd/i.test(p.name)) return null;
  // A bare "Adventure Park" or "ATV Park" with no other name is too vague to send riders to.
  if (/^(the )?(adventure|atv|off ?road|mx|motocross)( park| track| track area| course)?$/i.test(p.name.trim())) return null;
  // Streets, barriers, tour companies, private tracks and kart tracks.
  if (/\b(private|lane|street|st|avenue|ave|drive|dr|tours?|barricade|testing|kart|gang)\b/i.test(p.name) && !/\b(4 ?wheel drive|4wd) (park|area)\b/i.test(p.name)) return null;
  // Most "Adventure Parks" are trampoline, rope or zoo parks. Only the off-road ones we know of, or
  // ones that say off-road in the name.
  if (/adventure park/i.test(p.name) && !/\b(off|orv|ohv|atv|utv|4x4|offroad|off-road|motor\w*)\b/i.test(p.name) && !ADVENTURE_OFFROAD.test(p.name)) return null;
  // "Adventure park" alone can be a rope course: only parks big enough to be on the map as an area.
  if (/adventure park/i.test(p.name) && !/\b(off|orv|ohv|atv|4x4|offroad|off-road)\b/i.test(p.name) && (!p.extent || p.osm_type === 'N')) return null;
  return {
    source: 'osm',
    source_id: String(p.osm_id),
    name: p.name.trim().slice(0, 120),
    kind: kindFromName(p.name, 'park'),
    lat,
    lng,
    state: stateCode(p.state),
    area: p.county ? `${p.county} County` : null,
    description: null,
    website: null,
    vehicles: [],
  };
}

/** Same name (letters only) within about a mile: the same place from two sources. */
export function spotKey(r) {
  const n = String(r.name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${n}@${Math.round(r.lat * 60)}:${Math.round(r.lng * 60)}`;
}
