import { latestStatuses, type StatusRow } from './api';
import { supabase } from './supabase';

/**
 * Ride Mode's status taps (lib/api latestStatuses), plus the ids of taps their riders took back,
 * so a Bluetooth copy of a taken-back EMERGENCY stays taken back (cancels don't travel over
 * Bluetooth).
 */
export async function statusesAndCancels(rideId: string): Promise<{ statuses: StatusRow[]; cancelled: string[] }> {
  const [statuses, cancelled] = await Promise.all([latestStatuses(rideId), cancelledTaps(rideId)]);
  return { statuses, cancelled };
}

async function cancelledTaps(rideId: string): Promise<string[]> {
  // Best effort, and fine before the cancelled_at column exists (an error is just none).
  const { data, error } = await supabase.from('rider_statuses').select('id').eq('ride_id', rideId).not('cancelled_at', 'is', null)
    .order('created_at', { ascending: false }).limit(200);
  if (error || !data) return [];
  return (data as { id: string }[]).map((r) => r.id);
}
