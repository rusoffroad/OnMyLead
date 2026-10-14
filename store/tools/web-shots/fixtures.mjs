const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
export const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
export const RIDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RIDE2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RIDE3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const VEH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const people = { [ME]: 'Chris', [U(1)]: 'Dusty', [U(2)]: 'Kayla', [U(3)]: 'Marcus', [U(4)]: 'Mia', [U(5)]: 'Tank', [U(6)]: 'Big Red' };
// Slickrock-ish loop near Moab
const route = [
  [-109.5600, 38.5800], [-109.5560, 38.5822], [-109.5512, 38.5836], [-109.5470, 38.5861], [-109.5431, 38.5869],
  [-109.5390, 38.5890], [-109.5352, 38.5884], [-109.5318, 38.5902], [-109.5280, 38.5931], [-109.5241, 38.5940],
  [-109.5200, 38.5926], [-109.5166, 38.5948], [-109.5130, 38.5972],
];
const at = (i, f = 0) => { const a = route[i], b = route[Math.min(i + 1, route.length - 1)]; return { lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f }; };
const ride = (o) => ({
  organizer_id: ME, description: null, depart_at: null, expected_finish_at: null, meet_state: 'UT', destination_label: null,
  vehicle_types: ['SXS/UTV', 'Jeep/4x4'], difficulty: 'moderate', experience_level: 'intermediate', max_riders: null, max_vehicles: 12,
  what_to_bring: 'Water, radio on channel 7, spare belt', required_equipment: null, fuel_notes: 'Top off in town. No fuel on the trail.',
  route_miles: 3.0, visibility: 'public', join_policy: 'open', bubble_preset: 'default', status: 'scheduled', started_at: null, ended_at: null,
  meet_area_lat: 38.58, meet_area_lng: -109.56, meet_area_label: 'Sand Flats Rd, Moab', ...o,
});
const rides = [
  ride({ id: RIDE, invite_code: '7F3A9C21', name: 'Slickrock Saturday', meet_at: iso(-90 * 60000), status: 'live', started_at: iso(-60 * 60000),
    description: 'Easy pace, lots of stops for photos. Slickrock and a few steep climbs.' }),
  ride({ id: RIDE2, invite_code: 'K2M8Q4ZT', name: 'Fins and Things Sunrise Loop', meet_at: iso(4 * 86400000), difficulty: 'moderate', meet_area_label: 'Sand Flats Rd, Moab' }),
  ride({ id: RIDE3, invite_code: 'H7RV3LLX', name: 'Hell’s Revenge with the Club', meet_at: iso(9 * 86400000), difficulty: 'hard', organizer_id: U(1) }),
  ride({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', invite_code: 'GLD9W2PQ', name: 'Gemini Bridges Family Ride', meet_at: iso(6 * 86400000), difficulty: 'easy', organizer_id: U(4), meet_area_label: 'Gemini Bridges trailhead' }),
];
const member = (ride_id, user_id, role, extra = {}) => ({
  ride_id, user_id, status: 'joined', role, vehicle_id: null, riders: 1, vehicles: 1, checked_in_at: iso(-80 * 60000), left_at: null, created_at: iso(-86400000),
  profiles: { display_name: people[user_id], photo_url: null }, ...extra,
});
const members = [
  member(RIDE, ME, 'organizer', { vehicle_id: VEH }), member(RIDE, U(1), 'leader'), member(RIDE, U(2), 'sweep'), member(RIDE, U(3), 'rider'),
  member(RIDE, U(4), 'rider'), member(RIDE, U(5), 'rider'), member(RIDE, U(6), 'rider'),
  member(RIDE2, ME, 'organizer'), member(RIDE3, ME, 'rider'),
].map((m) => ({ ...m, rides: rides.find((r) => r.id === m.ride_id) }));
const pos = (user_id, p, agoMin = 0.3, speed = 6) => ({ user_id, lat: p.lat, lng: p.lng, speed_mps: speed, heading_deg: 80, last_moved_at: iso(-agoMin * 60000), recorded_at: iso(-agoMin * 60000) });
const positions = [
  pos(U(1), at(8, 0.4)), pos(ME, at(7, 0.7)), pos(U(3), at(7, 0.2)), pos(U(4), at(6, 0.6)), pos(U(5), at(6, 0.1)), pos(U(6), at(5, 0.5)),
  pos(U(2), at(2, 0.5), 9, 0),
];
const msg = (id, user_id, body, minAgo, extra = {}) => ({ id, ride_id: RIDE, user_id, kind: 'chat', body, audience: 'everyone', poll_options: null, sent_at: iso(-minAgo * 60000), created_at: iso(-minAgo * 60000), ...extra });
const messages = [
  msg('m1', U(1), 'Fuel stop at the Sand Flats booth in 20 minutes.', 30, process.env.NOANN ? {} : { kind: 'announcement' }),
  msg('m2', U(5), 'Bringing the spare winch line.', 28),
  msg('m3', ME, 'Lunch Stop?', 20, { poll_options: ['Yes', 'No'] }),
  msg('m4', ME, 'How’s the Pace?', 12, { poll_options: ['Too Slow', 'Just Right', 'Too Fast'] }),
  msg('m5', U(4), 'Pace is perfect. Kids love it.', 6),
];
const vote = (message_id, user_id, choice) => ({ message_id, ride_id: RIDE, user_id, choice, voted_at: iso(-5 * 60000) });
const votes = [vote('m3', U(1), 0), vote('m3', U(3), 0), vote('m3', U(4), 1), vote('m4', ME, 1), vote('m4', U(1), 1), vote('m4', U(5), 1), vote('m4', U(3), 2)];
const vehicles = [{ id: VEH, owner_id: ME, kind: 'sxs_utv', year: 2024, make: 'Polaris', model: 'RZR Pro R', trim: 'Ultimate', vin: null, nickname: 'Red Rocket', photo_url: null,
  seats: 2, engine_hours: 142, odometer_miles: 1830, tank_gallons: 11.5, extra_fuel_gallons: 2, mpg: 12, purchase_price_cents: 3899900, created_at: iso(-90 * 86400000) }];
const vitem = (id, area, name, brand, cost) => ({ id, vehicle_id: VEH, area, name, brand, cost_cents: cost, installed_on: null, notes: null, created_at: iso(-30 * 86400000) });
const vehicle_items = [vitem('v1', 'wheels_tires', '32" All-Terrain Tires', 'Maxxis', 129900), vitem('v2', 'lighting', 'Light Bar 40"', 'RUS Offroad', 45000), vitem('v3', 'audio_comms', 'Rugged Radio Intercom', 'Rugged', 89900)];
const riding_groups = [
  { id: 'g1', owner_id: ME, name: 'Saturday Crew', invite_code: 'CREW77', created_at: iso(-50 * 86400000) },
  { id: 'g2', owner_id: U(5), name: 'Hatfield-McCoy Trip', invite_code: 'HMTRIP', created_at: iso(-20 * 86400000) },
];
const riding_group_members = [
  ...[ME, U(1), U(2), U(3), U(4), U(5), U(6)].map((user_id) => ({ group_id: 'g1', user_id, created_at: iso(-40 * 86400000) })),
  ...[U(5), ME, U(3), U(6)].map((user_id) => ({ group_id: 'g2', user_id, created_at: iso(-10 * 86400000) })),
];
const gm = (id, user_id, body, minAgo, ride_id = null) => ({ id, group_id: 'g1', user_id, body, ride_id, sent_at: iso(-minAgo * 60000), created_at: iso(-minAgo * 60000) });
const group_messages = [
  gm('gm5', U(6), 'Anybody have a spare belt for a Pro R? Asking for a friend.', 42),
  gm('gm4', U(3), 'Running 10 behind, save me a spot', 55),
  gm('gm3', U(1), 'We’re at the Sand Flats booth. Lot is full, park on the road.', 70, RIDE),
  gm('gm2', U(4), 'Kids are fired up for this one.', 22 * 60),
  gm('gm1', ME, 'Sunrise loop is up for Monday. Bring lights, we leave at 6.', 24 * 60, RIDE2),
];
export const tables = {
  group_messages,
  rides, ride_members: members, positions_latest: positions, ride_messages: messages, ride_poll_votes: votes, vehicles, vehicle_items,
  riding_groups, riding_group_members,
  profiles: Object.entries(people).map(([id, display_name]) => ({ id, display_name, photo_url: null })),
  ride_private_details: [{ ride_id: RIDE, meet_lat: 38.58, meet_lng: -109.56, meet_label: 'Sand Flats entrance booth', instructions: 'Park past the booth on the right.',
    route_geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: route }, properties: { source: 'drawn' } }, waypoints: route }],
  rider_statuses: [{ ride_id: RIDE, user_id: U(3), status: 'flat_tire', tapped_at: iso(-7 * 60000), lat: null, lng: null, created_at: iso(-7 * 60000) }],
  regroup_points: [], location_shares: [{ id: 's1', user_id: ME, scope: 'ride', ride_id: RIDE, started_at: iso(-60*60000), expires_at: iso(90*60000), revoked_at: null, link_token: null }], leader_follows: [], trips: [], trip_items: [], starlink_setups: [], ride_tracks: [],
  notification_settings: [], location_share_recipients: [],
};
export const rpcs = {
  group_chat_rides: rides.slice(0, 2).map((r) => ({ id: r.id, name: r.name, meet_at: r.meet_at, status: r.status, invite_code: r.invite_code })),
  mark_group_chat_read: null,
  my_entitlements: [{ plan: 'pro', status: 'active', source: 'trial', expires_at: iso(21 * 86400000) }],
};
export const session = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(now / 1000) + 86400 * 30;
  const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'rider@example.com', app_metadata: {}, user_metadata: {}, created_at: iso(-10 * 86400000) };
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, exp, role: 'authenticated', aud: 'authenticated', aal: 'aal1' })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_in: 86400 * 30, expires_at: exp, user };
};
