import { describe, expect, it } from 'vitest';

import { afterAuthLink, appAuthLink, appleFullName, APP_AUTH_CALLBACK, parseAuthLink, socialProviders } from '../auth-link';

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
