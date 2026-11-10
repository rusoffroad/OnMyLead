// Where riders found OnMyLead (3.0). Home asks new accounts once (components/found-us-card.tsx),
// and the website remembers the ad or link a visitor arrived from and saves it at sign-up.
// Rules: core/found-us.ts. Database: migration 20261110300000_rider_sources.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { APP_STORE_PROVIDER_TOKEN } from '@/constants/site';
import { campaignFromUrl, shouldAskFoundUs, taggedStoreUrl, type Campaign, type FoundUsAnswer } from '@/core/found-us';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

const doneKey = (uid: string) => `onmylead.foundus.${uid}`;
const CAMPAIGN_KEY = 'onmylead.campaign';
const web = Platform.OS === 'web';

/** Saves the answer (or 'skipped'). Never throws; Home hides the card either way. */
export async function saveFoundUs(uid: string, answer: FoundUsAnswer | 'skipped', detail?: string): Promise<void> {
  await AsyncStorage.setItem(doneKey(uid), '1').catch(() => {});
  try {
    await supabase.rpc('set_my_found_us', { p_answer: answer, p_detail: detail ?? null, p_utm: webCampaign(), p_platform: Platform.OS });
  } catch {
    // A server without the 3.0 update: nothing to save it in.
  }
}

/** Whether Home shows the question: new accounts, not answered on any device. */
export function useAskFoundUs(): { ask: boolean; uid: string | null; hide: () => void } {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const createdAt = session?.user.created_at ?? null;
  // Which account the answer is for, so a sign-out or account switch never shows the old one.
  const [askFor, setAskFor] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!uid || !shouldAskFoundUs(createdAt, false)) return;
    (async () => {
      if (await AsyncStorage.getItem(doneKey(uid)).catch(() => '1')) return;
      const { data, error } = await supabase.rpc('my_found_us_answered');
      if (error) return; // not on the server yet: don't ask
      if (data) await AsyncStorage.setItem(doneKey(uid), '1').catch(() => {});
      if (live && !data) setAskFor(uid);
    })();
    return () => {
      live = false;
    };
  }, [uid, createdAt]);
  return { ask: !!uid && askFor === uid, uid, hide: () => setAskFor(null) };
}

// ---- Website: the ad or link a visitor came from ----

function webCampaign(): Campaign | null {
  if (!web) return null;
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { c: Campaign; at: number };
    return Date.now() - v.at < 30 * 86_400_000 ? v.c : null;
  } catch {
    return null;
  }
}

/**
 * At launch on the website: keeps the first tagged visit (30 days), and when a new account signs
 * in there, saves it. On phones there's no landing address, so this does nothing.
 */
export function startFoundUs(): () => void {
  if (!web || typeof window === 'undefined') return () => {};
  try {
    const c = campaignFromUrl(window.location.href);
    if (c && !webCampaign()) window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ c, at: Date.now() }));
  } catch {
    // Storage can be refused in a private window; nothing is lost but the tag.
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const c = webCampaign();
    if (event !== 'SIGNED_IN' || !session || !c || !shouldAskFoundUs(session.user.created_at, false)) return;
    Promise.resolve(supabase.rpc('set_my_found_us', { p_answer: null, p_detail: null, p_utm: c, p_platform: 'web' })).catch(() => {});
  });
  return () => data.subscription.unsubscribe();
}

/** A store link carrying the visitor's campaign, so App Store Connect and Play Console can show it. */
export function storeLink(url: string): string {
  return taggedStoreUrl(url, webCampaign(), APP_STORE_PROVIDER_TOKEN);
}
