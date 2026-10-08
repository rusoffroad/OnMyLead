import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { rideCardText, type RideCardData } from '@/core/summary';

/**
 * Share the ride card as an image (a snapshot of the card on screen). Falls back to text if
 * the snapshot or the share sheet isn't available. Returns a short status for the UI.
 */
export async function shareRideCard(card: RideCardData, view: RefObject<View | null>, url?: string): Promise<string | null> {
  try {
    if (view.current && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(view, { format: 'png', quality: 1, width: 1080, height: 1080, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your ride' });
      return null;
    }
  } catch {
    // fall through to text
  }
  await Share.share({ message: rideCardText(card, url) });
  return null;
}
