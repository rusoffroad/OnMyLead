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
import { AppState, Linking, Platform } from 'react-native';

import { planReminders } from '@/core/notifications';
import { tapData, tapTarget, type TapData } from '@/core/push-tap';
import { pushCallAt, SIREN_CHANNEL, SIREN_SOUND, unknownRider, type EmergencyCall } from '@/core/siren';
import { ackRideItems, myRides } from './api';
import { openGroupChat } from './group-chat';
import { markReadForPush, refreshInbox } from './inbox';
import { openDmWith } from './out-riding';
import { currentNotificationSettings } from './notification-settings';
import { endEmergency, loadSiren, onSirenSetting, raiseEmergency, setBackgroundSirenNotifier, silenceEmergency, sirenEnabled, sirenSilenced, sirenWillSound, setSirenSilencedHook, type IncomingEmergency } from './siren';
import { supabase } from './supabase';

import { tc } from '@/core/i18n';
// Chat already pops up inside the app, so only the rest gets a banner while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const data = tapData(n.request.content.data);
    // The siren switch as saved, not the default, before deciding (lib/siren).
    // An EMERGENCY while the app is open: the siren screen takes over (lib/siren), not a banner,
    // but only when the siren will really sound (not for an old or silenced one, or with it off).
    const call = emergencyFromPush(data);
    // Not in the tray either: on Android the siren channel would play its own siren over the app's.
    if (call && AppState.currentState === 'active' && (await sirenWillSound(call, registeredFor))) return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    // Already silenced here: in the list, without the siren sound coming back from the push.
    if (call && sirenSilenced(call.id!)) return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
    // Open, but the in-app siren won't sound it (too old, an older call, or the switch just went
    // off): a banner without the push's own siren sound, which nothing here could silence.
    // With the switch off the push has the plain sound, which still plays.
    if (call && AppState.currentState === 'active') return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !sirenEnabled(), shouldSetBadge: false };
    // A group chat message for the chat that's already open shows there instead.
    const banner = data?.type !== 'message' && !(data?.type === 'group_message' && data.groupId === openGroupChat())
      && !(data?.type === 'direct_message' && data.userId === openDmWith());
    return { shouldShowBanner: banner, shouldShowList: true, shouldPlaySound: banner, shouldSetBadge: false };
  },
});

let registeredFor: string | null = null;
/** This phone's push token, once registered, so the siren switch can be sent with it. */
let myToken: string | null = null;

const isEmergency = (d: TapData | undefined) => d?.type === 'status' && (d as { status?: unknown }).status === 'emergency';

/**
 * Tells the server whether this phone wants the Emergency Siren as the sound of EMERGENCY pushes
 * (push_tokens.siren). Fails quietly until the server has the siren update; then pushes keep their
 * plain sound.
 */
async function sendSirenSetting() {
  if (!myToken) return;
  try {
    // The saved switch, not the default true before it has loaded.
    await loadSiren();
    await supabase.rpc('set_push_siren', { p_token: myToken, p_on: sirenEnabled() });
  } catch {}
}
onSirenSetting(() => void sendSirenSetting());

// Silenced or ended calls: take their notifications down too, so a siren-channel alarm still
// playing from the tray (Android) stops with the in-app siren.
setSirenSilencedHook((ids) => {
  Notifications.getPresentedNotificationsAsync()
    .then((shown) => {
      for (const n of shown) {
        const d = tapData(n.request.content.data);
        if (typeof d?.itemId === 'string' && ids.includes(d.itemId)) Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      }
    })
    .catch(() => {});
});

// A call that came over Bluetooth while the app was in the background: the siren as a notification
// (no service means no push). Tapping it opens Ride Mode and silences it.
setBackgroundSirenNotifier((c: EmergencyCall, plain?: boolean) => {
  const name = c.name?.trim() || tc('A rider');
  Notifications.scheduleNotificationAsync({
    // The tap's id, the same tag the server's push uses, so the two show (and sound) once.
    identifier: c.id,
    content: {
      title: c.possibleCrash ? tc('Possible Crash: {name}', { name }) : tc('EMERGENCY: {name} needs help now', { name }),
      body: tc('Sent over Bluetooth. Tap to see where they are.'),
      // With the siren switched off: the normal sound, on the usual ride alerts channel.
      sound: plain ? 'default' : SIREN_SOUND,
      interruptionLevel: 'timeSensitive',
      data: { type: 'status', status: 'emergency', rideId: c.rideId, itemId: c.id },
    },
    trigger: Platform.OS === 'android' ? { channelId: plain ? 'ride-alerts' : SIREN_CHANNEL } : null,
  }).catch(() => {});
});

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
    myToken = token;
    await sendSirenSetting();
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
      name: tc('Rider Alerts'),
      description: tc('Need Help, EMERGENCY and other status taps from your group.'),
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
    // EMERGENCY with the Emergency Siren on (core/siren.ts). A channel's sound can't change once
    // it is made, so the siren has its own channel; it plays as an alarm, so it is heard with
    // the ringer on silent.
    Notifications.setNotificationChannelAsync(SIREN_CHANNEL, {
      name: tc('Emergency Siren'),
      description: tc('A siren when someone in your group sends EMERGENCY or a crash alert.'),
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: SIREN_SOUND,
      bypassDnd: true,
      enableVibrate: true,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    }),
    Notifications.setNotificationChannelAsync('ride-chat', { name: tc('Ride Chat'), description: tc('Messages in ride and group chats.'), importance: high }),
    Notifications.setNotificationChannelAsync('ride-updates', {
      name: tc('Ride Updates'),
      description: tc('Ride changes, new riders, invites, reminders and account notices.'),
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
    // The rider heard the siren and opened it: it doesn't sound again in the app.
    if (isEmergency(data) && typeof data?.itemId === 'string') silenceEmergency(data.itemId);
    // Its row in the Notifications inbox counts as read.
    markReadForPush(last.notification.request.content.data);
    const target = tapTarget(data);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // Older native builds: the key check above still keeps it to one navigation.
    }
    if (target) router.push(target as never);
  }, [last, navReady]);
}

/** An EMERGENCY push while the app is open sounds the siren; a cancelled one stops it. */
function sirenFromPush(data: TapData | undefined) {
  if (typeof data?.itemId === 'string' && data.type === 'cancelled') return endEmergency(data.itemId);
  const e = emergencyFromPush(data);
  if (e) raiseEmergency(e, registeredFor);
}

/** The EMERGENCY call a push carries, or null. */
function emergencyFromPush(data: TapData | undefined): IncomingEmergency | null {
  if (typeof data?.itemId !== 'string') return null;
  if (!isEmergency(data) || typeof data.rideId !== 'string') return null;
  const d = data as TapData & { name?: unknown; userId?: unknown; tappedAt?: unknown };
  const tappedAt = typeof d.tappedAt === 'string' ? Date.parse(d.tappedAt) : NaN;
  return {
      id: data.itemId,
      rideId: data.rideId,
      // The rider, when the server says (notify-ride-message); else the call stands on its own.
      userId: typeof d.userId === 'string' ? d.userId : unknownRider(data.itemId),
      name: typeof d.name === 'string' ? d.name : null,
      status: 'emergency',
      // A push is news (a tap uploaded late, say after a crash with no service, still sounds),
      // unless it was tapped over an hour ago (core/siren pushCallAt). When the rider tapped it
      // (newer servers say) decides what ends it.
      at: pushCallAt(Number.isFinite(tappedAt) ? tappedAt : undefined, Date.now()),
      tappedAt: Number.isFinite(tappedAt) ? tappedAt : undefined,
      source: 'push',
  };
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
      sirenFromPush(data);
      // The bell on the Rides tab picks it up straight away.
      refreshInbox();
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
