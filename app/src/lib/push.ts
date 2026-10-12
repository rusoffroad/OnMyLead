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
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';

import { planReminders } from '@/core/notifications';
import { myRides } from './api';
import { currentNotificationSettings } from './notification-settings';
import { supabase } from './supabase';

// Chat already pops up inside the app, so only the rest gets a banner while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const banner = (n.request.content.data as { type?: unknown } | undefined)?.type !== 'message';
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
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-chat', {
        name: 'Ride Chat',
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

type TapData = { type?: unknown; change?: unknown; rideId?: unknown; inviteCode?: unknown };

/** Where a tapped notification goes: Ride Mode for a live ride or a rider's status, else the ride page (its chat for a message). */
export function tapTarget(data: TapData | undefined): string | null {
  if (!data) return null;
  const rideId = typeof data.rideId === 'string' && data.rideId ? data.rideId : null;
  if (rideId && (data.type === 'status' || (data.type === 'ride' && data.change === 'live'))) return `/ride/${rideId}/live`;
  // A chat message opens the ride page on its Chat section.
  if (typeof data.inviteCode === 'string' && data.inviteCode) return `/r/${data.inviteCode}${data.type === 'message' ? '?section=chat' : ''}`;
  return null;
}

/** Open the ride when a notification is tapped, including one that launched the app. */
export function useNotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const target = tapTarget(last?.notification.request.content.data as TapData | undefined);
    if (target) router.push(target as never);
  }, [last]);
}

/**
 * A ride you're on was cancelled, removed or moved while the app is running: reschedule the
 * reminders so the old one doesn't go off.
 */
export function useRideChangeReminders() {
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as TapData | undefined;
      if (data?.type === 'ride' && data.change !== 'live') syncRideReminders(currentNotificationSettings().reminder_minutes);
    });
    return () => sub.remove();
  }, []);
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Whether iOS lets OnMyLead show notifications at all. */
export async function pushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    return p.canAskAgain === false || p.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Ask iOS for permission, then register this phone. */
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
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      });
    }
  } catch {
    // No permission or offline: the next sync tries again.
  }
}
