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
  // Kept in state (not read from the module) so the React Compiler re-renders when it loads.
  const [ids, setIds] = useState<Set<string> | null>(founders);
  useEffect(() => {
    const fn = () => setIds(founders);
    listeners.add(fn);
    if (founders) fn();
    else void load();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return !!userId && !!ids?.has(userId);
}
