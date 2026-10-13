/**
 * Sign-in links and sign-in buttons, kept free of React and Supabase so they can be tested.
 *
 * Every link we email (confirm your email, sign-in link, reset password, change email) lands on
 * /auth-callback. Two shapes reach it:
 *   * ?token_hash=...&type=signup, from our own branded templates (supabase/templates). The link
 *     points straight at https://onmylead.com/auth-callback, which is a Universal Link: on an
 *     iPhone with the app it opens the app, anywhere else it opens the website. The token works
 *     on any device, so it never matters where the rider asked for it.
 *   * ?code=..., from Supabase's built-in emails (the confirm link goes through supabase.co and
 *     redirects to the address we asked for). The code only works where the rider asked for it,
 *     because that device holds the other half of the PKCE pair.
 * Supabase reports a bad or expired link with ?error_code=...&error_description=... instead.
 */

import { SITE_URL } from './ride-link';

/** Where the app asks Supabase to send email and OAuth links back to. Exactly as allow-listed. */
export const APP_AUTH_CALLBACK = 'onmylead://auth-callback';
export const APP_RESET_PASSWORD = 'onmylead://reset-password';
export const SITE_AUTH_CALLBACK = `${SITE_URL}/auth-callback`;

/** The kinds of emailed link Supabase's verifyOtp accepts with a token hash. */
export const EMAIL_LINK_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export type AuthLink =
  | { kind: 'token'; tokenHash: string; type: EmailLinkType }
  | { kind: 'code'; code: string; reset: boolean }
  | { kind: 'error'; code: string | null; message: string }
  | { kind: 'none' };

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

/** Reads what /auth-callback (or /reset-password) was opened with. */
export function parseAuthLink(params: Params, opts: { reset?: boolean } = {}): AuthLink {
  const errorCode = one(params.error_code);
  const errorDescription = one(params.error_description);
  if (errorCode || errorDescription || one(params.error)) {
    return { kind: 'error', code: errorCode, message: authLinkError(errorCode, errorDescription) };
  }
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  if (tokenHash && type && (EMAIL_LINK_TYPES as readonly string[]).includes(type)) {
    return { kind: 'token', tokenHash, type: type as EmailLinkType };
  }
  const code = one(params.code);
  if (code) return { kind: 'code', code, reset: !!opts.reset || one(params.next) === 'reset' };
  return { kind: 'none' };
}

/** Supabase's link errors, in plain words. */
export function authLinkError(code: string | null, description: string | null): string {
  if (code === 'otp_expired' || /expired|invalid/i.test(description ?? '')) {
    return 'This link has expired or was already used. Ask for a new one from the sign-in screen.';
  }
  if (code === 'access_denied') return 'Sign-in was cancelled.';
  return description ? description.replace(/\+/g, ' ') : 'That link didn’t work. Ask for a new one from the sign-in screen.';
}

/** Where to go once an emailed link has signed the rider in. */
export function afterAuthLink(link: AuthLink): '/reset-password' | '/' {
  if (link.kind === 'token' && link.type === 'recovery') return '/reset-password';
  if (link.kind === 'code' && link.reset) return '/reset-password';
  return '/';
}

/** The same link, opened in the app by its own scheme (the website's "Open in the App" button). */
export function appAuthLink(link: AuthLink): string {
  if (link.kind === 'token') {
    return `${APP_AUTH_CALLBACK}?token_hash=${encodeURIComponent(link.tokenHash)}&type=${link.type}`;
  }
  return 'onmylead://sign-in';
}

/** What each emailed link says once it has worked, for the screen it lands on. */
export function authLinkDone(type: EmailLinkType | null): { title: string; body: string } {
  switch (type) {
    case 'signup':
    case 'invite':
      return { title: 'Email Confirmed', body: 'Your account is ready. Welcome to OnMyLead.' };
    case 'email_change':
      return { title: 'Email Updated', body: 'Your account now uses your new email address.' };
    default:
      return { title: 'You’re Signed In', body: 'Taking you to OnMyLead.' };
  }
}

export type SocialProvider = 'apple' | 'google' | 'facebook';

/**
 * Which social buttons to show, from Supabase's public /auth/v1/settings ("external": {"google":
 * true, ...}). A provider only appears once it is switched on in Supabase, so nothing changes in
 * the app when the owner turns one on. Apple's guideline 4.8 wants Sign in with Apple next to
 * Google or Facebook in the iPhone app; on the iPhone Apple is native, so it only needs the
 * bundle ID set on the provider. The website has no Apple button until a Services ID exists, so
 * it shows Apple only when Supabase says the web flow is set up too (see webApple).
 */
export function socialProviders(
  settings: unknown,
  platform: 'ios' | 'android' | 'web' | string,
  opts: { webApple?: boolean } = {},
): SocialProvider[] {
  const external =
    settings && typeof settings === 'object' && 'external' in settings
      ? ((settings as { external: unknown }).external as Record<string, unknown> | null)
      : null;
  if (!external || typeof external !== 'object') return [];
  const on = (p: SocialProvider) => external[p] === true;
  const out: SocialProvider[] = [];
  if (on('apple') && (platform === 'ios' || (platform === 'web' && opts.webApple))) out.push('apple');
  if (on('google')) out.push('google');
  if (on('facebook')) out.push('facebook');
  return out;
}

/** Apple sends the rider's name only the first time; this is what we store from it. */
export function appleFullName(name: { givenName?: string | null; familyName?: string | null } | null | undefined): string | null {
  const full = [name?.givenName, name?.familyName].map((s) => s?.trim()).filter(Boolean).join(' ');
  return full || null;
}
