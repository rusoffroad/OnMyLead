import { describe, expect, it } from 'vitest';

import {
  afterAuthLink,
  androidAuthHandoff,
  androidIntentUrl,
  appAuthLink,
  appleFullName,
  APP_AUTH_CALLBACK,
  parseAuthLink,
  socialProviders,
  webOnlyUrl,
} from '../auth-link';

describe('emailed sign-in links', () => {
  it('reads our branded links, which carry a token that works on any device', () => {
    expect(parseAuthLink({ token_hash: 'abc', type: 'signup' })).toEqual({ kind: 'token', tokenHash: 'abc', type: 'signup' });
    expect(parseAuthLink({ token_hash: 'abc', type: 'recovery' })).toEqual({ kind: 'token', tokenHash: 'abc', type: 'recovery' });
  });

  it('ignores a token with a type Supabase would refuse', () => {
    expect(parseAuthLink({ token_hash: 'abc', type: 'sms' })).toEqual({ kind: 'none' });
  });

  it('reads the built-in email and OAuth code', () => {
    expect(parseAuthLink({ code: 'xyz' })).toEqual({ kind: 'code', code: 'xyz', reset: false });
    expect(parseAuthLink({ code: 'xyz' }, { reset: true })).toEqual({ kind: 'code', code: 'xyz', reset: true });
  });

  it('turns an expired link into plain words', () => {
    const link = parseAuthLink({ error: 'access_denied', error_code: 'otp_expired', error_description: 'Email+link+is+invalid+or+has+expired' });
    expect(link.kind).toBe('error');
    expect(link.kind === 'error' && link.message).toMatch(/expired or was already used/);
  });

  it('sends a password reset to the new-password screen and everything else home', () => {
    expect(afterAuthLink({ kind: 'token', tokenHash: 'a', type: 'recovery' })).toBe('/reset-password');
    expect(afterAuthLink({ kind: 'code', code: 'a', reset: true })).toBe('/reset-password');
    expect(afterAuthLink({ kind: 'token', tokenHash: 'a', type: 'signup' })).toBe('/');
  });

  it('hands the same token to the app from the website', () => {
    expect(appAuthLink({ kind: 'token', tokenHash: 'a b', type: 'magiclink' })).toBe(`${APP_AUTH_CALLBACK}?token_hash=a%20b&type=magiclink`);
    expect(appAuthLink({ kind: 'code', code: 'a', reset: false })).toBe('onmylead://sign-in');
  });

  it('asks Supabase to come back to the exact allow-listed address', () => {
    expect(APP_AUTH_CALLBACK).toBe('onmylead://auth-callback');
  });
});

describe('social sign-in buttons', () => {
  const all = { external: { apple: true, google: true, facebook: true, github: true, email: true } };

  it('shows only providers switched on in Supabase, Apple first', () => {
    expect(socialProviders(all, 'ios')).toEqual(['apple', 'google', 'facebook']);
    expect(socialProviders({ external: { google: true } }, 'ios')).toEqual(['google']);
    expect(socialProviders({ external: { apple: false, google: false } }, 'ios')).toEqual([]);
  });

  it('keeps Apple to the iPhone until the website has its own Apple setup', () => {
    expect(socialProviders(all, 'web')).toEqual(['google', 'facebook']);
    expect(socialProviders(all, 'web', { webApple: true })).toEqual(['apple', 'google', 'facebook']);
    expect(socialProviders(all, 'android')).toEqual(['google', 'facebook']);
  });

  it('shows nothing when the settings can’t be read', () => {
    expect(socialProviders(null, 'ios')).toEqual([]);
    expect(socialProviders({ external: 'x' }, 'ios')).toEqual([]);
  });

  it('keeps the name Apple sends the first time', () => {
    expect(appleFullName({ givenName: 'Chris', familyName: ' M ' })).toBe('Chris M');
    expect(appleFullName({ givenName: null, familyName: null })).toBeNull();
    expect(appleFullName(null)).toBeNull();
  });
});

describe('Android hand-off for emailed links', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const LINK = 'https://onmylead.com/auth-callback?token_hash=pkce_ab%2Bc%2F%3D&type=magiclink';

  const fallbackOf = (intent: string) => decodeURIComponent(/S\.browser_fallback_url=([^;]+);/.exec(intent)![1]);

  it('sends an Android browser with a token link on to the app', () => {
    for (const ua of [ANDROID, ANDROID_TABLET]) {
      const intent = androidAuthHandoff(LINK, ua)!;
      expect(intent).toMatch(/^intent:\/\/auth-callback\?/);
      expect(intent).toContain('#Intent;scheme=onmylead;package=com.rusoffroad.onmylead.app;');
      expect(intent.endsWith(';end')).toBe(true);
    }
    for (const type of ['signup', 'recovery']) {
      expect(androidAuthHandoff(`https://onmylead.com/auth-callback?token_hash=a&type=${type}`, ANDROID)).toContain(`type=${type}`);
    }
  });

  it('encodes the token and type exactly once', () => {
    const intent = androidAuthHandoff(LINK, ANDROID)!;
    expect(intent).toContain('intent://auth-callback?token_hash=pkce_ab%2Bc%2F%3D&type=magiclink#Intent;');
    const app = new URL(intent.split('#')[0].replace(/^intent:/, 'onmylead:'));
    expect(parseAuthLink(Object.fromEntries(app.searchParams))).toEqual({ kind: 'token', tokenHash: 'pkce_ab+c/=', type: 'magiclink' });
  });

  it('falls back to the same page marked web=1, which does not bounce again', () => {
    const fallback = fallbackOf(androidAuthHandoff(LINK, ANDROID)!);
    const url = new URL(fallback);
    expect(url.origin + url.pathname).toBe('https://onmylead.com/auth-callback');
    expect(url.searchParams.get('web')).toBe('1');
    expect(parseAuthLink(Object.fromEntries(url.searchParams))).toEqual({ kind: 'token', tokenHash: 'pkce_ab+c/=', type: 'magiclink' });
    expect(androidAuthHandoff(fallback, ANDROID)).toBeNull();
    expect(fallback).toBe(webOnlyUrl(LINK));
  });

  it('never bounces on the iPhone or a computer', () => {
    expect(androidAuthHandoff(LINK, IPHONE)).toBeNull();
    expect(androidAuthHandoff(LINK, DESKTOP)).toBeNull();
    expect(androidAuthHandoff(LINK, null)).toBeNull();
  });

  it('leaves Google and Facebook returns, errors and bad links on the website', () => {
    expect(androidAuthHandoff('https://onmylead.com/auth-callback?code=xyz', ANDROID)).toBeNull();
    expect(androidAuthHandoff('https://onmylead.com/auth-callback?error=access_denied&error_code=otp_expired', ANDROID)).toBeNull();
    expect(androidAuthHandoff('https://onmylead.com/auth-callback?token_hash=a&type=sms', ANDROID)).toBeNull();
    expect(androidAuthHandoff('not a url', ANDROID)).toBeNull();
  });

  it('only builds intents for the app package and scheme', () => {
    expect(androidIntentUrl({ kind: 'token', tokenHash: 'a', type: 'signup' }, 'https://onmylead.com/auth-callback?token_hash=a&type=signup&web=1')).toBe(
      'intent://auth-callback?token_hash=a&type=signup#Intent;scheme=onmylead;package=com.rusoffroad.onmylead.app;' +
        'S.browser_fallback_url=https%3A%2F%2Fonmylead.com%2Fauth-callback%3Ftoken_hash%3Da%26type%3Dsignup%26web%3D1;end',
    );
  });
});
