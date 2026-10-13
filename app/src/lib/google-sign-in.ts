import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { base64Url, GOOGLE_TOKEN_URL, googleAuthUrl, googleRedirectUri, readGoogleCallback } from '@/core/google-oauth';
import { supabase } from './supabase';

/** OnMyLead's iOS OAuth client in Google Cloud (public, like the bundle ID). Unset: the browser flow is used. */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';

/** True when the iPhone app can sign in with Google directly (see core/google-oauth.ts). */
export const nativeGoogleReady = Platform.OS === 'ios' && !!googleRedirectUri(IOS_CLIENT_ID);

const randomUrlSafe = (bytes: number) => base64Url(btoa(String.fromCharCode(...Crypto.getRandomBytes(bytes))));
const sha256Url = async (s: string) => base64Url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s, { encoding: Crypto.CryptoEncoding.BASE64 }));
const sha256Hex = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

/**
 * Google's sign-in sheet for OnMyLead's own iOS client, then Supabase with the ID token Google
 * returns. PKCE protects the code; the nonce ties the token to this sign-in (Google gets its
 * SHA-256, Supabase gets the original to compare).
 */
export async function signInWithGoogleNative(): Promise<'signed_in' | 'cancelled'> {
  const redirectUri = googleRedirectUri(IOS_CLIENT_ID);
  if (!redirectUri) throw new Error('Google sign-in isn’t set up in this build.');
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(16);
  const nonce = randomUrlSafe(24);
  const url = googleAuthUrl({ clientId: IOS_CLIENT_ID, redirectUri, codeChallenge: await sha256Url(verifier), state, nonceHash: await sha256Hex(nonce) });

  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  if (result.type !== 'success') return 'cancelled';
  const back = readGoogleCallback(result.url, state);
  if (back.kind === 'cancelled') return 'cancelled';
  if (back.kind === 'error') throw new Error(back.message);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: IOS_CLIENT_ID, code: back.code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri }).toString(),
  });
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!res.ok || !tokens.id_token) throw new Error('Google didn’t finish signing you in. Try again.');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: tokens.id_token, nonce });
  if (error) throw error;
  return 'signed_in';
}
