import type { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { APP_AUTH_CALLBACK, APP_RESET_PASSWORD, socialProviders, type AuthLink, type SocialProvider } from '@/core/auth-link';
import { isBackendConfigured, supabase, supabaseUrl, supabaseKey } from './supabase';

export type { SocialProvider } from '@/core/auth-link';

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

/**
 * The social buttons Supabase has switched on, read from its public settings. Empty until the
 * answer arrives (or when it can't be reached), so the screen never shows a button that won't work.
 * The website passes 'ios' to describe what the iPhone app offers.
 */
export function useSocialProviders(platform: string = Platform.OS): SocialProvider[] {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  useEffect(() => {
    if (!isBackendConfigured) return;
    let live = true;
    fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (live) setProviders(socialProviders(settings, platform, { webApple: process.env.EXPO_PUBLIC_WEB_APPLE_SIGN_IN === '1' }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [platform]);
  return providers;
}

/**
 * Sign in with Google or Facebook (or Apple on the website) through Supabase Auth. In the app this
 * opens a browser sheet that closes itself on onmylead://auth-callback; on the web the whole page
 * goes to the provider and comes back to /auth-callback.
 * Resolves 'cancelled' when the rider closes the sheet.
 */
export async function signInWithProvider(provider: SocialProvider): Promise<'signed_in' | 'cancelled' | 'redirected'> {
  const redirectTo = Platform.OS === 'web' ? webUrl('/auth-callback') : APP_AUTH_CALLBACK;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw error;
  if (Platform.OS === 'web' || !data.url) return 'redirected';
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  const url = new URL(result.url);
  const failed = url.searchParams.get('error_description');
  if (failed) throw new Error(failed.replace(/\+/g, ' '));
  const code = url.searchParams.get('code');
  if (!code) return 'cancelled';
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return 'signed_in';
}

function webUrl(path: string) {
  return typeof window !== 'undefined' ? `${window.location.origin}${path}` : `https://onmylead.com${path}`;
}

/**
 * Where an emailed link sends the rider back to when Supabase's built-in email is used. The app
 * uses its own scheme, spelled exactly as it is allow-listed in Supabase: anything else (a dev
 * build's onmylead://192.168.1.5:8081/auth-callback, say) fails the allow-list and Supabase falls
 * back to the Site URL, which is why the verify button used to open the website.
 * Our branded templates ignore this and link to https://onmylead.com/auth-callback, which opens
 * the app through Universal Links when it is installed.
 */
function emailRedirectUrl() {
  return Platform.OS === 'web' ? webUrl('/auth-callback') : APP_AUTH_CALLBACK;
}

/**
 * Finishes an emailed or OAuth link that landed on /auth-callback or /reset-password. Returns the
 * kind of link it was so the screen can say what happened.
 */
export async function completeAuthLink(link: AuthLink) {
  if (link.kind === 'token') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    if (error) throw error;
  } else if (link.kind === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(link.code);
    if (error) throw error;
  }
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

/** Email + password: create an account. Supabase emails a link to confirm the address. */
export async function signUpWithPassword(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: emailRedirectUrl(), data: { full_name: name, name } },
  });
  if (error) throw error;
  // With email confirmation on, there is no session until the rider taps the link.
  return { needsConfirmation: !data.session };
}

/** Email + password: sign in. */
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Emails a link that opens /reset-password, where the rider picks a new password. */
export async function sendPasswordReset(email: string) {
  const redirectTo = Platform.OS === 'web' ? webUrl('/reset-password') : APP_RESET_PASSWORD;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
