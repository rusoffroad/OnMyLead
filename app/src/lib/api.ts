import { fuzzLocation } from '@/core/geo';
import type { BubblePreset } from '@/core/bubble';
import type { JoinPolicy, MemberStatus } from '@/core/joining';
import { startShare, type ShareScope } from '@/core/sharing';
import { track } from './analytics';
import { supabase } from './supabase';
import type {
  Position, RegroupPoint, Ride, RideMember, RidePrivateDetails, RiderStatusKind, Visibility,
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
