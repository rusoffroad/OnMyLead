/**
 * Push notifications (iOS and Android builds; the web has none, see push.web.ts).
 *
 * Each phone registers its device token with the backend; the notify-ride-message Edge
 * Function sends ride chat, rider status taps, ride changes and new riders, following each
 * rider's notification settings. While the app is open the in-app pop-up shows chat instead,
 * so those banners are suppressed then. Ride reminders are scheduled on the phone itself.
 * Tapping a notification opens the ride (Ride Mode for a live ride or a rider's status).
 *
 * Builds signed with a free Apple ID have no push entitlement: registering fails quietly and
 * riders still get the in-app pop-up.
 */
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';

import { planReminders } from '@/core/notifications';
import { tapData, tapTarget, type TapData } from '@/core/push-tap';
import { ackRideItems, myRides } from './api';
import { openGroupChat } from './group-chat';
import { currentNotificationSettings } from './notification-settings';
import { supabase } from './supabase';

// Chat already pops up inside the app, so only the rest gets a banner while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const data = tapData(n.request.content.data);
    // A group chat message for the chat that's already open shows there instead.
    const banner = data?.type !== 'message' && !(data?.type === 'group_message' && data.groupId === openGroupChat());
    return { shouldShowBanner: banner, shouldShowList: true, shouldPlaySound: banner, shouldSetBadge: false };
  },
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
    if (Platform.OS === 'android') await createAndroidChannels();
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    // Fails harmlessly until the database has the push update.
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch {
    // No push entitlement (free Apple ID build), no network, or no backend support yet.
  }
}

/**
 * Android groups notifications into channels the rider can tune in the phone's settings. The
 * server picks one per push (supabase/functions/_shared/fcm.ts channelFor); keep the ids in step.
 */
async function createAndroidChannels() {
  const high = Notifications.AndroidImportance.HIGH;
  await Promise.all([
    Notifications.setNotificationChannelAsync('ride-alerts', {
      name: 'Rider Alerts',
      description: 'Need Help, EMERGENCY and other status taps from your group.',
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('ride-chat', { name: 'Ride Chat', description: 'Messages in ride and group chats.', importance: high }),
    Notifications.setNotificationChannelAsync('ride-updates', {
      name: 'Ride Updates',
      description: 'Ride changes, new riders, invites, reminders and account notices.',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]);
}

/** Forget the registration so the next sign-in registers again. */
export function resetPushRegistration() {
  registeredFor = null;
}

/** A rider's status tap or quick reply reached this phone by push: the sender's card says so. */
function acknowledge(data: TapData | undefined) {
  if (data?.type === 'cancelled') return;
  if (typeof data?.rideId === 'string' && typeof data.itemId === 'string') ackRideItems(data.rideId, [data.itemId]).catch(() => {});
}

/**
 * Open the ride when a notification is tapped: with the app open, in the background, or after
 * the tap launched it. On a cold start the tap is known before the screens have mounted, and a
 * navigation then would be dropped (the app stayed on Home), so it waits for the navigator.
 * Each tap is handled once, then cleared so a remount doesn't open it again.
 */
export function useNotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  const navReady = !!useRootNavigationState()?.key;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || !navReady) return;
    const key = `${last.notification.request.identifier}:${last.actionIdentifier}:${last.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = tapData(last.notification.request.content.data);
    acknowledge(data);
    const target = tapTarget(data);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // Older native builds: the key check above still keeps it to one navigation.
    }
    if (target) router.push(target as never);
  }, [last, navReady]);
}

/**
 * A ride you're on was cancelled, removed or moved while the app is running: reschedule the
 * reminders so the old one doesn't go off.
 */
export function useRideChangeReminders() {
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = tapData(n.request.content.data);
      acknowledge(data);
      if (data?.type === 'ride' && data.change !== 'live') syncRideReminders(currentNotificationSettings().reminder_minutes);
    });
    return () => sub.remove();
  }, []);
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Whether the phone lets OnMyLead show notifications at all. */
export async function pushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    return p.canAskAgain === false || p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Ask the phone for permission, then register it. */
export async function askPushPermission(userId: string): Promise<PushPermission> {
  try {
    await Notifications.requestPermissionsAsync();
  } catch {
    // Handled by reading the result below.
  }
  registeredFor = null;
  await registerForPush(userId);
  return pushPermission();
}

/** The phone's settings page for OnMyLead, where notifications are switched back on. */
export function openPhoneSettings() {
  Linking.openSettings().catch(() => {});
}

const REMINDER_PREFIX = 'ride-reminder:';

/**
 * Schedule a reminder on this phone before each upcoming ride the rider has joined, replacing
 * the previous set. Called after sign-in and whenever the reminder setting changes. Never throws.
 */
export async function syncRideReminders(minutesBefore: number | null): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((n) => n.identifier.startsWith(REMINDER_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!minutesBefore || (await pushPermission()) !== 'granted') return;
    const mine = (await myRides()).filter((m) => m.status === 'joined' && m.rides);
    const byId = new Map(mine.map((m) => [m.ride_id, m.rides]));
    for (const r of planReminders(mine.map((m) => m.rides), minutesBefore)) {
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_PREFIX + r.rideId,
        content: { title: r.title, body: r.body, sound: 'default', data: { type: 'reminder', rideId: r.rideId, inviteCode: byId.get(r.rideId)?.invite_code ?? null } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: 'ride-updates' },
      });
    }
  } catch {
    // No permission or offline: the next sync tries again.
  }
}
