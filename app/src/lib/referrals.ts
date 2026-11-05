/**
 * Refer a friend (core/referrals and migration 20261103800000_referrals.sql), on every device.
 *
 * - A friend link opened while signed out is remembered on the device; once that rider signs in
 *   (normally a brand-new account), the invite is recorded. The server decides whether it counts.
 * - my_referrals() feeds the Invite Friends screen and the reward card on the Pro screen.
 * - Claiming hands out the discount the store way (core/referrals explains why).
 * Until the migration runs, everything fails soft: the screens show nothing about referrals.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import {
  NO_REFERRALS, parseClaim, parseLinkResult, parseMyReferrals,
  type ClaimResult, type LinkResult, type MyReferrals,
} from '@/core/referrals';
import type { Store } from '@/core/entitlements';
import { track } from './analytics';
import { isBackendConfigured, supabase } from './supabase';

const PENDING_KEY = 'onmylead.referral.pending';
/** A link opened more than this long ago no longer counts once the rider signs in. */
const PENDING_MS = 7 * 24 * 60 * 60 * 1000;

const missing = (e: { message?: string; code?: string } | null) =>
  !!e && (['42883', 'PGRST202'].includes(e.code ?? '') || /my_referrals|claim_referral|schema cache|does not exist/i.test(e.message ?? ''));

/** Remembers the friend link a signed-out rider opened, for after they sign in. */
export async function rememberInviteCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: Date.now() })).catch(() => {});
}

/** Records the invite for the signed-in rider. Null when the server can't (not set up yet, offline). */
export async function linkReferral(code: string): Promise<LinkResult | null> {
  if (!isBackendConfigured) return null;
  const { data, error } = await supabase.rpc('claim_referral', { p_code: code });
  if (error) return null;
  const r = parseLinkResult(data);
  if (r === 'linked') track('referral_linked');
  return r;
}

/** The remembered friend link, if a rider just signed in after opening one. */
export async function claimPendingReferral(): Promise<LinkResult | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!raw) return null;
  let pending: { code?: unknown; at?: unknown } | null = null;
  try {
    pending = JSON.parse(raw);
  } catch {
    pending = null;
  }
  const code = typeof pending?.code === 'string' ? pending.code : null;
  const at = typeof pending?.at === 'number' ? pending.at : 0;
  if (!code || Date.now() - at > PENDING_MS) {
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return null;
  }
  const r = await linkReferral(code);
  // Keep it only when the server couldn't answer (offline); every real answer is final.
  if (r) await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  return r;
}

let started = false;
/** Sends a remembered friend link once the rider is signed in. Called once from the root layout. */
export function startReferrals(): () => void {
  if (started || !isBackendConfigured) return () => {};
  started = true;
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) claimPendingReferral().catch(() => {});
  }).catch(() => {});
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) claimPendingReferral().catch(() => {});
  });
  return () => {
    data.subscription.unsubscribe();
    started = false;
  };
}

export async function fetchMyReferrals(): Promise<MyReferrals> {
  if (!isBackendConfigured) return NO_REFERRALS;
  const { data, error } = await supabase.rpc('my_referrals');
  if (error) {
    if (missing(error)) return NO_REFERRALS;
    throw new Error(error.message);
  }
  return parseMyReferrals(data);
}

/** My invites and reward; reloads when asked. */
export function useMyReferrals(enabled = true) {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await fetchMyReferrals());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchMyReferrals().then(
      (d) => current && (setData(d), setError(null)),
      (e) => current && setError((e as Error).message),
    );
    return () => {
      current = false;
    };
  }, [enabled]);
  return { data, error, reload };
}

export async function claimReward(store: Store): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_referral_reward', { p_store: store });
  if (error) return { kind: 'error', error: 'unknown' };
  const r = parseClaim(data);
  if (r.kind !== 'error') track('referral_claimed', { kind: r.kind });
  return r;
}

/** Opens Apple's redeem page with the code filled in. */
export async function openAppleRedeem(url: string): Promise<boolean> {
  return Linking.openURL(url).then(() => true, () => false);
}

/** Google Play subscribers: asks the server to push the next bill back. */
export async function applyPlayDeferral(): Promise<{ ok: boolean; expiresAt: string | null }> {
  const { data, error } = await supabase.functions.invoke('referral-defer', { body: {} });
  if (error || !data?.deferred) return { ok: false, expiresAt: null };
  return { ok: true, expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null };
}
