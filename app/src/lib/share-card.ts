import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { rideCardText, type RideCardData } from '@/core/summary';

import { shareMime, snapshotForShare } from './share-image';

/**
 * Share the ride card as an image (a snapshot of the card on screen). Falls back to text if
 * the snapshot or the share sheet isn't available. Returns a short status for the UI.
 */
export async function shareRideCard(card: RideCardData, view: RefObject<View | null>, url?: string): Promise<string | null> {
  try {
    if (view.current && (await Sharing.isAvailableAsync())) {
      const uri = await snapshotForShare(view, { width: 1080, height: 1080, name: 'OnMyLead Ride' });
      await Sharing.shareAsync(uri, { ...shareMime(), dialogTitle: 'Share your ride' });
      return null;
    }
  } catch {
    // fall through to text
  }
  await Share.share({ message: rideCardText(card, url) });
  return null;
}
