/**
 * Sign in with Google inside the iPhone app, straight with Google instead of through Supabase's
 * web page. Google's sign-in sheet then names the app ("to continue to OnMyLead") instead of
 * Supabase's server address, because the request comes from our own iOS client. Google hands back
 * an ID token, which Supabase accepts with signInWithIdToken (the iOS client ID must be listed on
 * Supabase's Google provider). Pure helpers here; the flow is in lib/google-sign-in.ts.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc", Google's iOS callback scheme. */
export function googleRedirectScheme(iosClientId: string): string | null {
  const m = /^([\w-]+)\.apps\.googleusercontent\.com$/.exec(iosClientId.trim());
  return m ? `com.googleusercontent.apps.${m[1]}` : null;
}

export function googleRedirectUri(iosClientId: string): string | null {
  const scheme = googleRedirectScheme(iosClientId);
  return scheme ? `${scheme}:/oauthredirect` : null;
}

/** Base64 to base64url without padding (PKCE and nonces). */
export function base64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function googleAuthUrl(o: { clientId: string; redirectUri: string; codeChallenge: string; state: string; nonceHash: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: o.codeChallenge,
    code_challenge_method: 'S256',
    state: o.state,
    nonce: o.nonceHash,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

export type GoogleCallback = { kind: 'code'; code: string } | { kind: 'cancelled' } | { kind: 'error'; message: string };

/** Reads Google's redirect back to the app, checking it answers this request. */
export function readGoogleCallback(url: string, state: string): GoogleCallback {
  const q = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
  const error = q.get('error');
  if (error === 'access_denied') return { kind: 'cancelled' };
  if (error) return { kind: 'error', message: 'Google couldn’t sign you in. Try again.' };
  if (q.get('state') !== state) return { kind: 'error', message: 'That sign-in didn’t match. Try again.' };
  const code = q.get('code');
  return code ? { kind: 'code', code } : { kind: 'error', message: 'Google didn’t send a sign-in code. Try again.' };
}
