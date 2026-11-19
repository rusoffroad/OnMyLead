// The Welcome Tour (4.0). Rules: core/welcome-tour.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { APP_FLAGS, flagOn, type AppFlag } from '@/core/app-settings';
import { WELCOME_TOUR_DELAY_MS, WELCOME_TOUR_SYNC_KEY, welcomeTourKey, welcomeTourMode, type FlagCheck, type TourMode } from '@/core/welcome-tour';
import { flagNow, refreshAppSettings, useAppSettings } from '@/lib/app-settings';
import { useNeedsRiderAgreement } from '@/lib/rider-agreement';
import { useSession } from '@/lib/session';
import { setSyncedItem, syncSettingsNow } from '@/lib/settings-sync';

/** Whether a server flag is on. A flag this build doesn't know (a feature from a newer build) is off. */
export function useTourFlags(): FlagCheck {
  const { settings } = useAppSettings();
  return useCallback((f: string) => Object.prototype.hasOwnProperty.call(APP_FLAGS, f) && flagOn(settings, f as AppFlag), [settings]);
}

/** Remembers the tour (or What's New) was shown, here and on the rider's other devices. Never throws. */
export function markWelcomeTourSeen(uid: string) {
  AsyncStorage.setItem(welcomeTourKey(uid), '1').catch(() => {});
  setSyncedItem(WELCOME_TOUR_SYNC_KEY, uid).catch(() => {});
}

async function seenBefore(uid: string): Promise<boolean> {
  // Can't read it: treat it as seen, so a storage hiccup never makes it repeat.
  if (await AsyncStorage.getItem(welcomeTourKey(uid)).catch(() => '1')) return true;
  // Pick up the account's copy first, so another device's "seen" counts.
  await syncSettingsNow().catch(() => {});
  // Holds the account id, so a rider who signs in after someone else on this phone still sees it.
  const synced = await AsyncStorage.getItem(WELCOME_TOUR_SYNC_KEY).catch(() => uid);
  return synced === uid;
}

/**
 * What Home shows on its own: the whole tour for a new account, What's New for a rider who had the
 * app before, or nothing. Marks it seen the moment it shows, so it shows once even if the app is
 * closed with it open.
 */
export function useWelcomeTour(active: boolean): { mode: TourMode | null; checked: boolean; hide: () => void } {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const createdAt = session?.user.created_at ?? null;
  const needsAgreement = useNeedsRiderAgreement();
  const [shown, setShown] = useState<{ uid: string; mode: TourMode } | null>(null);
  // The account whose check finished, so Home's other one-time pop-ups wait for it.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !uid || needsAgreement) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        if (await seenBefore(uid)) return setCheckedFor(uid);
        // The owner's switch decides, so wait for the server's latest answer.
        await refreshAppSettings();
        if (!live) return;
        const mode = welcomeTourMode({
          signedIn: true,
          needsAgreement: false,
          enabled: flagNow('welcome_tour'),
          seen: false,
          accountCreatedAt: createdAt,
          now: Date.now(),
        });
        if (mode) {
          markWelcomeTourSeen(uid);
          setShown({ uid, mode });
        }
        setCheckedFor(uid);
      } catch {
        // Try again next time Home opens.
        if (live) setCheckedFor(uid);
      }
    }, WELCOME_TOUR_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, uid, createdAt, needsAgreement]);

  return { mode: shown && shown.uid === uid ? shown.mode : null, checked: !!uid && checkedFor === uid, hide: () => setShown(null) };
}
