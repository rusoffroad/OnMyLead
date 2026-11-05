/**
 * Refer a friend, the same on iPhone, iPad, Android phones and tablets, and onmylead.com.
 *
 * A rider shares their friend link. A brand-new account that opens it is recorded as their
 * friend's invite; when that friend finishes their first ride, both riders earn Pro Annual at 50%
 * off for the first year. The discount is always a real store offer, never free Pro from our
 * server (Apple guideline 3.1.1): a one-time Apple offer code on iPhone and iPad, the Google Play
 * offer 'referral-50' on Android, or, for a rider already paying through Google Play, the next
 * bill pushed back 6 months. The server decides everything (migration
 * 20261103800000_referrals.sql); this file reads its answers and words them.
 */
import type { Store } from './entitlements';
import { PRICES } from './pro';

import { coreLocale, tc } from './i18n';
/** Mirrors referral_rules() in the migration; the unit test checks they match. */
export const REFERRAL_RULES = {
  newAccountDays: 7,
  minRideMinutes: 10,
  rewardDays: 182,
  deferDays: 182,
  appleAppId: '6822352321',
  googleOfferId: 'referral-50',
} as const;

/** Pro Annual and its first year at 50% off ($29.99 -> $14.99; Apple rounds to its price tier). */
export const REFERRAL_PRICE = { annual: PRICES.annual, discounted: Math.floor((PRICES.annual / 2) * 100) / 100 } as const;

export type ClaimKind = 'apple_code' | 'google_offer' | 'google_defer';

export type ReferralReward = {
  role: 'referrer' | 'friend';
  from: string;
  earnedAt: string;
  expiresAt: string;
  claimedAt: string | null;
  claimStore: Store | null;
  claimKind: ClaimKind | null;
  appleCode: string | null;
  deferredAt: string | null;
  redeemedAt: string | null;
};

export type ReferralInvite = { name: string; joinedAt: string; rodeAt: string | null };

export type MyReferrals = {
  enabled: boolean;
  code: string | null;
  invites: ReferralInvite[];
  invited: number;
  rode: number;
  invitedBy: { name: string; rodeAt: string | null } | null;
  reward: ReferralReward | null;
};

export const NO_REFERRALS: MyReferrals = { enabled: false, code: null, invites: [], invited: 0, rode: 0, invitedBy: null, reward: null };

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseReward(v: unknown): ReferralReward | null {
  if (!isObj(v)) return null;
  const role = v.role === 'referrer' || v.role === 'friend' ? v.role : null;
  const earnedAt = str(v.earned_at);
  const expiresAt = str(v.expires_at);
  if (!role || !earnedAt || !expiresAt) return null;
  const kind = v.claim_kind === 'apple_code' || v.claim_kind === 'google_offer' || v.claim_kind === 'google_defer' ? v.claim_kind : null;
  const store = v.claim_store === 'apple' || v.claim_store === 'google' ? v.claim_store : null;
  return {
    role,
    from: str(v.from) ?? 'Rider',
    earnedAt,
    expiresAt,
    claimedAt: str(v.claimed_at),
    claimStore: store,
    claimKind: kind,
    appleCode: str(v.apple_code),
    deferredAt: str(v.deferred_at),
    redeemedAt: str(v.redeemed_at),
  };
}

/** Reads my_referrals(), dropping anything malformed instead of failing. */
export function parseMyReferrals(raw: unknown): MyReferrals {
  if (!isObj(raw)) return NO_REFERRALS;
  const invites = Array.isArray(raw.invites)
    ? raw.invites.flatMap((i): ReferralInvite[] => {
        if (!isObj(i) || !str(i.joined_at)) return [];
        return [{ name: str(i.name) ?? tc('Rider'), joinedAt: str(i.joined_at)!, rodeAt: str(i.rode_at) }];
      })
    : [];
  const by = isObj(raw.invited_by) ? { name: str(raw.invited_by.name) ?? tc('Rider'), rodeAt: str(raw.invited_by.rode_at) } : null;
  return {
    enabled: raw.enabled === true,
    code: str(raw.code),
    invites,
    invited: num(raw.invited),
    rode: num(raw.rode),
    invitedBy: by,
    reward: parseReward(raw.reward),
  };
}

export type ClaimResult =
  | { kind: 'apple_code'; code: string; url: string }
  | { kind: 'google_offer'; offerId: string }
  | { kind: 'google_defer'; deferredAt: string | null }
  | { kind: 'error'; error: 'no_reward' | 'expired' | 'no_codes' | 'used' | 'claimed_on_other_store' | 'unknown'; store?: Store };

/** Reads claim_referral_reward(). */
export function parseClaim(raw: unknown): ClaimResult {
  if (!isObj(raw)) return { kind: 'error', error: 'unknown' };
  if (raw.kind === 'apple_code' && str(raw.code) && str(raw.url)) return { kind: 'apple_code', code: str(raw.code)!, url: str(raw.url)! };
  if (raw.kind === 'google_offer') return { kind: 'google_offer', offerId: str(raw.offer_id) ?? REFERRAL_RULES.googleOfferId };
  if (raw.kind === 'google_defer') return { kind: 'google_defer', deferredAt: str(raw.deferred_at) };
  const known = ['no_reward', 'expired', 'no_codes', 'used', 'claimed_on_other_store'] as const;
  const error = known.find((k) => k === raw.error) ?? 'unknown';
  const store = raw.store === 'apple' || raw.store === 'google' ? raw.store : undefined;
  return { kind: 'error', error, store };
}

/** What claim_referral() answered, for the friend who opened the link. */
export type LinkResult = 'linked' | 'already' | 'not_found' | 'self' | 'not_new' | 'off';

export function parseLinkResult(raw: unknown): LinkResult | null {
  return raw === 'linked' || raw === 'already' || raw === 'not_found' || raw === 'self' || raw === 'not_new' || raw === 'off' ? raw : null;
}

/** A line for the friend who opened an invite link, or null when there is nothing to say. */
export function linkResultLine(r: LinkResult | null, inviter: string): string | null {
  if (r === 'linked') return tc('{inviter} invited you. Finish your first ride and you both get 50% off Pro Annual.', { inviter });
  return null;
}

/** Apple's redeem page with the code filled in. */
export function appleRedeemUrl(code: string): string {
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${REFERRAL_RULES.appleAppId}&code=${encodeURIComponent(code)}`;
}

export function inviteMessage(link: string | null, code: string): string {
  return [
    'Ride with me on OnMyLead, the group ride app. Join with my link and when you finish your first ride, we both get 50% off Pro Annual.',
    link ?? `Friend code: ${code}`,
  ].join('\n');
}

export type RewardState =
  | { state: 'none' }
  | { state: 'expired' }
  | { state: 'ready' }
  | { state: 'apple_code'; code: string }
  | { state: 'google_offer' }
  | { state: 'google_defer_pending' }
  | { state: 'used' };

/** Where a reward stands, from the rider's side. */
export function rewardState(reward: ReferralReward | null, now: number = Date.now()): RewardState {
  if (!reward) return { state: 'none' };
  if (reward.claimKind === 'apple_code' && reward.appleCode) return { state: 'apple_code', code: reward.appleCode };
  if (reward.redeemedAt) return { state: 'used' };
  // deferred_at alone is a reservation (Google not yet confirmed); redeemed_at above is the confirmation.
  if (reward.claimKind === 'google_defer') return { state: 'google_defer_pending' };
  if (reward.claimKind === 'google_offer') return { state: 'google_offer' };
  if (Date.parse(reward.expiresAt) <= now) return { state: 'expired' };
  return { state: 'ready' };
}

/**
 * The button under a reward on this device: claim it in this device's store, or on the website a
 * note that it is claimed in the app. Null when there is nothing to press.
 */
export function rewardAction(reward: ReferralReward | null, store: Store | null, now: number = Date.now()):
  | { kind: 'claim'; title: string }
  | { kind: 'in_app'; message: string }
  | { kind: 'other_store'; message: string }
  | null {
  const s = rewardState(reward, now);
  if (s.state === 'none' || s.state === 'expired' || s.state === 'used') return null;
  if (!store) return { kind: 'in_app', message: tc('Claim your discount in the OnMyLead app on your iPhone, iPad or Android device.') };
  if (s.state === 'apple_code' && store === 'google') {
    return { kind: 'other_store', message: tc('You claimed this discount as an Apple offer code. Redeem it on your iPhone or iPad.') };
  }
  // A Google Play bill move that never finished can still turn into an Apple code once that Play
  // subscription has ended (the server decides), so an Apple device offers to claim.
  if (s.state === 'google_offer' && store === 'apple') {
    return { kind: 'other_store', message: tc('You claimed this discount on Google Play. Use it on your Android phone or tablet.') };
  }
  if (s.state === 'apple_code') return { kind: 'claim', title: tc('Redeem Your Code') };
  if (s.state === 'google_offer') return { kind: 'claim', title: tc('Get 50% Off in Google Play') };
  if (s.state === 'google_defer_pending') return { kind: 'claim', title: store === 'apple' ? tc('Claim 50% Off') : tc('Apply Your Reward') };
  return { kind: 'claim', title: tc('Claim 50% Off') };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(coreLocale(), { month: 'short', day: 'numeric', year: 'numeric' });

/** The lines on the reward card. */
export function rewardLines(reward: ReferralReward, now: number = Date.now()): { title: string; body: string; note: string | null } {
  const s = rewardState(reward, now);
  const thanks = reward.role === 'referrer' ? `${reward.from} finished their first ride.` : `Thanks for riding with ${reward.from}.`;
  const price = `Your first year of Pro Annual is half price, then it renews at $${REFERRAL_PRICE.annual} a year.`;
  switch (s.state) {
    case 'expired':
      return { title: tc('Your 50% Off Has Expired'), body: tc('{thanks} The discount could be claimed until {v}.', { thanks, v: fmt(reward.expiresAt) }), note: null };
    case 'used':
      return reward.claimKind === 'google_defer'
        ? { title: tc('Reward Applied'), body: tc('Your next Google Play bill was pushed back 6 months. Thanks for spreading the word.'), note: null }
        : { title: tc('Reward Used'), body: tc('You’re on Pro Annual at half price for your first year. Thanks for spreading the word.'), note: null };
    case 'apple_code':
      return { title: tc('Your 50% Off Code'), body: `${thanks} ${price}`, note: tc('Code {code}. Redeem it in the App Store before it expires.', { code: s.code }) };
    case 'google_defer_pending':
      return { title: tc('You Earned 6 Months'), body: tc('{thanks} You already pay for Pro on Google Play, so your next bill moves back 6 months instead.', { thanks }), note: null };
    default:
      return { title: tc('You Earned 50% Off Pro Annual'), body: `${thanks} ${price}`, note: tc('Claim by {v}.', { v: fmt(reward.expiresAt) }) };
  }
}

/** What a failed claim says. */
export function claimErrorLine(r: Extract<ClaimResult, { kind: 'error' }>): string {
  switch (r.error) {
    case 'no_codes':
      return tc('We’re out of discount codes for a moment. Try again tomorrow; your reward is saved.');
    case 'expired':
      return tc('This discount has expired.');
    case 'used':
      return tc('You’ve already used this discount.');
    case 'claimed_on_other_store':
      return r.store === 'apple' ? tc('You claimed this discount as an Apple offer code. Redeem it on your iPhone or iPad.') : tc('You claimed this discount on Google Play.');
    case 'no_reward':
      return tc('There’s no discount to claim yet. It unlocks when an invited friend finishes their first ride.');
    default:
      return tc('Something went wrong. Try again.');
  }
}

/** An invite's progress, in words. */
export function inviteStatus(i: ReferralInvite): string {
  return i.rodeAt ? tc('First Ride Done') : tc('Joined, No Ride Yet');
}

/** The headline count on Invite Friends. */
export function inviteSummary(r: MyReferrals): string {
  if (!r.invited) return tc('No friends have joined with your link yet.');
  const joined = `${r.invited} ${r.invited === 1 ? 'friend' : 'friends'} joined`;
  return r.rode ? tc('{joined}, {rode} finished a first ride.', { joined, rode: r.rode }) : `${joined}.`;
}

/** Google Play offer ids the regular Subscribe button must never pick on its own. */
export const RESERVED_PLAY_OFFERS: string[] = [REFERRAL_RULES.googleOfferId];

/**
 * Whether the owner switched Refer a Friend on. Unlike other flags it is off unless set to true,
 * so nothing about the offer shows before the store offers exist.
 */
export function referralsSwitchedOn(flags: Record<string, boolean>): boolean {
  return flags.referrals === true;
}

/**
 * The one-time Apple offer codes in whatever the owner pasted: the CSV App Store Connect
 * downloads, or one code per line. Header lines and anything that can't be a code are skipped;
 * duplicates are dropped. Codes are upper-cased, like the server stores them.
 */
const HEADER_WORD = /^(offer[ _]?)?codes?$|expir|^date$|redeem|^url$|^status$|^reference/i;

export function parseOfferCodes(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const fields = line.split(/[,;\t]/).map((field) => field.trim().replace(/^"|"$/g, '').trim());
    // A header row (Code, Expiration Date, ...) is skipped whole. Codes themselves can be all
    // letters, so a code is any 6 to 64 letters and digits.
    if (fields.some((f) => HEADER_WORD.test(f))) continue;
    for (const f of fields) if (/^[A-Za-z0-9]{6,64}$/.test(f)) out.add(f.toUpperCase());
  }
  return [...out];
}
