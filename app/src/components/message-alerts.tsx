import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { alertTitle, isLeaderOnly, shouldAlert, type ChatMessage } from '@/core/chat';
import { registerForPush, resetPushRegistration, useNotificationTaps } from '@/lib/push';
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

async function toAlert(m: ChatMessage): Promise<Alert> {
  const [who, ride] = await Promise.all([senderName(m.user_id).catch(() => 'A rider'), rideInfo(m.ride_id).catch(() => null)]);
  const announcement = m.kind === 'announcement';
  return {
    id: m.id,
    title: alertTitle(m, who, ride?.name),
    body: m.body,
    inviteCode: ride?.invite_code ?? null,
    accent: announcement ? RideColors.yellow : isLeaderOnly(m) ? RideColors.leader : Colors.accent,
    seconds: announcement ? 10 : 6,
  };
}

/**
 * On-screen pop-up for new ride chat messages, on every screen, for every ride the rider is
 * on. The database only sends a rider the messages they may read, so leader-only messages pop
 * up only for the leader. Also registers the phone for push notifications after sign-in.
 */
export function MessageAlerts() {
  const { session } = useSession();
  const me = session?.user.id;
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<Alert[]>([]);
  const current = queue[0];

  useNotificationTaps();

  useEffect(() => {
    if (me) registerForPush(me);
    else resetPushRegistration();
  }, [me]);

  useEffect(() => {
    if (!me) return;
    const channel = newChannel('message-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages' }, (payload) => {
        const m = payload.new as ChatMessage;
        if (!m?.id || !shouldAlert(m, me)) return;
        toAlert(m).then((a) => setQueue((q) => (q.some((x) => x.id === a.id) ? q : [...q, a].slice(-5))));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      setQueue([]);
    };
  }, [me]);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

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
          {queue.length > 1 ? <Text style={styles.more}>+{queue.length - 1} more</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={dismiss} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
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
  more: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  close: { paddingHorizontal: Spacing.one },
  closeText: { color: Colors.textSecondary, fontSize: 16 },
});
