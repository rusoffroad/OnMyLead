import { useEffect, useState } from 'react';

import { parseSocialProfiles, type SocialProfile } from '@/core/social-profile';
import { supabase } from './supabase';

/**
 * Copies the rider's Apple, Google or Facebook sign-in into their social profile (the server reads
 * it from the account, so nobody can claim one they didn't sign in with). Null when they have none,
 * or before the server has the feature.
 */
export async function syncSocialProfile(): Promise<SocialProfile | null> {
  const { data, error } = await supabase.rpc('sync_social_profile');
  if (error || !data) return null;
  return parseSocialProfiles([data]).values().next().value ?? null;
}

export async function setSocialProfileShown(shown: boolean): Promise<SocialProfile | null> {
  const { data, error } = await supabase.rpc('set_social_profile_shown', { p_shown: shown });
  if (error) throw error;
  return parseSocialProfiles([data]).values().next().value ?? null;
}

/**
 * The social profiles these riders chose to show, among those the server lets this rider see
 * (riders who share a ride or group with them, minus blocks). Hidden ones never come back.
 */
export function useSocialProfiles(userIds: string[]): Map<string, SocialProfile> {
  const [profiles, setProfiles] = useState<Map<string, SocialProfile>>(() => new Map());
  const key = [...new Set(userIds)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    supabase
      .from('rider_social_profiles')
      .select('user_id, provider, name, photo_url, shown')
      .in('user_id', key.split(','))
      .eq('shown', true)
      .then(({ data }) => {
        if (live) setProfiles(parseSocialProfiles(data));
      });
    return () => {
      live = false;
    };
  }, [key]);
  return profiles;
}
