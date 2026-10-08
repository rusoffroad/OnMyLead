import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupMap, type MapRider } from '@/components/group-map';
import { SharePicker } from '@/components/share-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { BUBBLE_PRESETS, computeBubble, type BubblePreset, type BubbleRider, type BubbleSettings } from '@/core/bubble';
import { latestAnnouncement, QUICK_REPLIES, spokenAnnouncement, type QuickReply } from '@/core/chat';
import { formatRemaining, RIDE_SHARE_OPTIONS_MIN } from '@/core/sharing';
import { useRideChat } from '@/hooks/use-ride-chat';
import {
  activeRegroup, dropRegroup, getMembers, getPositions, getRide, latestStatuses, myActiveShares,
  startLocationShare, stopLocationShare, type ActiveShare,
} from '@/lib/api';
import { currentPosition, startSendingLocation, stopSendingLocation } from '@/lib/location';
import { flushOutbox, sendQuickReplyReliably, sendStatusReliably } from '@/lib/outbox';
import { useSession } from '@/lib/session';
import { newChannel, supabase } from '@/lib/supabase';
import { bubbleRole, type Position, type RegroupPoint, type Ride, type RideMember, type RiderStatusKind } from '@/lib/types';

// If anything in Ride Mode still throws, show Expo Router's retry screen instead of closing the app.
export { ErrorBoundary } from 'expo-router';

const STATUSES: { kind: RiderStatusKind; label: string; urgent?: boolean }[] = [
  { kind: 'ok', label: 'OK' },
  { kind: 'stopped', label: 'Stopped' },
  { kind: 'need_fuel', label: 'Need fuel' },
  { kind: 'mechanical', label: 'Mechanical' },
  { kind: 'flat_tire', label: 'Flat tire' },
  { kind: 'stuck', label: 'Stuck' },
  { kind: 'lost', label: 'Lost' },
  { kind: 'need_help', label: 'Need help', urgent: true },
  { kind: 'emergency', label: 'EMERGENCY', urgent: true },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.kind, s.label])) as Record<RiderStatusKind, string>;

const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return 'no location yet';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? 'just now' : `${Math.round(s / 60)} min ago`;
};

type RideSnapshot = {
  ride: Ride | null;
  members: RideMember[];
  regroup: RegroupPoint | null;
  statuses: Record<string, { status: RiderStatusKind; tapped_at: string }>;
  positions: Record<string, Position>;
};

async function loadSnapshot(id: string): Promise<RideSnapshot> {
  await flushOutbox();
  const [ride, members, regroup, st] = await Promise.all([getRide(id), getMembers(id), activeRegroup(id), latestStatuses(id)]);
  const statuses: RideSnapshot['statuses'] = {};
  for (const s of st) if (!statuses[s.user_id]) statuses[s.user_id] = s;
  const pos = await getPositions(members.filter((x) => x.status === 'joined').map((x) => x.user_id));
  return { ride, members, regroup, statuses, positions: Object.fromEntries(pos.map((p) => [p.user_id, p])) };
}

export default function RideMode() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;

  const [ride, setRide] = useState<Ride | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [statuses, setStatuses] = useState<Record<string, { status: RiderStatusKind; tapped_at: string }>>({});
  const [regroup, setRegroup] = useState<RegroupPoint | null>(null);
  const [share, setShare] = useState<ActiveShare | null>(null);
  const [askShare, setAskShare] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sosOpen, setSosOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const announced = useRef(new Set<string>());

  const joined = useMemo(() => members.filter((m) => m.status === 'joined'), [members]);
  const mine = joined.find((m) => m.user_id === me);
  const canRegroup = mine && ['organizer', 'co_organizer', 'leader'].includes(mine.role);
  const watchesBubble = mine && ['organizer', 'co_organizer', 'leader', 'sweep'].includes(mine.role);
  const nameOf = useCallback((userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider', [members]);

  // Announcements: only the latest is shown, and it is read aloud so nobody has to look down.
  const chat = useRideChat(id, !!mine);
  const announcement = useMemo(() => latestAnnouncement(chat.messages), [chat.messages]);
  const [lastReply, setLastReply] = useState<QuickReply | null>(null);
  const spokenId = useRef<string | null>(null);
  const firstAnnouncement = useRef(true);
  useEffect(() => {
    if (!announcement || spokenId.current === announcement.id) return;
    spokenId.current = announcement.id;
    // On entering Ride Mode, only repeat an announcement that is still fresh.
    const old = firstAnnouncement.current && Date.now() - Date.parse(announcement.created_at) > 10 * 60_000;
    firstAnnouncement.current = false;
    if (old || announcement.user_id === me) return;
    Speech.speak(spokenAnnouncement(nameOf(announcement.user_id), announcement.body));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [announcement, me, nameOf]);

  const apply = useCallback((d: RideSnapshot) => {
    setRide(d.ride);
    setMembers(d.members);
    setRegroup(d.regroup);
    setStatuses(d.statuses);
    setPositions(d.positions);
  }, []);
  const refresh = useCallback(() => loadSnapshot(id).then(apply).catch(() => {}), [id, apply]);

  // Initial load, then ask to share if this rider has no active ride share.
  useEffect(() => {
    loadSnapshot(id).then(apply).catch(() => {});
    myActiveShares().then((all) => {
      const s = all.find((x) => x.scope === 'ride' && x.ride_id === id) ?? null;
      setShare(s);
      if (!s) setAskShare(true);
    });
  }, [id, apply]);

  // Live updates, with polling as a fallback for flaky connections.
  useEffect(() => {
    const channel = newChannel(`ride-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions_latest' }, (payload) => {
        const p = payload.new as Position;
        if (p?.user_id) setPositions((prev) => ({ ...prev, [p.user_id]: p }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        const s = payload.new as { user_id: string; status: RiderStatusKind; tapped_at: string };
        setStatuses((prev) => ({ ...prev, [s.user_id]: s }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regroup_points', filter: `ride_id=eq.${id}` }, () => {
        activeRegroup(id).then((rg) => {
          setRegroup(rg);
          if (rg) Speech.speak('Regroup point set.');
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${id}` }, (payload) => {
        setRide(payload.new as Ride);
      })
      .subscribe();
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id, refresh]);

  // A share is live only until its timer runs out or the ride ends (the server enforces the same).
  const rideOver = ride?.status === 'ended' || ride?.status === 'cancelled';
  const activeShare = share && !rideOver && !(share.expires_at && Date.parse(share.expires_at) <= now) ? share : null;
  const hadShare = useRef(false);
  useEffect(() => {
    if (activeShare) hadShare.current = true;
    else if (hadShare.current) {
      hadShare.current = false;
      stopSendingLocation();
    }
  }, [activeShare]);

  const settings: BubbleSettings = useMemo(() => {
    if (!ride) return BUBBLE_PRESETS.default;
    return ride.bubble_preset === 'custom' ? BUBBLE_PRESETS.default : BUBBLE_PRESETS[ride.bubble_preset as BubblePreset];
  }, [ride]);

  const bubble = useMemo(() => {
    const riders: BubbleRider[] = joined.map((m) => {
      const p = positions[m.user_id];
      return {
        id: m.user_id,
        name: m.profiles?.display_name || 'Rider',
        role: bubbleRole(m.role),
        sharing: !!p, // rows only arrive for riders currently sharing with us
        fix: p ? { lat: p.lat, lng: p.lng, at: Date.parse(p.recorded_at), speedMps: p.speed_mps, headingDeg: p.heading_deg } : null,
        lastMovedAt: p?.last_moved_at ? Date.parse(p.last_moved_at) : null,
      };
    });
    return computeBubble(riders, settings, now);
  }, [joined, positions, settings, now]);

  // Spoken alert once per rider each time they turn red (Leader and Sweep only).
  useEffect(() => {
    if (!watchesBubble) return;
    const red = new Set(bubble.alerts.map((a) => a.riderId));
    for (const a of bubble.alerts) {
      if (!announced.current.has(a.riderId) && a.message) {
        Speech.speak(a.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
    announced.current = red;
  }, [bubble.alerts, watchesBubble]);

  const mapRiders: MapRider[] = joined.map((m) => {
    const p = positions[m.user_id];
    const b = bubble.riders.find((x) => x.riderId === m.user_id);
    const st = statuses[m.user_id];
    return {
      id: m.user_id,
      name: m.profiles?.display_name || 'Rider',
      role: bubbleRole(m.role),
      status: b?.status ?? 'unknown',
      lat: p?.lat ?? null,
      lng: p?.lng ?? null,
      stale: b?.reason === 'no_update',
      detail: [
        p ? ago(p.recorded_at, now) : 'not sharing',
        p?.speed_mps != null ? `${Math.round(p.speed_mps * 2.237)} mph` : null,
        st ? STATUS_LABEL[st.status] : null,
      ].filter(Boolean).join(' · '),
    };
  });

  const helpCalls = joined
    .map((m) => ({ m, s: statuses[m.user_id] }))
    .filter(({ s, m }) => s && m.user_id !== me && !['ok'].includes(s.status) && now - Date.parse(s.tapped_at) < 30 * 60_000);

  async function beginShare(minutes: number | null) {
    setBusy(true);
    try {
      const s = await startLocationShare({ scope: 'ride', rideId: id, durationMin: minutes });
      await startSendingLocation(id);
      setShare(s);
      setAskShare(false);
    } catch (e) {
      Alert.alert('Could not start sharing', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function endShare() {
    if (share) await stopLocationShare(share.id);
    await stopSendingLocation();
    setShare(null);
  }

  async function tapStatus(kind: RiderStatusKind) {
    if (kind === 'emergency') return setSosOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let at: { lat: number; lng: number } | null = null;
    try {
      at = await currentPosition();
    } catch {}
    const sent = await sendStatusReliably(id, kind, at);
    setStatuses((prev) => ({ ...prev, [me!]: { status: kind, tapped_at: new Date().toISOString() } }));
    if (!sent) Alert.alert('No signal', `"${STATUS_LABEL[kind]}" will send as soon as you're back in service.`);
  }

  async function quickReply(body: QuickReply) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLastReply(body);
    const sent = await sendQuickReplyReliably(id, body);
    if (sent) chat.reload();
    else Alert.alert('No signal', `"${body}" will send as soon as you're back in service.`);
  }

  async function regroupHere() {
    try {
      const p = await currentPosition();
      await dropRegroup(id, p.lat, p.lng, 'Regroup here');
      refresh();
    } catch (e) {
      Alert.alert('Could not set regroup point', e instanceof Error ? e.message : String(e));
    }
  }

  const navigateTo = (lat: number, lng: number) =>
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);

  const myPos = me ? positions[me] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <GroupMap riders={mapRiders} regroup={regroup} />

      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} accessibilityLabel="Back">
            <Text style={styles.topText}>‹ {ride?.name ?? 'Ride'}</Text>
          </Pressable>
          <Text style={[styles.topText, { color: bubble.alerts.length ? RideColors.red : RideColors.green }]}>
            {bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Group together'}
          </Text>
        </View>
        <Pressable onPress={() => (activeShare ? endShare() : setAskShare(true))} style={[styles.shareBanner, { backgroundColor: activeShare ? Colors.sky : Colors.backgroundSelected }]}>
          <Text style={styles.shareText}>
            {activeShare
              ? `Sharing with this ride, ${formatRemaining(activeShare.expires_at ? Date.parse(activeShare.expires_at) - now : null)}. Tap to stop`
              : 'Not sharing your location. Tap to share'}
          </Text>
        </Pressable>
        {regroup ? (
          <Pressable onPress={() => navigateTo(regroup.lat, regroup.lng)} style={[styles.shareBanner, { backgroundColor: RideColors.yellow }]}>
            <Text style={[styles.shareText, { color: '#1A1100' }]}>Regroup point set. Tap to navigate</Text>
          </Pressable>
        ) : null}
        {announcement ? (
          <Pressable
            onPress={() => Speech.speak(spokenAnnouncement(nameOf(announcement.user_id), announcement.body))}
            accessibilityRole="button"
            accessibilityLabel={`Announcement from ${nameOf(announcement.user_id)}: ${announcement.body}. Tap to hear it again.`}
            style={styles.announcement}>
            <Text style={styles.announcementLabel}>Announcement from {nameOf(announcement.user_id)}. Tap to hear it again</Text>
            <Text style={styles.announcementText} numberOfLines={3}>{announcement.body}</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: Spacing.two }}>
          {watchesBubble
            ? bubble.riders
                .filter((r) => r.status === 'red' || r.status === 'yellow')
                .map((r) => {
                  const p = positions[r.riderId];
                  return (
                    <Card key={r.riderId} style={{ borderLeftWidth: 6, borderLeftColor: RideColors[r.status] }}>
                      <ThemedText type="smallBold">{r.message}</ThemedText>
                      <View style={styles.actions}>
                        {p ? <Button title="Navigate" kind="secondary" onPress={() => navigateTo(p.lat, p.lng)} /> : null}
                        {canRegroup ? <Button title="Regroup" kind="secondary" onPress={regroupHere} /> : null}
                      </View>
                    </Card>
                  );
                })
            : null}
          {helpCalls.map(({ m, s }) => (
            <Card key={`s-${m.user_id}`} style={{ borderLeftWidth: 6, borderLeftColor: s.status === 'emergency' || s.status === 'need_help' ? RideColors.red : RideColors.yellow }}>
              <ThemedText type="smallBold">
                {m.profiles?.display_name || 'Rider'}: {STATUS_LABEL[s.status]}, {ago(s.tapped_at, now)}
              </ThemedText>
              {positions[m.user_id] ? (
                <Button title="Navigate" kind="secondary" onPress={() => navigateTo(positions[m.user_id].lat, positions[m.user_id].lng)} />
              ) : null}
            </Card>
          ))}
        </ScrollView>

        {canRegroup ? <Button title="Regroup at my location" big onPress={regroupHere} style={{ marginTop: Spacing.two }} /> : null}

        <View style={styles.replies}>
          {QUICK_REPLIES.map((q) => (
            <Pressable
              key={q}
              onPress={() => quickReply(q)}
              accessibilityRole="button"
              accessibilityLabel={`Send to the group: ${q}`}
              style={({ pressed }) => [
                styles.replyBtn,
                { opacity: pressed ? 0.75 : 1 },
                lastReply === q && { borderColor: Colors.text, borderWidth: 3 },
              ]}>
              <Text style={styles.replyText}>{q}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.grid}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.kind}
              onPress={() => tapStatus(s.kind)}
              accessibilityRole="button"
              accessibilityLabel={`Send status ${s.label}`}
              style={({ pressed }) => [
                styles.statusBtn,
                { backgroundColor: s.kind === 'emergency' ? Colors.danger : s.urgent ? Colors.accent : Colors.backgroundSelected, opacity: pressed ? 0.75 : 1 },
                statuses[me ?? '']?.status === s.kind && { borderColor: Colors.text, borderWidth: 3 },
              ]}>
              <Text style={styles.statusText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <Modal visible={askShare && ride?.status === 'live'} animationType="slide" transparent onRequestClose={() => setAskShare(false)}>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <ThemedText type="subtitle" style={styles.sheetTitle}>Share your location with this ride?</ThemedText>
            <ThemedText type="small" style={styles.sheetBody}>
              Only riders on this ride will see you. Sharing stops automatically when time runs out or the ride ends.
            </ThemedText>
            <SharePicker options={RIDE_SHARE_OPTIONS_MIN} openLabel="Until I leave the ride" onPick={beginShare} busy={busy} />
            <Button title="Not now" kind="secondary" onPress={() => setAskShare(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={sosOpen} animationType="fade" transparent onRequestClose={() => setSosOpen(false)}>
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { borderTopColor: RideColors.red, borderTopWidth: 6 }]}>
            <ThemedText type="subtitle" style={styles.sheetTitle}>Emergency</ThemedText>
            <ThemedText style={styles.sheetBody}>
              This alerts everyone on the ride with your location. It does not contact emergency services. Call 911 if anyone is hurt.
            </ThemedText>
            {myPos ? (
              <ThemedText style={[styles.sheetBody, { fontSize: 24, fontWeight: 800, color: Colors.text }]}>
                {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)}
              </ThemedText>
            ) : null}
            <Button
              title="Alert my group"
              kind="danger"
              big
              onLongPress={async () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                let at: { lat: number; lng: number } | null = null;
                try { at = await currentPosition(); } catch {}
                await sendStatusReliably(id, 'emergency', at);
                setSosOpen(false);
              }}
              delayLongPress={1500}
            />
            <ThemedText type="small" style={styles.sheetBody}>Press and hold to send.</ThemedText>
            <Button title="Call 911" kind="danger" onPress={() => Linking.openURL('tel:911')} />
            <Button title="Cancel" kind="secondary" onPress={() => setSosOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two, gap: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(10,22,38,0.9)', borderRadius: Radius.control, paddingHorizontal: 14, minHeight: 48 },
  topText: { color: Colors.text, fontSize: 20, fontFamily: font(700, 'display') },
  shareBanner: { borderRadius: Radius.control, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  shareText: { color: '#fff', fontFamily: font(700), fontSize: 15, textAlign: 'center' },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.two, paddingTop: 12,
    backgroundColor: 'rgba(10,22,38,0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  actions: { flexDirection: 'row', gap: Spacing.two },
  announcement: { borderRadius: Radius.control, padding: 12, backgroundColor: RideColors.yellow, gap: 2 },
  announcementLabel: { color: '#3A2600', fontFamily: font(700), fontSize: 13 },
  announcementText: { color: '#1A1100', fontFamily: font(800), fontSize: 19, lineHeight: 24 },
  replies: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  replyBtn: { flex: 1, minHeight: 58, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.sky, paddingHorizontal: 4 },
  replyText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  statusBtn: { width: '31.5%', minHeight: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 20, textAlign: 'center' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: Colors.backgroundElement, padding: Spacing.four, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetTitle: { color: Colors.text },
  sheetBody: { color: Colors.textSecondary },
});
