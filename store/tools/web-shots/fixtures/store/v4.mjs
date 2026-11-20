// Store screenshots 4.0: the 3.0 group (v3.mjs) plus Places to Ride near Moab, Activities on,
// and Weather. Pick with FIXTURES=v4. ACT=snowmobile (or offroad, motorcycle, roadtrip) labels the rides.
import * as v3 from './v3.mjs';
const here = { lat: 38.5881, lng: -109.5335 };
const mi = (a) => { const R = 3958.8, r = (d) => (d * Math.PI) / 180; const dLat = r(a.lat - here.lat), dLng = r(a.lng - here.lng);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(r(here.lat)) * Math.cos(r(a.lat)) * Math.sin(dLng / 2) ** 2)); };
const S = (id, name, kind, lat, lng, state, area, source, rides = 0, website = null) => ({
  id: `5507${String(id).padStart(4, '0')}-0000-4000-8000-000000000000`, name, kind, lat, lng, state, area_name: area, website, source,
  attribution: null, distance_mi: mi({ lat, lng }), rides_coming_up: rides,
});
const SPOTS = [
  S(1, 'Sand Flats Recreation Area', 'ohv_area', 38.5869, -109.5000, 'UT', 'Grand County', 'blm', 2, 'https://www.blm.gov/visit/sand-flats-recreation-area'),
  S(2, "Hell's Revenge Trailhead", 'trailhead', 38.5910, -109.5180, 'UT', 'Sand Flats', 'blm', 1),
  S(3, 'Gemini Bridges Trailhead', 'trailhead', 38.6490, -109.6870, 'UT', 'Grand County', 'blm', 1),
  S(4, 'White Wash Sand Dunes', 'ohv_area', 38.8240, -110.0450, 'UT', 'Emery County', 'blm'),
  S(5, 'Sand Hollow OHV Area', 'ohv_area', 37.1150, -113.3800, 'UT', 'Washington County', 'osm'),
  S(6, 'Paiute ATV Trail System', 'trail_system', 38.5620, -112.3300, 'UT', 'Fishlake National Forest', 'usfs', 0, 'https://www.fs.usda.gov/recarea/fishlake/recarea/?recid=10911'),
  S(7, 'Little Sahara Recreation Area', 'ohv_area', 39.7280, -112.3020, 'UT', 'Juab County', 'blm'),
  S(8, 'Uncompahgre Plateau Trailhead', 'trailhead', 38.3500, -108.4900, 'CO', 'Uncompahgre National Forest', 'usfs'),
  S(9, 'Rabbit Valley Trails', 'trail_system', 39.1750, -108.9930, 'CO', 'Mesa County', 'blm'),
  S(10, 'Grand Junction Motorcross Park', 'track', 39.0900, -108.6500, 'CO', 'Mesa County', 'osm'),
  S(11, 'Durango Motocross Track', 'track', 37.2300, -107.8600, 'CO', 'La Plata County', 'osm'),
  S(12, 'Farmington Riverside ORV Park', 'park', 36.7300, -108.2300, 'NM', 'San Juan County', 'osm'),
].sort((a, b) => a.distance_mi - b.distance_mi);
const DETAIL = {
  ...SPOTS.find((x) => x.name.startsWith('Sand Flats')), description: 'Sand Flats sits on the slickrock east of Moab and is home to the Hell’s Revenge and Fins N’ Things 4x4 trails and the Slickrock bike trail. Camping, a day-use fee and a staffed entrance station.',
  vehicle_types: ['ATV', 'UTV', '4x4', 'Dirt Bike'], license: 'public domain',
};
const PAGE = {
  spot: { ...DETAIL, address: 'Sand Flats Rd, Moab, UT 84532', phone: '435-259-2444', hours: 'Open every day\nEntrance station 8 AM–5 PM', fees: '$5 a day per OHV, $10 per car', season: 'Open all year', details_source: 'The agency’s website', details_checked: '2026-11-18' },
  trails: { trails: 14, miles: 61.4, easy: 3, medium: 5, hard: 4, extreme: 2, unrated: 0, closed: 0 },
  reviews: {
    count: 3, average: 4.7, photos: [],
    list: [
      { id: 'r1', stars: 5, body: 'Hell’s Revenge is the best slickrock run anywhere. Get there early in summer, it gets hot by noon.', photos: [], name: 'Dusty', mine: false, at: '2026-11-02T15:00:00Z' },
      { id: 'r2', stars: 5, body: 'Staff at the gate were great. Camping loop E is quiet.', photos: [], name: 'Ranger Rick', mine: false, at: '2026-10-21T15:00:00Z' },
      { id: 'r3', stars: 4, body: null, photos: [], name: 'Kim', mine: false, at: '2026-10-02T15:00:00Z' },
    ],
    mine: null,
  },
  favorite: true,
};
const act = process.env.ACT || 'offroad';
export const tables = { ...v3.tables, riding_spots: [DETAIL], rides: (v3.tables.rides || []).map((r) => ({ ...r, activity: act })) };
export const rpcs = {
  ...v3.rpcs, public_app_settings: { flags: { activities: true, welcome_tour: false } },
  riding_spots_near: SPOTS, riding_spots_near_for: SPOTS, events_list_for: v3.rpcs.events_list, riding_spot_page: PAGE,
  my_favorite_riding_spots: SPOTS.filter((x) => /Sand Flats|Little Sahara|Rabbit Valley/.test(x.name)),
};
export const session = v3.session;
export const localTrails = v3.localTrails;
export const avatarFile = v3.avatarFile;
