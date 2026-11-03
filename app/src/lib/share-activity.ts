import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { track } from './analytics';

/**
 * Share an activity card (a snapshot of the card on screen) to Facebook, Instagram, X, Messages
 * or any app on the share sheet. The caption goes with it where the app takes one; apps that only
 * take a picture (Instagram) get the picture, and the caption is on the clipboard-free text share
 * as a fallback. Returns a short status for the screen, or null.
 */
export async function shareActivity(view: RefObject<View | null>, text: string, kind: string): Promise<string | null> {
  try {
    if (view.current && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(view, { format: 'png', quality: 1, width: 1080, height: 1350, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share to Facebook, Instagram, X and More' });
      track('activity_shared', { kind, as: 'image', platform: Platform.OS });
      return null;
    }
  } catch {
    // fall through to text
  }
  await Share.share({ message: text });
  track('activity_shared', { kind, as: 'text', platform: Platform.OS });
  return null;
}

/** Share only the words and link (the "Share Text Only" choice). */
export async function shareActivityText(text: string, kind: string): Promise<string | null> {
  await Share.share({ message: text });
  track('activity_shared', { kind, as: 'text', platform: Platform.OS });
  return null;
}
