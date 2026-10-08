import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True once the backend keys are set in .env (see .env.example). */
export const isBackendConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

let channelSeq = 0;
/**
 * A realtime channel with a topic no other screen is using. supabase.channel() hands back the
 * existing channel when the topic is already taken, and adding listeners to a channel that is
 * already subscribed throws. The ride page and Ride Mode both watch the same ride chat, so
 * shared topics crashed the app when Ride Mode opened on top of the ride page.
 */
export const newChannel = (name: string) => supabase.channel(`${name}-${++channelSeq}`);
