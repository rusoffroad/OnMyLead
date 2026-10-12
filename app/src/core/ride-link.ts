/**
 * Ride links: what the invite QR code and the share buttons send. One https link works for
 * everyone. On an iPhone with OnMyLead installed it opens the ride in the app (Universal Links,
 * see public/.well-known/apple-app-site-association); without the app it opens the ride's page
 * on onmylead.com, which offers the download. The link carries only the invite code, which is
 * already what the share buttons send, so a QR code reveals nothing the code doesn't.
 */

export const SITE_URL = 'https://onmylead.com';

/** Team ID + bundle ID, as Apple checks it against the site's association file. */
export const APPLE_APP_ID = 'YJ4KUF2QQV.com.rusoffroad.onmylead.app';

/** Paths on the site that open in the app when it is installed: rides and riding groups. */
export const APP_LINK_PATHS = ['/r/*', '/g/*'] as const;

/** https://onmylead.com/r/CODE (or the configured web address). */
export function rideLink(inviteCode: string, webUrl?: string | null): string {
  const base = (webUrl || SITE_URL).replace(/\/+$/, '');
  return `${base}/r/${encodeURIComponent(inviteCode)}`;
}

/** The app's own scheme, for the "Open in the App" button on the web page. */
export function appRideUrl(inviteCode: string): string {
  return `onmylead://r/${encodeURIComponent(inviteCode)}`;
}

/** iPhone and iPad browsers, where the web page offers to open the app instead. */
export function isAppleMobile(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /iPhone|iPad|iPod/i.test(userAgent);
}
