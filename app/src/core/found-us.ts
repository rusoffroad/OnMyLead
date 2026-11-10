// Where riders found OnMyLead (3.0): the answers on Home's one-time question, reading an ad or
// link's tags from a website address, and the labels the Admin Dashboard shows. Pure, so vitest
// covers it (core/__tests__/found-us.test.ts). Database side: migration 20261110300000_rider_sources.

export type FoundUsAnswer =
  | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'google' | 'app_store' | 'google_play'
  | 'friend' | 'group_or_club' | 'event' | 'other';

/** In the order Home shows them. Labels are English keys for t(). */
export const FOUND_US_ANSWERS: { value: FoundUsAnswer; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google', label: 'Google Search' },
  { value: 'app_store', label: 'App Store' },
  { value: 'google_play', label: 'Google Play' },
  { value: 'friend', label: 'A Friend' },
  { value: 'group_or_club', label: 'A Riding Group or Club' },
  { value: 'event', label: 'An Event or Trail' },
  { value: 'other', label: 'Something Else' },
];

export function foundUsLabel(answer: string): string {
  return FOUND_US_ANSWERS.find((a) => a.value === answer)?.label ?? answer;
}

/** Ask accounts made in the last 30 days that haven't answered or skipped. Older riders aren't bothered. */
export function shouldAskFoundUs(createdAt: string | null | undefined, answered: boolean, now = Date.now()): boolean {
  if (answered || !createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t < 30 * 86_400_000;
}

export type Campaign = { source?: string; medium?: string; campaign?: string; click?: 'meta' | 'google' | 'tiktok' };

const tag = (v: string | null, n: number) => (v ? v.trim().slice(0, n) || undefined : undefined);

/**
 * The tags on the address a visitor landed on: utm_source/medium/campaign, and the click ids the
 * ad networks add (fbclid Meta, gclid/gbraid/wbraid Google, ttclid TikTok). Only which network
 * clicked is kept, never the id. Null when the address has none.
 */
export function campaignFromUrl(href: string): Campaign | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const q = u.searchParams;
  const c: Campaign = {
    source: tag(q.get('utm_source'), 60),
    medium: tag(q.get('utm_medium'), 60),
    campaign: tag(q.get('utm_campaign'), 100),
    click: q.has('fbclid') ? 'meta' : q.has('ttclid') ? 'tiktok' : q.has('gclid') || q.has('gbraid') || q.has('wbraid') ? 'google' : undefined,
  };
  if (!c.source && c.click) c.source = c.click === 'meta' ? 'facebook' : c.click;
  if (!c.medium && c.click) c.medium = 'paid';
  return c.source || c.campaign || c.click ? c : null;
}

/** "facebook / paid_social / carousel nov" for the Admin Dashboard. */
export function campaignLabel(c: { source: string | null; medium: string | null; campaign: string | null }): string {
  return [c.source, c.medium, c.campaign].filter(Boolean).join(' / ') || 'Unknown';
}

/**
 * The store link with the campaign on it, so the stores' own reports can show it: Google Play's
 * referrer (Play Console > Acquisition), and Apple's campaign token, which needs the provider token
 * from App Store Connect (null until set).
 */
export function taggedStoreUrl(url: string, c: Campaign | null, appleProviderToken: string | null): string {
  if (!c) return url;
  try {
    const u = new URL(url);
    const name = [c.source, c.medium, c.campaign].filter(Boolean).join('_').replace(/[^\w.-]+/g, '-').slice(0, 40);
    if (u.hostname === 'play.google.com') {
      const ref = new URLSearchParams();
      if (c.source) ref.set('utm_source', c.source);
      if (c.medium) ref.set('utm_medium', c.medium);
      if (c.campaign) ref.set('utm_campaign', c.campaign);
      u.searchParams.set('referrer', ref.toString());
    } else if (u.hostname === 'apps.apple.com' && appleProviderToken && name) {
      u.searchParams.set('pt', appleProviderToken);
      u.searchParams.set('ct', name);
      u.searchParams.set('mt', '8');
    }
    return u.toString();
  } catch {
    return url;
  }
}
