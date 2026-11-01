import { useEffect, useState } from 'react';

import { parseBadgeRows, parseMyBadges, topBadge, type BadgeKey, type BadgeLevel, type MyBadges } from '@/core/badges';
import { supabase } from './supabase';

/**
 * The signed-in rider's badges and totals. The server brings them up to date first, so anything
 * earned since (a late track, a trail rating) shows up. Null before the server has badges.
 */
export async function fetchMyBadges(): Promise<MyBadges | null> {
  const { data, error } = await supabase.rpc('my_badges');
  if (error) {
    if (/my_badges|schema cache|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return parseMyBadges(data);
}

/** Clears the New marks once the rider has seen their badges. */
export async function markBadgesSeen(): Promise<void> {
  await supabase.rpc('mark_badges_seen');
}

type Top = { badge: BadgeKey; level: BadgeLevel };
// Badges change rarely, so one fetch per rider per app session is plenty.
const cache = new Map<string, Top | null>();

/** Each rider's top badge, for the small badge beside their name. Riders with none are left out. */
export function useRiderBadges(userIds: string[]): Map<string, Top> {
  const key = [...new Set(userIds)].sort().join(',');
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return;
    const missing = key.split(',').filter((id) => !cache.has(id));
    if (!missing.length) return;
    let live = true;
    supabase
      .from('rider_badges')
      .select('user_id, badge, level')
      .in('user_id', missing)
      .then(({ data, error }) => {
        if (error) return;
        const byUser = new Map<string, { badge: unknown; level: unknown }[]>();
        for (const row of (data ?? []) as { user_id: string; badge: unknown; level: unknown }[]) {
          byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }
        for (const id of missing) cache.set(id, topBadge(parseBadgeRows(byUser.get(id) ?? [])));
        if (live) setVersion((v) => v + 1);
      });
    return () => {
      live = false;
    };
  }, [key]);
  const out = new Map<string, Top>();
  for (const id of key ? key.split(',') : []) {
    const top = cache.get(id);
    if (top) out.set(id, top);
  }
  return out;
}

/** Forget a rider's cached badge (after they earn one), so it shows next time. */
export function forgetRiderBadge(userId: string) {
  cache.delete(userId);
}
