import { fuzzLocation } from '@/core/geo';
import type { BubblePreset } from '@/core/bubble';
import type { JoinPolicy, MemberStatus } from '@/core/joining';
import type { AreaId, VehicleKind } from '@/core/garage';
import { startShare, type ShareScope } from '@/core/sharing';
import { itemsFromRideNotes, localDate, templateById, type TemplateItem, type TripCategory } from '@/core/trips';
import { track } from './analytics';
import { readPhotoBytes, type PickedPhoto } from './photo-bytes';
import { supabase } from './supabase';
import type {
  Position, RegroupPoint, Ride, RideMember, RidePrivateDetails, RiderStatusKind, StarlinkSetup, Trip, TripItem, Vehicle, VehicleItem, Visibility,
} from './types';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  return data.user.id;
}

export type NewRide = {
  name: string;
  description?: string;
  meetAt: Date;
  departAt?: Date | null;
  expectedFinishAt?: Date | null;
  meetLat: number;
  meetLng: number;
  meetLabel?: string;
  destinationLabel?: string;
  instructions?: string;
  vehicleTypes: string[];
  difficulty?: string | null;
  experienceLevel?: string | null;
  maxRiders?: number | null;
  maxVehicles?: number | null;
  whatToBring?: string;
  requiredEquipment?: string;
  fuelNotes?: string;
  routeMiles?: number | null;
  visibility: Visibility;
  joinPolicy: JoinPolicy;
  bubblePreset: BubblePreset;
};

export async function createRide(r: NewRide): Promise<Ride> {
  const organizer_id = await currentUserId();
  const area = fuzzLocation({ lat: r.meetLat, lng: r.meetLng });
  const ride = unwrap<Ride>(
    await supabase
      .from('rides')
      .insert({
        organizer_id,
        name: r.name,
        description: r.description || null,
        meet_at: r.meetAt.toISOString(),
        depart_at: r.departAt?.toISOString() ?? null,
        expected_finish_at: r.expectedFinishAt?.toISOString() ?? null,
        meet_area_lat: area.lat,
        meet_area_lng: area.lng,
        meet_area_label: r.meetLabel ? r.meetLabel.split(',').slice(-2).join(',').trim() : null,
        destination_label: r.destinationLabel || null,
        vehicle_types: r.vehicleTypes,
        difficulty: r.difficulty ?? null,
        experience_level: r.experienceLevel ?? null,
        max_riders: r.maxRiders ?? null,
        max_vehicles: r.maxVehicles ?? null,
        what_to_bring: r.whatToBring || null,
        required_equipment: r.requiredEquipment || null,
        fuel_notes: r.fuelNotes || null,
        route_miles: r.routeMiles ?? null,
        visibility: r.visibility,
        join_policy: r.joinPolicy,
        bubble_preset: r.bubblePreset,
      })
      .select()
      .single(),
  );
  unwrap(
    await supabase.from('ride_private_details').insert({
      ride_id: ride.id,
      meet_lat: r.meetLat,
      meet_lng: r.meetLng,
      meet_label: r.meetLabel || null,
      instructions: r.instructions || null,
    }),
  );
  track('ride_created', { visibility: r.visibility, join_policy: r.joinPolicy, max_vehicles: r.maxVehicles ?? null });
  return ride;
}

export async function getRide(idOrCode: string): Promise<Ride | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCode);
  const q = supabase.from('rides').select('*');
  const res = isUuid ? await q.eq('id', idOrCode).maybeSingle() : await q.eq('invite_code', idOrCode.toUpperCase()).maybeSingle();
  return unwrap<Ride | null>(res);
}

/** Only returns data for joined riders; everyone else gets null (enforced by the database). */
export async function getPrivateDetails(rideId: string): Promise<RidePrivateDetails | null> {
  return unwrap(await supabase.from('ride_private_details').select('*').eq('ride_id', rideId).maybeSingle());
}

export async function getMembers(rideId: string): Promise<RideMember[]> {
  return unwrap(
    await supabase
      .from('ride_members')
      .select('*, profiles(display_name, photo_url)')
      .eq('ride_id', rideId)
      .order('created_at'),
  );
}

export async function myRides(): Promise<(RideMember & { rides: Ride })[]> {
  const uid = await currentUserId();
  return unwrap(
    await supabase
      .from('ride_members')
      .select('*, rides(*)')
      .eq('user_id', uid)
      .in('status', ['joined', 'pending', 'waitlisted', 'invited']),
  );
}

export async function discoverPublicRides(): Promise<Ride[]> {
  return unwrap(
    await supabase
      .from('rides')
      .select('*')
      .eq('visibility', 'public')
      .in('status', ['scheduled', 'live'])
      .gte('meet_at', new Date(Date.now() - 6 * 3600_000).toISOString())
      .order('meet_at')
      .limit(100),
  );
}

export async function joinRide(opts: { rideId?: string; inviteCode?: string; vehicleId?: string | null; riders?: number }): Promise<MemberStatus> {
  const status = unwrap<MemberStatus>(
    await supabase.rpc('join_ride', {
      p_ride: opts.rideId ?? null,
      p_invite_code: opts.inviteCode ?? null,
      p_vehicle: opts.vehicleId ?? null,
      p_riders: opts.riders ?? 1,
      p_vehicles: opts.vehicleId === null ? 0 : 1,
    }),
  );
  return status;
}

export const leaveRide = async (rideId: string) => unwrap(await supabase.rpc('leave_ride', { p_ride: rideId }));
export const checkIn = async (rideId: string) => {
  unwrap(await supabase.rpc('check_in', { p_ride: rideId }));
  track('check_in', { ride_id: rideId });
};

export async function setRideStatus(rideId: string, status: 'live' | 'ended' | 'cancelled') {
  unwrap(await supabase.rpc('set_ride_status', { p_ride: rideId, p_status: status }));
  track(status === 'live' ? 'ride_mode_started' : 'ride_mode_ended', { ride_id: rideId });
}

export async function setMemberRole(rideId: string, userId: string, role: 'leader' | 'sweep' | 'rider' | 'co_organizer') {
  unwrap(await supabase.from('ride_members').update({ role }).eq('ride_id', rideId).eq('user_id', userId));
}

export async function approveMember(rideId: string, userId: string, approve: boolean) {
  unwrap(
    await supabase
      .from('ride_members')
      .update({ status: approve ? 'joined' : 'declined' })
      .eq('ride_id', rideId)
      .eq('user_id', userId),
  );
}

// --- Location sharing -------------------------------------------------------

export type ActiveShare = { id: string; scope: ShareScope; ride_id: string | null; started_at: string; expires_at: string | null; revoked_at: string | null; link_token: string | null };

export async function startLocationShare(opts: { scope: ShareScope; rideId?: string; durationMin: number | null; recipientIds?: string[]; withFamilyLink?: boolean }): Promise<ActiveShare> {
  const user_id = await currentUserId();
  const session = startShare(opts.scope, Date.now(), opts.durationMin);
  const link_token = opts.withFamilyLink ? randomToken() : null;
  const share = unwrap<ActiveShare>(
    await supabase
      .from('location_shares')
      .insert({
        user_id,
        scope: opts.scope,
        ride_id: opts.rideId ?? null,
        expires_at: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
        link_token,
      })
      .select()
      .single(),
  );
  if (opts.recipientIds?.length) {
    unwrap(await supabase.from('location_share_recipients').insert(opts.recipientIds.map((recipient_id) => ({ share_id: share.id, recipient_id }))));
  }
  track('share_started', { scope: opts.scope, duration_min: opts.durationMin, recipients: opts.recipientIds?.length ?? 0, family_link: !!link_token });
  return share;
}

export async function extendLocationShare(share: ActiveShare, addMin: number): Promise<ActiveShare> {
  const base = Math.max(Date.now(), share.expires_at ? Date.parse(share.expires_at) : Date.now());
  const updated = unwrap<ActiveShare>(
    await supabase.from('location_shares').update({ expires_at: new Date(base + addMin * 60_000).toISOString() }).eq('id', share.id).select().single(),
  );
  track('share_extended', { scope: share.scope, add_min: addMin });
  return updated;
}

export async function stopLocationShare(shareId: string) {
  unwrap(await supabase.from('location_shares').update({ revoked_at: new Date().toISOString() }).eq('id', shareId));
  track('share_stopped_early', {});
}

export async function myActiveShares(): Promise<ActiveShare[]> {
  const uid = await currentUserId();
  const rows = unwrap<ActiveShare[]>(
    await supabase.from('location_shares').select('*').eq('user_id', uid).is('revoked_at', null),
  );
  const now = Date.now();
  return rows.filter((s) => !s.expires_at || Date.parse(s.expires_at) > now);
}

/** People you have been on a ride with, as candidates for personal sharing. */
export async function ridingFriends(): Promise<{ id: string; name: string }[]> {
  const uid = await currentUserId();
  const mine = unwrap<{ ride_id: string }[]>(
    await supabase.from('ride_members').select('ride_id').eq('user_id', uid).eq('status', 'joined'),
  );
  if (!mine.length) return [];
  type Row = { user_id: string; profiles: { display_name: string } | null };
  const rows = unwrap<Row[]>(
    (await supabase
      .from('ride_members')
      .select('user_id, profiles(display_name)')
      .in('ride_id', mine.map((m) => m.ride_id))
      .eq('status', 'joined')
      .neq('user_id', uid)) as unknown as { data: Row[] | null; error: { message: string } | null },
  );
  const seen = new Map<string, string>();
  for (const r of rows) seen.set(r.user_id, r.profiles?.display_name || 'Rider');
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export type SharedLocation = { display_name: string; lat: number | null; lng: number | null; recorded_at: string | null; expires_at: string | null; ride_name: string | null; expected_finish_at: string | null };

export async function sharedLocationByToken(token: string): Promise<SharedLocation | null> {
  const rows = unwrap<SharedLocation[]>(
    await supabase.rpc('get_shared_location', { p_token: token }),
  );
  return rows[0] ?? null;
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Ride Mode --------------------------------------------------------------

export async function getPositions(userIds: string[]): Promise<Position[]> {
  if (!userIds.length) return [];
  // Rows for riders who are not sharing with us are filtered out by the database.
  return unwrap(await supabase.from('positions_latest').select('*').in('user_id', userIds));
}

export async function sendRiderStatus(rideId: string, status: RiderStatusKind, at?: { lat: number; lng: number } | null, tappedAt = new Date()) {
  const user_id = await currentUserId();
  unwrap(
    await supabase.from('rider_statuses').insert({ ride_id: rideId, user_id, status, lat: at?.lat ?? null, lng: at?.lng ?? null, tapped_at: tappedAt.toISOString() }),
  );
  track('rider_status', { status });
}

export async function latestStatuses(rideId: string) {
  return unwrap<{ user_id: string; status: RiderStatusKind; tapped_at: string; lat: number | null; lng: number | null }[]>(
    await supabase.from('rider_statuses').select('user_id, status, tapped_at, lat, lng').eq('ride_id', rideId).order('created_at', { ascending: false }).limit(200),
  );
}

export async function dropRegroup(rideId: string, lat: number, lng: number, label?: string) {
  const created_by = await currentUserId();
  await supabase.from('regroup_points').update({ cleared_at: new Date().toISOString() }).eq('ride_id', rideId).is('cleared_at', null);
  unwrap(await supabase.from('regroup_points').insert({ ride_id: rideId, created_by, lat, lng, label: label ?? null }));
  track('regroup_here', {});
}

export async function activeRegroup(rideId: string): Promise<RegroupPoint | null> {
  return unwrap(
    await supabase.from('regroup_points').select('*').eq('ride_id', rideId).is('cleared_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  );
}

// --- Garage -----------------------------------------------------------------

export const VEHICLE_PHOTO_BUCKET = 'vehicle-photos';

export type VehicleInput = {
  kind: VehicleKind;
  nickname: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  purchase_price_cents: number | null;
  engine_hours: number | null;
  odometer_miles: number | null;
  tank_gallons: number | null;
  extra_fuel_gallons: number;
  mpg: number | null;
};

export type VehicleWithCost = Vehicle & { build_cost_cents: number; item_count: number };

export async function myVehicles(): Promise<VehicleWithCost[]> {
  const uid = await currentUserId();
  type Row = Vehicle & { vehicle_items: { cost_cents: number | null }[] | null };
  const rows = unwrap<Row[]>(
    await supabase.from('vehicles').select('*, vehicle_items(cost_cents)').eq('owner_id', uid).order('created_at'),
  );
  return rows.map(({ vehicle_items, ...v }) => ({
    ...v,
    build_cost_cents: (vehicle_items ?? []).reduce((sum, i) => sum + (i.cost_cents ?? 0), 0),
    item_count: vehicle_items?.length ?? 0,
  }));
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  return unwrap(await supabase.from('vehicles').select('*').eq('id', id).maybeSingle());
}

export async function createVehicle(v: VehicleInput): Promise<Vehicle> {
  const owner_id = await currentUserId();
  const row = unwrap<Vehicle>(await supabase.from('vehicles').insert({ ...v, owner_id }).select().single());
  track('vehicle_added', { kind: v.kind });
  return row;
}

export async function updateVehicle(id: string, v: Partial<VehicleInput> & { photo_url?: string | null }): Promise<Vehicle> {
  return unwrap(await supabase.from('vehicles').update(v).eq('id', id).select().single());
}

export async function deleteVehicle(v: Pick<Vehicle, 'id' | 'photo_url'>) {
  unwrap(await supabase.from('vehicles').delete().eq('id', v.id));
  const path = photoPath(v.photo_url);
  if (path) await supabase.storage.from(VEHICLE_PHOTO_BUCKET).remove([path]);
}

/** Storage path inside the bucket for a public photo URL we created, else null. */
function photoPath(url: string | null): string | null {
  const marker = `/${VEHICLE_PHOTO_BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  return url && at >= 0 ? decodeURIComponent(url.slice(at + marker.length).split('?')[0]) : null;
}

const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** Upload a photo into the owner's folder and point the vehicle at it. Replaces any previous photo. */
export async function setVehiclePhoto(vehicle: Pick<Vehicle, 'id' | 'photo_url'>, photo: PickedPhoto): Promise<Vehicle> {
  const uid = await currentUserId();
  const contentType = photo.mimeType && PHOTO_EXT[photo.mimeType] ? photo.mimeType : 'image/jpeg';
  const path = `${uid}/${vehicle.id}-${Date.now()}.${PHOTO_EXT[contentType]}`;
  const bucket = supabase.storage.from(VEHICLE_PHOTO_BUCKET);
  unwrap(await bucket.upload(path, await readPhotoBytes(photo), { contentType, upsert: false }));
  const { data } = bucket.getPublicUrl(path);
  const updated = await updateVehicle(vehicle.id, { photo_url: data.publicUrl });
  const old = photoPath(vehicle.photo_url);
  if (old && old !== path) await bucket.remove([old]);
  return updated;
}

export type VehicleItemInput = {
  area: AreaId;
  name: string;
  brand: string | null;
  cost_cents: number | null;
  installed_on: string | null;
  notes: string | null;
};

export async function vehicleItems(vehicleId: string): Promise<VehicleItem[]> {
  return unwrap(
    await supabase
      .from('vehicle_items')
      .select('id, vehicle_id, area, name, brand, cost_cents, installed_on, notes, created_at')
      .eq('vehicle_id', vehicleId)
      .order('created_at'),
  );
}

export async function addVehicleItem(vehicleId: string, item: VehicleItemInput): Promise<VehicleItem> {
  const row = unwrap<VehicleItem>(await supabase.from('vehicle_items').insert({ ...item, vehicle_id: vehicleId }).select().single());
  track('vehicle_item_added', { area: item.area });
  return row;
}

export async function updateVehicleItem(id: string, item: VehicleItemInput): Promise<VehicleItem> {
  return unwrap(await supabase.from('vehicle_items').update(item).eq('id', id).select().single());
}

export async function deleteVehicleItem(id: string) {
  unwrap(await supabase.from('vehicle_items').delete().eq('id', id));
}

/** Free year/make/model lookup from NHTSA vPIC. Returns the raw JSON; parse with core/garage parseVpic. */
export async function decodeVin(vin: string): Promise<unknown> {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin.trim())}?format=json`);
  if (!res.ok) throw new Error('VIN lookup is not responding. Enter the details by hand.');
  return res.json();
}

// --- Trip planner -----------------------------------------------------------

export type TripInput = {
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  ride_id: string | null;
  vehicle_id: string | null;
};

export type TripWithCounts = Trip & { packed: number; total: number };

export async function myTrips(): Promise<TripWithCounts[]> {
  const uid = await currentUserId();
  type Row = Trip & { trip_items: { checked: boolean }[] | null };
  const rows = unwrap<Row[]>(
    await supabase.from('trips').select('*, trip_items(checked)').eq('owner_id', uid).order('created_at', { ascending: false }),
  );
  return rows.map(({ trip_items, ...trip }) => ({
    ...trip,
    total: trip_items?.length ?? 0,
    packed: (trip_items ?? []).filter((i) => i.checked).length,
  }));
}

export async function getTrip(id: string): Promise<Trip | null> {
  return unwrap(await supabase.from('trips').select('*').eq('id', id).maybeSingle());
}

export async function createTrip(input: TripInput, items: TemplateItem[] = []): Promise<Trip> {
  const owner_id = await currentUserId();
  const trip = unwrap<Trip>(await supabase.from('trips').insert({ ...input, owner_id }).select().single());
  if (items.length) await addTripItems(trip.id, items);
  track('trip_created', { from_ride: !!input.ride_id, items: items.length });
  return trip;
}

export async function updateTrip(id: string, input: Partial<TripInput>): Promise<Trip> {
  return unwrap(await supabase.from('trips').update(input).eq('id', id).select().single());
}

export async function deleteTrip(id: string) {
  unwrap(await supabase.from('trips').delete().eq('id', id));
}

/**
 * The rider's trip for a ride: opens the existing one or starts a new one named after the
 * ride, dated to the meet day, with their ride vehicle, the day-ride basics and anything
 * the organizer listed under Bring or Required.
 */
export async function tripForRide(ride: Ride, vehicleId: string | null): Promise<Trip> {
  const uid = await currentUserId();
  const existing = unwrap<Trip | null>(
    await supabase.from('trips').select('*').eq('owner_id', uid).eq('ride_id', ride.id).maybeSingle(),
  );
  if (existing) return existing;
  const fromRide = itemsFromRideNotes(ride.what_to_bring, ride.required_equipment);
  const basics = templateById('day_ride')!.items;
  const seen = new Set(fromRide.map((i) => i.name.toLowerCase()));
  const items = [...fromRide, ...basics.filter((i) => !seen.has(i.name.toLowerCase()))];
  return createTrip(
    { name: ride.name.slice(0, 120), starts_on: localDate(ride.meet_at), ends_on: null, ride_id: ride.id, vehicle_id: vehicleId },
    items,
  );
}

export async function tripItems(tripId: string): Promise<TripItem[]> {
  return unwrap(
    await supabase.from('trip_items').select('*').eq('trip_id', tripId).order('position').order('created_at'),
  );
}

export async function addTripItems(tripId: string, items: TemplateItem[], startAt = 0): Promise<TripItem[]> {
  if (!items.length) return [];
  return unwrap(
    await supabase
      .from('trip_items')
      .insert(items.map((i, n) => ({
        trip_id: tripId,
        name: i.name,
        category: i.category,
        quantity: i.quantity ?? 1,
        notes: i.notes ?? null,
        position: startAt + n,
      })))
      .select(),
  );
}

export type TripItemInput = { name: string; category: TripCategory; quantity: number; notes: string | null };

export async function updateTripItem(id: string, patch: Partial<TripItemInput> & { checked?: boolean }): Promise<TripItem> {
  return unwrap(await supabase.from('trip_items').update(patch).eq('id', id).select().single());
}

export async function deleteTripItem(id: string) {
  unwrap(await supabase.from('trip_items').delete().eq('id', id));
}

export async function uncheckAll(tripId: string) {
  unwrap(await supabase.from('trip_items').update({ checked: false }).eq('trip_id', tripId).eq('checked', true));
  track('trip_unchecked_all', {});
}

/** Start a fresh trip with the same list, nothing packed, no dates or ride. */
export async function copyTrip(trip: Trip, items: TripItem[]): Promise<Trip> {
  return createTrip(
    { name: `${trip.name} (copy)`.slice(0, 120), starts_on: null, ends_on: null, ride_id: null, vehicle_id: trip.vehicle_id },
    items.map((i) => ({ name: i.name, category: i.category, quantity: i.quantity, notes: i.notes ?? undefined })),
  );
}

// --- Starlink -----------------------------------------------------------------

export type StarlinkSetupInput = Omit<StarlinkSetup, 'id' | 'owner_id' | 'vehicle_id' | 'updated_at'>;

/** The rider's Starlink setup: the general one (vehicleId null) or the one for a vehicle. */
export async function getStarlinkSetup(vehicleId: string | null): Promise<StarlinkSetup | null> {
  const uid = await currentUserId();
  const q = supabase.from('starlink_setups').select('*').eq('owner_id', uid);
  return unwrap(await (vehicleId ? q.eq('vehicle_id', vehicleId) : q.is('vehicle_id', null)).maybeSingle());
}

export async function saveStarlinkSetup(vehicleId: string | null, input: StarlinkSetupInput): Promise<StarlinkSetup> {
  const owner_id = await currentUserId();
  const existing = await getStarlinkSetup(vehicleId);
  const row = existing
    ? unwrap<StarlinkSetup>(await supabase.from('starlink_setups').update(input).eq('id', existing.id).select().single())
    : unwrap<StarlinkSetup>(await supabase.from('starlink_setups').insert({ ...input, owner_id, vehicle_id: vehicleId }).select().single());
  if (!existing) track('starlink_setup_saved', { dish_model: input.dish_model, per_vehicle: !!vehicleId });
  return row;
}
