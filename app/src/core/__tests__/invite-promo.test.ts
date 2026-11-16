import { describe, expect, it } from 'vitest';

import { INVITE_PROMO_SYNC_KEY, invitePromoKey, shouldShowInvitePromo, type InvitePromoState } from '../invite-promo';
import { NO_REFERRALS, type MyReferrals } from '../referrals';
import { isSyncedKey } from '../synced-settings';

const open: MyReferrals = { ...NO_REFERRALS, enabled: true, code: 'ABC123' };
const state = (over: Partial<InvitePromoState> = {}): InvitePromoState => ({
  signedIn: true, needsAgreement: false, seen: false, referrals: open, ...over,
});

describe('one-time Invite Friends pop-up', () => {
  it('shows for a signed-in rider with an invite link while invites are open', () => {
    expect(shouldShowInvitePromo(state())).toBe(true);
  });

  it('shows once: never after it was seen', () => {
    expect(shouldShowInvitePromo(state({ seen: true }))).toBe(false);
  });

  it('waits for sign-in and the Rider Agreement', () => {
    expect(shouldShowInvitePromo(state({ signedIn: false }))).toBe(false);
    expect(shouldShowInvitePromo(state({ needsAgreement: true }))).toBe(false);
  });

  it('stays hidden while invites are off, with no link, or before referrals load', () => {
    expect(shouldShowInvitePromo(state({ referrals: { ...open, enabled: false } }))).toBe(false);
    expect(shouldShowInvitePromo(state({ referrals: { ...open, code: null } }))).toBe(false);
    expect(shouldShowInvitePromo(state({ referrals: null }))).toBe(false);
  });

  it('skips riders who already earned the discount', () => {
    const reward = {
      role: 'referrer' as const, from: 'Jake R.', earnedAt: '2026-11-09T12:00:00Z', expiresAt: '2027-05-10T12:00:00Z',
      claimedAt: null, claimStore: null, claimKind: null, appleCode: null, deferredAt: null, redeemedAt: null,
    };
    expect(shouldShowInvitePromo(state({ referrals: { ...open, reward } }))).toBe(false);
  });

  it('remembers seen per account, and follows the account to other devices', () => {
    expect(invitePromoKey('u1')).not.toBe(invitePromoKey('u2'));
    expect(isSyncedKey(INVITE_PROMO_SYNC_KEY)).toBe(true);
  });
});
