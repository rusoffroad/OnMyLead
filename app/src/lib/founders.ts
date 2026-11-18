import { useEffect, useState } from 'react';

import { founderIdsFrom } from '@/core/badges';
import { supabase } from './supabase';

/**
 * Who holds the OnMyLead Founder honor, for the "OnMyLead Founder" tag beside their name. One
 * small fetch per app session (rider_badges is readable by every signed-in rider); until it
 * answers, or when signed out, nobody is tagged.
 */
let founders: Set<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.resolve(
      supabase
        .from('rider_badges')
        .select('user_id, badge')
        .eq('badge', 'founder')
        .then(({ data, error }) => {
          if (error) {
            loading = null; // try again next time a name shows (e.g. after signing in)
            return;
          }
          founders = founderIdsFrom(data);
          for (const fn of listeners) fn();
        }),
    );
  }
  return loading;
}

/** Is this rider the OnMyLead Founder? */
export function useIsFounder(userId: string | null | undefined): boolean {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    listeners.add(fn);
    if (!founders) void load();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return !!userId && !!founders?.has(userId);
}
