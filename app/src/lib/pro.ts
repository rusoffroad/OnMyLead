import { useSyncExternalStore } from 'react';

import { can, parseProError, type FeatureKey } from '@/core/entitlements';
import { canStartTrip, localToday, type ProBlock } from '@/core/pro';
import { myTrips } from './api';
import { track } from './analytics';
import { currentEntitlements, refreshEntitlements } from './entitlements';
import { supabase } from './supabase';

export { currentEntitlements, refreshEntitlements, useEntitlements } from './entitlements';

/*
 * The Pro prompt and reports for the gated screens. Plan status comes from
 * ./entitlements (the foundation); until the server has the Pro update nothing is gated.
 */

// ---- The Pro prompt ----

let prompt: ProBlock | null = null;
const promptListeners = new Set<() => void>();
function setPrompt(p: ProBlock | null) {
  prompt = p;
  promptListeners.forEach((l) => l());
}

/** Open the Pro prompt for a feature or the ride limit. */
export function showProGate(block: ProBlock) {
  track('pro_gate_shown', { feature: block.kind === 'pro_required' ? block.feature : 'create_ride' });
  setPrompt(block);
}
export function closeProGate() {
  setPrompt(null);
}
export function useProGatePrompt(): ProBlock | null {
  return useSyncExternalStore(
    (l) => {
      promptListeners.add(l);
      return () => promptListeners.delete(l);
    },
    () => prompt,
    () => prompt,
  );
}

/** True when the feature is allowed; otherwise opens the Pro prompt and returns false. */
export function requirePro(feature: FeatureKey): boolean {
  if (can(currentEntitlements(), feature)) return true;
  showProGate(feature === 'create_ride' ? rideLimitBlock() : { kind: 'pro_required', feature });
  return false;
}

/** If the server refused because of the plan, open the prompt and return true; the caller skips its own error. */
export function handleProError(e: unknown): boolean {
  const block = parseProError(e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: string } | null)?.message);
  if (!block) return false;
  showProGate(block);
  refreshEntitlements();
  return true;
}

function rideLimitBlock(): ProBlock {
  const e = currentEntitlements();
  return { kind: 'ride_limit', used: e.ridesCreatedThisMonth, allowance: e.rideAllowance ?? 1 };
}

/**
 * Free keeps one active trip. True when another may start; otherwise opens the Pro prompt.
 * Reads the trips list only when the plan limits it.
 */
export async function requireTripSlot(): Promise<boolean> {
  const ent = currentEntitlements();
  if (can(ent, 'advanced_trip_planning')) return true;
  const trips = await myTrips().catch(() => []);
  if (canStartTrip(ent, trips, localToday())) return true;
  showProGate({ kind: 'pro_required', feature: 'advanced_trip_planning' });
  return false;
}

// ---- Reports ----

/** File a report for the owner to look at. Reporters never see reports again (insert only). */
export async function sendReport(r: { kind: 'ride' | 'rider'; rideId?: string | null; userId?: string | null; reason: string; details?: string }) {
  const { error } = await supabase.from('reports').insert({
    kind: r.kind,
    ride_id: r.rideId ?? null,
    reported_user_id: r.kind === 'rider' ? r.userId : null,
    reason: r.reason,
    details: r.details?.trim() ? r.details.trim().slice(0, 1000) : null,
  });
  if (error) {
    if (/report_limit/.test(error.message)) throw new Error('You’ve sent a lot of reports in the last hour. Try again later.');
    if (error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist/.test(error.message)) throw new Error('Reports are not switched on yet. They start working with the next server update.');
    throw new Error(error.message);
  }
  track('report_sent', { kind: r.kind });
}
