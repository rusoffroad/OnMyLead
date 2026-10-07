import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { isBackendConfigured, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isBackendConfigured);

  useEffect(() => {
    if (!isBackendConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export type SocialProvider = 'google' | 'apple' | 'facebook';

/** Sign in with Google, Apple or Facebook through Supabase Auth. */
export async function signInWithProvider(provider: SocialProvider) {
  const redirectTo = Linking.createURL('/auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw error;
  if (Platform.OS === 'web' || !data.url) return;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const code = new URL(result.url).searchParams.get('code');
  if (code) await supabase.auth.exchangeCodeForSession(code);
}

/** Phone or email: sends a one-time code. */
/**
 * Where the sign-in link in the email lands. Supabase's free email sender can't use a custom
 * template, so its email carries a link (not the code); on the web the link signs the rider in
 * through /auth-callback in the same browser.
 */
function emailRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth-callback`;
  return Linking.createURL('/auth-callback');
}

export async function sendCode(target: string) {
  const isEmail = target.includes('@');
  const { error } = isEmail
    ? await supabase.auth.signInWithOtp({ email: target, options: { emailRedirectTo: emailRedirectUrl() } })
    : await supabase.auth.signInWithOtp({ phone: target });
  if (error) throw error;
}

export async function verifyCode(target: string, token: string) {
  const isEmail = target.includes('@');
  const { error } = isEmail
    ? await supabase.auth.verifyOtp({ email: target, token, type: 'email' })
    : await supabase.auth.verifyOtp({ phone: target, token, type: 'sms' });
  if (error) throw error;
}

export async function setDisplayName(name: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id);
}
