package com.rusoffroad.onmylead.music

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Exists only so the rider can allow Notification Access, which is what lets OnMyLead see which
 * app is playing and the song name. Notifications themselves are never read or kept.
 */
class MusicListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {}
  override fun onNotificationRemoved(sbn: StatusBarNotification?) {}
}
