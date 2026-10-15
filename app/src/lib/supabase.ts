import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { loggedFetch } from '@/lib/app-log';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseUrl = url ?? 'http://localhost:54321';
export const supabaseKey = anonKey ?? 'missing-anon-key';

/** True once the backend keys are set in .env (see .env.example). */
export const isBackendConfigured = Boolean(url && anonKey);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // /auth-callback and /reset-password finish emailed and OAuth links themselves (completeAuthLink),
    // on every platform, so a link is never exchanged twice.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  // Failed requests go in the activity log a bug report carries (lib/app-log.ts).
  global: { fetch: loggedFetch },
});

let channelSeq = 0;
/**
 * A realtime channel with a topic no other screen is using. supabase.channel() hands back the
 * existing channel when the topic is already taken, and adding listeners to a channel that is
 * already subscribed throws. The ride page and Ride Mode both watch the same ride chat, so
 * shared topics crashed the app when Ride Mode opened on top of the ride page.
 */
export const newChannel = (name: string) => supabase.channel(`${name}-${++channelSeq}`);
