// The one-time Invite Friends pop-up on Home (3.1). Rules: core/invite-promo.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { flagOn } from '@/core/app-settings';
import { INVITE_PROMO_DELAY_MS, INVITE_PROMO_SYNC_KEY, invitePromoKey, shouldShowInvitePromo } from '@/core/invite-promo';
import { useAppSettings } from '@/lib/app-settings';
import { fetchMyReferrals } from '@/lib/referrals';
import { useNeedsRiderAgreement } from '@/lib/rider-agreement';
import { useSession } from '@/lib/session';
import { setSyncedItem, syncSettingsNow } from '@/lib/settings-sync';

/** Remembers it was shown, here and on the rider's other devices. Never throws. */
export function markInvitePromoSeen(uid: string) {
  AsyncStorage.setItem(invitePromoKey(uid), '1').catch(() => {});
  setSyncedItem(INVITE_PROMO_SYNC_KEY, uid).catch(() => {});
}

async function seenBefore(uid: string): Promise<boolean> {
  // Can't read it: treat it as seen, so a storage hiccup never makes it repeat.
  if (await AsyncStorage.getItem(invitePromoKey(uid)).catch(() => '1')) return true;
  // Pick up the account's copy first (Pro), so another device's "seen" counts.
  await syncSettingsNow().catch(() => {});
  // Holds the account id, so a rider who signs in after someone else on this phone still sees it.
  const synced = await AsyncStorage.getItem(INVITE_PROMO_SYNC_KEY).catch(() => uid);
  return synced === uid;
}

/**
 * Whether Home shows the pop-up now. Checks a few seconds after Home opens, and marks it seen the
 * moment it shows, so it shows once even if the app is closed with it open.
 */
export function useInvitePromo(active: boolean): { show: boolean; uid: string | null; hide: () => void } {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const needsAgreement = useNeedsRiderAgreement();
  const { settings } = useAppSettings();
  const on = flagOn(settings, 'referrals');
  const [showFor, setShowFor] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !uid || needsAgreement || !on) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        if (await seenBefore(uid)) return;
        const referrals = await fetchMyReferrals();
        if (!live) return;
        if (!shouldShowInvitePromo({ signedIn: true, needsAgreement: false, seen: false, referrals })) return;
        markInvitePromoSeen(uid);
        setShowFor(uid);
      } catch {
        // Offline or the server said no: try again next time Home opens.
      }
    }, INVITE_PROMO_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, uid, needsAgreement, on]);

  return { show: !!uid && showFor === uid, uid, hide: () => setShowFor(null) };
}
