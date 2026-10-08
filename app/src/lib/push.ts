/**
 * Push notifications for ride chat (iOS and Android builds; the web has none, see push.web.ts).
 *
 * Each phone registers its device token with the backend; the notify-ride-message Edge
 * Function sends a notification to everyone on the ride (or only the leader) for each new
 * message. While the app is open the in-app pop-up shows the message instead, so the system
 * banner is suppressed then. Tapping a notification opens the ride.
 *
 * Builds signed with a free Apple ID have no push entitlement: registering fails quietly and
 * riders still get the in-app pop-up.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredFor: string | null = null;

/**
 * Ask once for permission and register this phone for the signed-in rider. Safe to call
 * often: it does the work once per account per app launch, and never throws.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (registeredFor === userId) return;
  registeredFor = userId;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-chat', {
        name: 'Ride chat',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    // Fails harmlessly until the database has the push update.
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch {
    // No push entitlement (free Apple ID build), no network, or no backend support yet.
  }
}

/** Forget the registration so the next sign-in registers again. */
export function resetPushRegistration() {
  registeredFor = null;
}

/** Open the ride when a ride-chat notification is tapped, including one that launched the app. */
export function useNotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = last?.notification.request.content.data as { inviteCode?: unknown } | undefined;
    if (typeof data?.inviteCode === 'string' && data.inviteCode) {
      router.push({ pathname: '/r/[code]', params: { code: data.inviteCode } });
    }
  }, [last]);
}
