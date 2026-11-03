import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { androidOfferToken } from '../purchases';
import {
  appleRedeemUrl, claimErrorLine, inviteSummary, NO_REFERRALS, parseClaim, parseLinkResult, parseMyReferrals, parseOfferCodes,
  REFERRAL_PRICE, REFERRAL_RULES, referralsSwitchedOn, rewardAction, rewardLines, rewardState, type ReferralReward,
} from '../referrals';
import { tapTarget } from '../push-tap';
import { inboxLook } from '../inbox';

const now = Date.parse('2026-11-10T12:00:00Z');
const reward = (over: Partial<ReferralReward> = {}): ReferralReward => ({
  role: 'referrer', from: 'Jake R.', earnedAt: '2026-11-09T12:00:00Z', expiresAt: '2027-05-10T12:00:00Z',
  claimedAt: null, claimStore: null, claimKind: null, appleCode: null, deferredAt: null, redeemedAt: null, ...over,
});

describe('refer a friend rules', () => {
  it('match referral_rules() in the migration', () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/20261103000000_referrals.sql'), 'utf8');
    const rule = (k: string) => sql.match(new RegExp(`'${k}', '?([\\w-]+)'?`))?.[1];
    expect(Number(rule('new_account_days'))).toBe(REFERRAL_RULES.newAccountDays);
    expect(Number(rule('min_ride_minutes'))).toBe(REFERRAL_RULES.minRideMinutes);
    expect(Number(rule('reward_days'))).toBe(REFERRAL_RULES.rewardDays);
    expect(Number(rule('defer_days'))).toBe(REFERRAL_RULES.deferDays);
    expect(rule('apple_app_id')).toBe(REFERRAL_RULES.appleAppId);
    expect(rule('google_offer_id')).toBe(REFERRAL_RULES.googleOfferId);
  });

  it('price the first year at half of Pro Annual', () => {
    expect(REFERRAL_PRICE.annual).toBe(29.99);
    expect(REFERRAL_PRICE.discounted).toBe(14.99);
  });

  it('stay off unless the owner switched them on', () => {
    expect(referralsSwitchedOn({})).toBe(false);
    expect(referralsSwitchedOn({ referrals: false })).toBe(false);
    expect(referralsSwitchedOn({ referrals: true })).toBe(true);
  });
});

describe('reading the server', () => {
  it('reads my_referrals and drops bad rows', () => {
    const r = parseMyReferrals({
      enabled: true, code: 'REXREF0001', invited: '2', rode: 1,
      invites: [{ name: 'Fia', joined_at: '2026-11-08T00:00:00Z', rode_at: '2026-11-09T00:00:00Z' }, { name: 'bad' }, 'x'],
      invited_by: { name: 'Rex', rode_at: null },
      reward: { role: 'referrer', from: 'Fia', earned_at: '2026-11-09T00:00:00Z', expires_at: '2027-05-10T00:00:00Z', claim_kind: 'nope' },
    });
    expect(r.enabled).toBe(true);
    expect(r.invited).toBe(2);
    expect(r.invites).toHaveLength(1);
    expect(r.invitedBy).toEqual({ name: 'Rex', rodeAt: null });
    expect(r.reward?.claimKind).toBeNull();
    expect(parseMyReferrals(null)).toBe(NO_REFERRALS);
    expect(parseMyReferrals({ reward: { role: 'boss' } }).reward).toBeNull();
  });

  it('reads claim answers', () => {
    expect(parseClaim({ kind: 'apple_code', code: 'AAAA1111', url: 'https://apps.apple.com/x' })).toEqual({ kind: 'apple_code', code: 'AAAA1111', url: 'https://apps.apple.com/x' });
    expect(parseClaim({ kind: 'google_offer', offer_id: 'referral-50' })).toEqual({ kind: 'google_offer', offerId: 'referral-50' });
    expect(parseClaim({ kind: 'google_defer', deferred_at: null })).toEqual({ kind: 'google_defer', deferredAt: null });
    expect(parseClaim({ error: 'no_codes' })).toEqual({ kind: 'error', error: 'no_codes', store: undefined });
    expect(parseClaim({ error: 'weird' })).toMatchObject({ error: 'unknown' });
    expect(parseClaim(null)).toMatchObject({ kind: 'error' });
    expect(parseLinkResult('linked')).toBe('linked');
    expect(parseLinkResult('hacked')).toBeNull();
  });

  it('builds Apple’s redeem link', () => {
    expect(appleRedeemUrl('AAAA1111')).toBe('https://apps.apple.com/redeem?ctx=offercodes&id=6822352321&code=AAAA1111');
  });
});

describe('the reward card', () => {
  it('knows where a reward stands', () => {
    expect(rewardState(null, now).state).toBe('none');
    expect(rewardState(reward(), now).state).toBe('ready');
    expect(rewardState(reward({ expiresAt: '2026-11-01T00:00:00Z' }), now).state).toBe('expired');
    expect(rewardState(reward({ claimKind: 'apple_code', appleCode: 'AAAA1111', expiresAt: '2026-11-01T00:00:00Z' }), now)).toEqual({ state: 'apple_code', code: 'AAAA1111' });
    expect(rewardState(reward({ claimKind: 'google_offer' }), now).state).toBe('google_offer');
    expect(rewardState(reward({ claimKind: 'google_offer', redeemedAt: '2026-11-10T00:00:00Z' }), now).state).toBe('used');
    expect(rewardState(reward({ claimKind: 'google_defer' }), now).state).toBe('google_defer_pending');
    expect(rewardState(reward({ claimKind: 'google_defer', deferredAt: '2026-11-10T00:00:00Z' }), now).state).toBe('used');
  });

  it('claims in this device’s store, and says where otherwise', () => {
    expect(rewardAction(reward(), 'apple', now)).toEqual({ kind: 'claim', title: 'Claim 50% Off' });
    expect(rewardAction(reward(), 'google', now)).toEqual({ kind: 'claim', title: 'Claim 50% Off' });
    expect(rewardAction(reward(), null, now)?.kind).toBe('in_app');
    expect(rewardAction(reward({ claimKind: 'apple_code', appleCode: 'A1B2C3' }), 'google', now)?.kind).toBe('other_store');
    expect(rewardAction(reward({ claimKind: 'google_offer' }), 'apple', now)?.kind).toBe('other_store');
    expect(rewardAction(reward({ claimKind: 'apple_code', appleCode: 'A1B2C3' }), 'apple', now)).toEqual({ kind: 'claim', title: 'Redeem Your Code' });
    expect(rewardAction(reward({ expiresAt: '2026-11-01T00:00:00Z' }), 'apple', now)).toBeNull();
  });

  it('words it for each rider', () => {
    expect(rewardLines(reward(), now).body).toMatch(/^Jake R\. finished their first ride\. \$14\.99 your first year/);
    expect(rewardLines(reward({ role: 'friend' }), now).body).toMatch(/^Thanks for riding with Jake R\./);
    expect(rewardLines(reward({ claimKind: 'google_defer' }), now).title).toBe('You Earned 6 Months');
    expect(claimErrorLine({ kind: 'error', error: 'no_codes' })).toMatch(/your reward is saved/);
  });

  it('counts invites', () => {
    expect(inviteSummary(NO_REFERRALS)).toBe('No friends have joined with your link yet.');
    expect(inviteSummary({ ...NO_REFERRALS, invited: 3, rode: 1 })).toBe('3 friends joined, 1 finished a first ride.');
    expect(inviteSummary({ ...NO_REFERRALS, invited: 1 })).toBe('1 friend joined.');
  });

  it('opens Invite Friends from the inbox and the notification', () => {
    expect(tapTarget({ type: 'referral' })).toBe('/invite-friends');
    expect(inboxLook({ kind: 'referral', data: {} })).toEqual({ icon: 'star', tone: 'account' });
  });
});

describe('Google Play offers', () => {
  const offers = [
    { id: 'referral-50', basePlanIdAndroid: 'annual', offerTokenAndroid: 'ref-tok' },
    { id: null, basePlanIdAndroid: 'annual', offerTokenAndroid: 'base-tok' },
  ];
  it('never sells the referral offer on its own', () => {
    expect(androidOfferToken(offers)).toBe('base-tok');
    expect(androidOfferToken([offers[0]])).toBeNull();
  });
  it('buys the referral offer when asked', () => {
    expect(androidOfferToken(offers, 'referral-50')).toBe('ref-tok');
    expect(androidOfferToken([offers[1]], 'referral-50')).toBeNull();
  });
});

describe('Apple offer code files', () => {
  it('reads the App Store Connect download or a plain list', () => {
    expect(parseOfferCodes('Offer Codes\nAB12CD34EF\nab12cd34ef\n"XY98ZW76"\n')).toEqual(['AB12CD34EF', 'XY98ZW76']);
    expect(parseOfferCodes('Code,Expiration\nQQ11WW22,2027-05-01\nnot a code\nSHORT1')).toEqual(['QQ11WW22', 'SHORT1']);
    expect(parseOfferCodes('EXPIRATION\nONLYLETTERS')).toEqual([]);
  });
});
