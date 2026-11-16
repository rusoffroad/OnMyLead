/**
 * The one-time Invite Friends pop-up on Home (3.1): tells riders about refer a friend (both get
 * Pro Annual at 50% off the first year, core/referrals.ts) once, then never again. It is the same
 * on iPhone, iPad, Android phones and tablets, and onmylead.com.
 *
 * Seen is kept two ways: per account on the device (so it never repeats there, even on Free),
 * and as a setting that follows the account (core/synced-settings.ts), so a Pro rider who saw it
 * on the phone doesn't see it again on the iPad.
 *
 * Pure, so it is tested without a phone.
 */
import type { MyReferrals } from './referrals';

/** Synced across the rider's devices (core/synced-settings.ts). */
export const INVITE_PROMO_SYNC_KEY = 'promo.inviteFriends.v1';
/** On this device, per account. */
export const invitePromoKey = (uid: string) => `onmylead.invitePromo.${uid}`;
/** Wait this long on Home first, so it never lands on top of Apple's tracking prompt or a fast tap. */
export const INVITE_PROMO_DELAY_MS = 4_000;

export type InvitePromoState = {
  signedIn: boolean;
  /** The Rider Agreement still has to be agreed on this device. */
  needsAgreement: boolean;
  /** Seen on this device, or on another of the rider's devices. */
  seen: boolean;
  referrals: MyReferrals | null;
};

/**
 * Show it when invites are open (Admin > Settings > Refer a Friend), the rider has an invite link,
 * and they haven't seen it. A rider who already earned the discount knows about it, so they skip it.
 */
export function shouldShowInvitePromo(s: InvitePromoState): boolean {
  if (!s.signedIn || s.needsAgreement || s.seen) return false;
  const r = s.referrals;
  if (!r || !r.enabled || !r.code) return false;
  return !r.reward;
}
