/**
 * The notifications sitting on this phone or tablet (Notification Center on iPhone and iPad,
 * the notification shade on Android). Clearing them in the Notifications inbox clears them here
 * too, and the app icon's badge goes back to zero. The web has none (notification-tray.web.ts).
 * Never throws: older builds or a denied permission just leave the phone's list as it is.
 */
import * as Notifications from 'expo-notifications';

import { notificationKey } from '@/core/inbox';

/** Clear every OnMyLead notification on this device and the icon badge. */
export async function clearTray(): Promise<void> {
  await Promise.all([
    Notifications.dismissAllNotificationsAsync().catch(() => {}),
    Notifications.setBadgeCountAsync(0).catch(() => false),
  ]);
}

/** Clear the device's notifications about the same chat or event as these inbox rows. */
export async function clearTrayFor(rows: readonly { data: Record<string, unknown> }[]): Promise<void> {
  try {
    const keys = new Set(rows.map((r) => notificationKey(r.data)).filter(Boolean));
    if (!keys.size) return;
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => keys.has(notificationKey(n.request.content.data)))
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
    );
  } catch {
    // Nothing to clear, or this build can't list them.
  }
}
