/**
 * Riding groups, group invites to rides, and Follow This Leader (see core/groups and migration
 * 20261017430000_riding_groups.sql). Until that migration runs, every call here throws
 * NotSwitchedOnError, and the screens say so.
 */
import { router } from 'expo-router';

import { cleanGroupName, isGroupsNotSwitchedOn, NOT_SWITCHED_ON, sortRideMates, type RideMate } from '@/core/groups';
import { shownName } from '@/core/profile';
import { track } from './analytics';
import { supabase } from './supabase';
import type { Ride } from './types';

export class NotSwitchedOnError extends Error {
  constructor() {
    super(NOT_SWITCHED_ON);
  }
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

function unwrap<T>(res: Res<T>): T {
  if (res.error) {
    if (isGroupsNotSwitchedOn(res.error.message, res.error.code)) throw new NotSwitchedOnError();
    throw new Error(res.error.message);
  }
  return res.data as T;
}

async function me(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in first.');
  return id;
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = unwrap<{ id: string; display_name: string }[]>(await supabase.from('profiles').select('id, display_name').in('id', unique));
  return new Map(rows.map((r) => [r.id, shownName(r.display_name)]));
}

// --- Groups -----------------------------------------------------------------

export type GroupRider = { id: string; name: string; isOwner: boolean };
export type RidingGroup = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  inviteCode: string;
  /** Everyone in the group, owner first. */
  riders: GroupRider[];
  mine: boolean;
};

type GroupRow = { id: string; name: string; owner_id: string; invite_code: string; created_at: string };

async function withRiders(groups: GroupRow[], uid: string): Promise<RidingGroup[]> {
  if (!groups.length) return [];
  const members = unwrap<{ group_id: string; user_id: string }[]>(
    await supabase.from('riding_group_members').select('group_id, user_id').in('group_id', groups.map((g) => g.id)).order('created_at'),
  );
  const nameOf = await names([...groups.map((g) => g.owner_id), ...members.map((m) => m.user_id)]);
  return groups.map((g) => {
    const ownerName = nameOf.get(g.owner_id) ?? shownName('');
    const others = members
      .filter((m) => m.group_id === g.id)
      .map((m) => ({ id: m.user_id, name: nameOf.get(m.user_id) ?? shownName(''), isOwner: false }));
    return {
      id: g.id,
      name: g.name,
      ownerId: g.owner_id,
      ownerName,
      inviteCode: g.invite_code,
      riders: [{ id: g.owner_id, name: ownerName, isOwner: true }, ...others],
      mine: g.owner_id === uid,
    };
  });
}

/** Every group you run or are in, yours first. */
export async function myGroups(): Promise<RidingGroup[]> {
  const uid = await me();
  const rows = unwrap<GroupRow[]>(await supabase.from('riding_groups').select('*').order('created_at'));
  const groups = await withRiders(rows, uid);
  return [...groups.filter((g) => g.mine), ...groups.filter((g) => !g.mine)];
}

export async function getGroup(id: string): Promise<RidingGroup | null> {
  const uid = await me();
  const row = unwrap<GroupRow | null>(await supabase.from('riding_groups').select('*').eq('id', id).maybeSingle());
  return row ? (await withRiders([row], uid))[0] : null;
}

/**
 * The only way into making a new group (the Riding Groups screen and the ride page both use it),
 * so a plan check can sit here in one place.
 */
export function openNewGroup() {
  router.push('/groups/new');
}

export async function createGroup(name: string, riderIds: string[]): Promise<string> {
  const uid = await me();
  const group = unwrap<GroupRow>(await supabase.from('riding_groups').insert({ owner_id: uid, name: cleanGroupName(name) }).select().single());
  if (riderIds.length) unwrap(await supabase.rpc('add_group_members', { p_group: group.id, p_users: riderIds }));
  track('riding_group_created', { riders: riderIds.length });
  return group.id;
}

export async function renameGroup(id: string, name: string) {
  unwrap(await supabase.from('riding_groups').update({ name: cleanGroupName(name) }).eq('id', id));
}

export async function addGroupRiders(id: string, riderIds: string[]): Promise<number> {
  const added = unwrap<number>(await supabase.rpc('add_group_members', { p_group: id, p_users: riderIds }));
  track('riding_group_riders_added', { riders: added });
  return added;
}

/** The owner removes someone, or (with your own id) you leave. */
export async function removeGroupRider(id: string, userId: string) {
  unwrap(await supabase.from('riding_group_members').delete().eq('group_id', id).eq('user_id', userId));
}

export async function leaveGroup(id: string) {
  await removeGroupRider(id, await me());
  track('riding_group_left');
}

export async function deleteGroup(id: string) {
  unwrap(await supabase.from('riding_groups').delete().eq('id', id));
  track('riding_group_deleted');
}

export async function resetGroupLink(id: string): Promise<string> {
  return unwrap<string>(await supabase.rpc('reset_group_link', { p_group: id }));
}

export type GroupPreview = { id: string; name: string; owner_name: string; riders: number; is_member: boolean };

/** What the group link shows before joining. Null when the link is wrong or was replaced. */
export async function groupPreview(code: string): Promise<GroupPreview | null> {
  const rows = unwrap<GroupPreview[]>(await supabase.rpc('group_preview', { p_code: code }));
  return rows[0] ?? null;
}

export async function joinGroup(code: string): Promise<string> {
  const id = unwrap<string>(await supabase.rpc('join_group', { p_code: code }));
  track('riding_group_joined_by_link');
  return id;
}

/** People you have been on a ride with, the ones you ride with most first. */
export async function rideMates(): Promise<RideMate[]> {
  const uid = await me();
  type Mine = { ride_id: string; rides: { meet_at: string } | null };
  const mine = unwrap<Mine[]>(
    (await supabase.from('ride_members').select('ride_id, rides(meet_at)').eq('user_id', uid).eq('status', 'joined')) as unknown as Res<Mine[]>,
  );
  if (!mine.length) return [];
  const meetAt = new Map(mine.map((m) => [m.ride_id, m.rides?.meet_at ?? null]));
  const rows = unwrap<{ ride_id: string; user_id: string }[]>(
    await supabase.from('ride_members').select('ride_id, user_id').in('ride_id', [...meetAt.keys()]).eq('status', 'joined').neq('user_id', uid),
  );
  const nameOf = await names(rows.map((r) => r.user_id));
  const byId = new Map<string, RideMate>();
  for (const r of rows) {
    const at = meetAt.get(r.ride_id) ?? null;
    const m = byId.get(r.user_id) ?? { id: r.user_id, name: nameOf.get(r.user_id) ?? shownName(''), ridesTogether: 0, lastRideAt: null };
    m.ridesTogether += 1;
    if (at && (!m.lastRideAt || at > m.lastRideAt)) m.lastRideAt = at;
    byId.set(r.user_id, m);
  }
  return sortRideMates([...byId.values()]);
}

// --- Inviting a group to a ride ----------------------------------------------

/** Invite everyone in a group to a ride you organize. Returns how many were newly invited. */
export async function inviteGroupToRide(rideId: string, groupId: string): Promise<number> {
  const count = unwrap<number>(await supabase.rpc('invite_group_to_ride', { p_ride: rideId, p_group: groupId }));
  track('ride_group_invited', { invited: count });
  return count;
}

export async function declineRideInvite(rideId: string) {
  unwrap(await supabase.rpc('decline_ride_invite', { p_ride: rideId }));
  track('ride_invite_declined');
}

/** Upcoming rides you organize, to invite a group to. */
export async function ridesIOrganize(): Promise<Ride[]> {
  const uid = await me();
  type Row = { role: string; rides: Ride | null };
  const rows = unwrap<Row[]>(
    (await supabase
      .from('ride_members')
      .select('role, rides(*)')
      .eq('user_id', uid)
      .eq('status', 'joined')
      .in('role', ['organizer', 'co_organizer'])) as unknown as Res<Row[]>,
  );
  return rows
    .map((r) => r.rides)
    .filter((r): r is Ride => !!r && (r.status === 'scheduled' || r.status === 'live'))
    .sort((a, b) => a.meet_at.localeCompare(b.meet_at));
}

// --- Follow This Leader -------------------------------------------------------

export type Followed = { id: string; name: string };

export async function leadersIFollow(): Promise<Followed[]> {
  const uid = await me();
  const rows = unwrap<{ leader_id: string }[]>(await supabase.from('leader_follows').select('leader_id').eq('follower_id', uid).order('created_at'));
  const nameOf = await names(rows.map((r) => r.leader_id));
  return rows.map((r) => ({ id: r.leader_id, name: nameOf.get(r.leader_id) ?? shownName('') }));
}

/** Upcoming public rides posted by leaders you follow, soonest first. Private rides never show. */
export async function followedLeadersRides(leaderIds: string[]): Promise<Ride[]> {
  if (!leaderIds.length) return [];
  return unwrap<Ride[]>(
    await supabase
      .from('rides')
      .select('*')
      .in('organizer_id', leaderIds)
      .eq('visibility', 'public')
      .eq('status', 'scheduled')
      .gte('meet_at', new Date().toISOString())
      .order('meet_at')
      .limit(20),
  );
}

export async function myFollowerCount(): Promise<number> {
  const uid = await me();
  const res = await supabase.from('leader_follows').select('follower_id', { count: 'exact', head: true }).eq('leader_id', uid);
  unwrap(res as Res<unknown>);
  return res.count ?? 0;
}

/** For each of these riders: their name, and whether you follow them. */
export async function followStates(leaderIds: string[]): Promise<{ id: string; name: string; following: boolean }[]> {
  if (!leaderIds.length) return [];
  const uid = await me();
  const nameOf = await names(leaderIds);
  const rows = unwrap<{ leader_id: string }[]>(
    await supabase.from('leader_follows').select('leader_id').eq('follower_id', uid).in('leader_id', leaderIds),
  );
  const on = new Set(rows.map((r) => r.leader_id));
  return leaderIds.map((id) => ({ id, name: nameOf.get(id) ?? shownName(''), following: on.has(id) }));
}

export async function followLeader(leaderId: string) {
  unwrap(await supabase.rpc('follow_leader', { p_leader: leaderId }));
  track('leader_followed');
}

export async function unfollowLeader(leaderId: string) {
  const uid = await me();
  unwrap(await supabase.from('leader_follows').delete().eq('follower_id', uid).eq('leader_id', leaderId));
  track('leader_unfollowed');
}
