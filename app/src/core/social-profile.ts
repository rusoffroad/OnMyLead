/**
 * A rider's linked Apple, Google or Facebook account, as the riders they ride with see it
 * (rider_social_profiles, migration 20261022000000_social_profiles.sql). Off until the rider turns
 * it on, and only ever shown to riders who share a ride or riding group with them.
 */
import type { SocialProvider } from './auth-link';

export type SocialProfile = {
  user_id: string;
  provider: SocialProvider;
  name: string | null;
  photo_url: string | null;
  shown: boolean;
};

export const PROVIDER_NAME: Record<SocialProvider, string> = { apple: 'Apple', google: 'Google', facebook: 'Facebook' };

/** "Eva Ridgeway on Google", or "Signed In With Apple" when the account shares no name. */
export function socialLine(p: Pick<SocialProfile, 'provider' | 'name'>): string {
  return p.name ? `${p.name} on ${PROVIDER_NAME[p.provider]}` : `Signed In With ${PROVIDER_NAME[p.provider]}`;
}

/** The You tab's setting row. */
export function socialSetting(p: Pick<SocialProfile, 'provider' | 'shown'>): { title: string; detail: string } {
  const service = PROVIDER_NAME[p.provider];
  return {
    title: `Show My ${service} Profile`,
    detail: p.shown ? `Riders you ride with see your ${service} name and photo.` : `Off. Riders you ride with don’t see it.`,
  };
}

/** Reads rows from the server, dropping anything malformed. */
export function parseSocialProfiles(rows: unknown): Map<string, SocialProfile> {
  const out = new Map<string, SocialProfile>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.user_id !== 'string' || !(o.provider === 'apple' || o.provider === 'google' || o.provider === 'facebook')) continue;
    out.set(o.user_id, {
      user_id: o.user_id,
      provider: o.provider,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null,
      photo_url: typeof o.photo_url === 'string' && o.photo_url.startsWith('https://') ? o.photo_url : null,
      shown: o.shown === true,
    });
  }
  return out;
}
