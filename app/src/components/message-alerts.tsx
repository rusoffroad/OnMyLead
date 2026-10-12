import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { alertTitle, isLeaderOnly, isResolved, shouldAlert, type ChatMessage } from '@/core/chat';
import type { NotificationSettings } from '@/core/notifications';
import { currentNotificationSettings, resetNotificationSettings, syncNotificationSettings } from '@/lib/notification-settings';
import { registerForPush, resetPushRegistration, syncRideReminders, useNotificationTaps, useRideChangeReminders } from '@/lib/push';
import { useSession } from '@/lib/session';
import { newChannel, supabase } from '@/lib/supabase';

type Alert = { id: string; title: string; body: string; inviteCode: string | null; accent: string; seconds: number };

const names = new Map<string, string>();
const rides = new Map<string, { name: string; invite_code: string } | null>();

async function senderName(userId: string): Promise<string> {
  if (!names.has(userId)) {
    const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    names.set(userId, data?.display_name || 'A rider');
  }
  return names.get(userId)!;
}

async function rideInfo(rideId: string) {
  if (!rides.has(rideId)) {
    const { data } = await supabase.from('rides').select('name, invite_code').eq('id', rideId).maybeSingle();
    rides.set(rideId, data ?? null);
  }
  return rides.get(rideId) ?? null;
}

/** The pop-up follows the same choices as push: no group chat pop-ups when group chat is off. */
function wanted(m: ChatMessage, s: NotificationSettings): boolean {
  if (m.kind === 'announcement') return s.announcements;
  return isLeaderOnly(m) ? s.leader_messages : s.chat;
}

async function toAlert(m: ChatMessage): Promise<Alert> {
  const [who, ride] = await Promise.all([senderName(m.user_id).catch(() => 'A rider'), rideInfo(m.ride_id).catch(() => null)]);
  const announcement = m.kind === 'announcement';
  return {
    id: m.id,
    title: alertTitle(m, who, ride?.name),
    body: m.poll_options?.length ? `${m.body} Tap to vote.` : m.body,
    inviteCode: ride?.invite_code ?? null,
    accent: announcement ? RideColors.yellow : isLeaderOnly(m) ? RideColors.leader : Colors.accent,
    seconds: announcement ? 10 : 6,
  };
}

/**
 * On-screen pop-up for new ride chat messages, on every screen, for every ride the rider is
 * on. The database only sends a rider the messages they may read, so leader-only messages pop
 * up only for the leader. Anyone can dismiss a pop-up for themselves; one the sender clears or
 * marks resolved before it is seen goes away on its own. Also registers the phone for push notifications after sign-in, and
 * keeps the notification settings and this phone's ride reminders up to date.
 */
export function MessageAlerts() {
  const { session } = useSession();
  const me = session?.user.id;
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<Alert[]>([]);
  const current = queue[0];

  useNotificationTaps();
  useRideChangeReminders();

  useEffect(() => {
    if (!me) {
      resetPushRegistration();
      resetNotificationSettings();
      syncRideReminders(null);
      return;
    }
    const sync = () => {
      registerForPush(me).then(syncNotificationSettings).then((s) => syncRideReminders(s.reminder_minutes));
    };
    sync();
    // Rides joined or moved since: refresh reminders whenever the app comes back to the front.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const channel = newChannel('message-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages' }, (payload) => {
        const m = payload.new as ChatMessage;
        if (!m?.id || !shouldAlert(m, me) || !wanted(m, currentNotificationSettings())) return;
        toAlert(m).then((a) => setQueue((q) => (q.some((x) => x.id === a.id) ? q : [...q, a].slice(-5))));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_messages' }, (payload) => {
        const m = payload.new as ChatMessage;
        if (m?.id && isResolved(m)) setQueue((q) => q.filter((x) => x.id !== m.id));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ride_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setQueue((q) => q.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      setQueue([]);
    };
  }, [me]);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const dismissAll = useCallback(() => setQueue([]), []);

  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!current) return;
    if (shown.current !== current.id) {
      shown.current = current.id;
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const t = setTimeout(dismiss, current.seconds * 1000);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  if (!current) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${current.title}: ${current.body}. Tap to open the ride.`}
        onPress={() => {
          dismiss();
          if (current.inviteCode) router.push({ pathname: '/r/[code]', params: { code: current.inviteCode } });
        }}
        style={[styles.card, { borderLeftColor: current.accent }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.body} numberOfLines={3}>{current.body}</Text>
          {queue.length > 1 ? (
            <View style={styles.moreRow}>
              <Text style={styles.more}>+{queue.length - 1} More</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss all ${queue.length}`} hitSlop={10} onPress={dismissAll}>
                <Text style={styles.dismissAll}>Dismiss All</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={dismiss} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
          <Text style={styles.closeLabel}>Dismiss</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  card: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    backgroundColor: Colors.backgroundSelected,
    borderRadius: Radius.card,
    borderLeftWidth: 5,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  body: { color: Colors.text, fontFamily: font(500), fontSize: 16, lineHeight: 22 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: 2 },
  more: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  dismissAll: { color: Colors.sky, fontFamily: font(700), fontSize: 13 },
  close: { paddingHorizontal: Spacing.one, alignItems: 'center', gap: 2 },
  closeText: { color: Colors.textSecondary, fontSize: 16 },
  closeLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 11 },
});
