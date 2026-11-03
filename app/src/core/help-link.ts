/**
 * Links from the app into the Help Center at onmylead.com/help, where every feature has a
 * step-by-step guide. The app opens these in an in-app browser on iPhone, iPad and Android, and in
 * the same tab on the website (the Help Center is part of the same site).
 */
import { SITE_URL } from './ride-link';

/** The Help Center's home page, relative to the site. */
export const HELP_CENTER_PATH = '/help';

/** What the Help Center link is called everywhere in the app. */
export const HELP_CENTER_TITLE = 'Help Center: How-To Guides';

/** The address riders see under the link, so they know it opens the website. */
export const HELP_CENTER_DISPLAY = 'onmylead.com/help';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `/help`, or `/help/<slug>` for one guide. Anything that isn't a plain article slug opens the home page. */
export function helpCenterPath(slug?: string | null): string {
  return slug && SLUG.test(slug) ? `${HELP_CENTER_PATH}/${slug}` : HELP_CENTER_PATH;
}

/** The full https address of the Help Center or one of its guides. */
export function helpCenterUrl(slug?: string | null, base: string = SITE_URL): string {
  return `${(base || SITE_URL).replace(/\/+$/, '')}${helpCenterPath(slug)}`;
}

/**
 * The guides the Help and Support page links to, one per topic. Each is an article in
 * help/articles that's published for every app version (the test checks the files exist).
 */
export const SUPPORT_GUIDES = {
  joining: 'join-a-ride',
  location: 'location-sharing',
  pro: 'manage-subscription',
  reporting: 'report-and-block',
  deleting: 'delete-account',
  emergency: 'emergency-and-safety',
} as const;
