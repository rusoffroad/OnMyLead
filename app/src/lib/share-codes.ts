/**
 * Custom share codes (core/share-code.ts, migration 20261101900000_custom_share_codes.sql): the
 * live "is it free?" check and saving a new code for a ride, a riding group or a friend link.
 * Errors come back as one line a rider can act on.
 */
import { friendlyShareCodeError, shareCodesNotSwitchedOn, type ShareCodeKind, type ShareCodeStatus } from '@/core/share-code';
import { track } from './analytics';
import { supabase } from './supabase';

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

export class ShareCodesOffError extends Error {}

function unwrap<T>(res: Res<T>, kind: ShareCodeKind): T {
  if (res.error) {
    const msg = friendlyShareCodeError(res.error.message, kind);
    if (shareCodesNotSwitchedOn(res.error.message, res.error.code)) throw new ShareCodesOffError(msg);
    throw new Error(msg);
  }
  return res.data as T;
}

/** Is this code free? `id` is the ride or group being changed, so its own code reads "yours". */
export async function shareCodeStatus(kind: ShareCodeKind, code: string, id?: string | null): Promise<ShareCodeStatus> {
  return unwrap<ShareCodeStatus>(await supabase.rpc('share_code_status', { p_kind: kind, p_code: code, p_id: id ?? null }), kind);
}

/** A ride's new code (organizers only). The old link and QR code stop working. */
export async function setRideCode(rideId: string, code: string): Promise<string> {
  const saved = unwrap<string>(await supabase.rpc('set_ride_code', { p_ride: rideId, p_code: code }), 'ride');
  track('share_code_set', { kind: 'ride' });
  return saved;
}

/** A riding group's new code (its owner only). */
export async function setGroupCode(groupId: string, code: string): Promise<string> {
  const saved = unwrap<string>(await supabase.rpc('set_group_code', { p_group: groupId, p_code: code }), 'group');
  track('share_code_set', { kind: 'group' });
  return saved;
}

/** My friend link's new code. */
export async function setFriendCode(code: string): Promise<string> {
  const saved = unwrap<string>(await supabase.rpc('set_friend_code', { p_code: code }), 'friend');
  track('share_code_set', { kind: 'friend' });
  return saved;
}
