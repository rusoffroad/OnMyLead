import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { appleFullName } from '@/core/auth-link';
import { myRideName, saveRideName } from './api';
import { supabase } from './supabase';

/**
 * Sign in with Apple, the iPhone's own sheet (Face ID, no browser). Apple's token goes straight to
 * Supabase, which only needs the app's bundle ID listed on its Apple provider. The nonce proves the
 * token was made for this sign-in: Apple gets its SHA-256, Supabase gets the original to compare.
 */
export async function signInWithApple(): Promise<'signed_in' | 'cancelled'> {
  if (Platform.OS !== 'ios') throw new Error('Sign in with Apple works on iPhone.');
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple didn’t send a sign-in token. Try again.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
  if (error) throw error;
  // Apple shares the name only the first time; keep it so riders see who joined.
  const name = appleFullName(credential.fullName);
  if (name) {
    await supabase.auth.updateUser({ data: { full_name: name, name } }).catch(() => {});
    // The profile row was made a moment ago, before the name arrived.
    if (!(await myRideName().catch(() => 'unknown'))) await saveRideName(name).catch(() => {});
  }
  return 'signed_in';
}
