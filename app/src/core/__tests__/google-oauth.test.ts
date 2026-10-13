import { describe, expect, it } from 'vitest';

import { base64Url, googleAuthUrl, googleRedirectScheme, googleRedirectUri, readGoogleCallback } from '../google-oauth';

const ID = '1234-abcd.apps.googleusercontent.com';

describe('Google sign-in on iPhone', () => {
  it('uses Google’s callback scheme for the iOS client', () => {
    expect(googleRedirectScheme(ID)).toBe('com.googleusercontent.apps.1234-abcd');
    expect(googleRedirectUri(ID)).toBe('com.googleusercontent.apps.1234-abcd:/oauthredirect');
    expect(googleRedirectScheme('not-a-client-id')).toBeNull();
  });

  it('asks for a code with PKCE, a nonce and the account picker', () => {
    const u = new URL(googleAuthUrl({ clientId: ID, redirectUri: googleRedirectUri(ID)!, codeChallenge: 'cc', state: 'st', nonceHash: 'nh' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: ID, response_type: 'code', code_challenge: 'cc', code_challenge_method: 'S256', state: 'st', nonce: 'nh', scope: 'openid email profile',
    });
  });

  it('makes base64 safe for URLs', () => {
    expect(base64Url('ab+/cd==')).toBe('ab-_cd');
  });

  it('reads Google’s answer and rejects one for another request', () => {
    const r = 'com.googleusercontent.apps.1234-abcd:/oauthredirect';
    expect(readGoogleCallback(`${r}?state=st&code=xyz`, 'st')).toEqual({ kind: 'code', code: 'xyz' });
    expect(readGoogleCallback(`${r}?state=other&code=xyz`, 'st').kind).toBe('error');
    expect(readGoogleCallback(`${r}?error=access_denied&state=st`, 'st')).toEqual({ kind: 'cancelled' });
  });
});
