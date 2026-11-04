import type { RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';

import { snapshotForShare } from './share-image';

/**
 * Share the ride's QR code as a picture, with the invite text (link and code) alongside, through
 * the phone's share sheet: Messages, Mail, AirDrop or any other app. Falls back to the text alone
 * where a snapshot isn't possible (the web).
 */
export async function shareQrCode(view: RefObject<View | null>, message: string, title: string): Promise<void> {
  if (Platform.OS !== 'web' && view.current) {
    try {
      const uri = await snapshotForShare(view, { width: 1080, name: 'OnMyLead Invite', png: true });
      // iOS sends the picture and the text together; Android's share sheet takes one or the other, so it gets the text.
      await Share.share(Platform.OS === 'ios' ? { url: uri, message } : { message, title }, { subject: title, dialogTitle: title });
      return;
    } catch {
      // fall through to text
    }
  }
  await Share.share({ message, title }, { subject: title });
}
