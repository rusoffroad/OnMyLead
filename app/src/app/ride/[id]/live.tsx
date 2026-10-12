import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, LayoutAnimation, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupMap, type MapRider } from '@/components/group-map';
import { BreakdownBadge } from '@/components/rider-status-badge';
import { RouteStrip } from '@/components/route-strip';
import { SharePicker } from '@/components/share-picker';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { carPlayState, parseCarPlayAction } from '@/core/carplay';
import {
  breakdownKey, breakdownSpot, BREAKDOWN_SPEAK_WITHIN_MS, isActiveCall, MECHANICAL_LABEL, spokenBreakdown, type TappedStatus,
} from '@/core/breakdown';
import { BUBBLE_PRESETS, computeBubble, type BubblePreset, type BubbleRider, type BubbleSettings } from '@/core/bubble';
import { RANGE_LABEL, checkRideRange } from '@/core/fuel';
import { rideVehicle, vehicleRange, vehicleTitle } from '@/core/garage';
import { latestAnnouncement, QUICK_REPLIES, rideLeaderIds, spokenAnnouncement, type QuickReply } from '@/core/chat';
import { RouteTracker, summarizeMe, type RideRoute } from '@/core/route';
import { isVerticalSwipe, swipeResult } from '@/core/panel-swipe';
import { formatRemaining, formatRemainingShort, RIDE_SHARE_OPTIONS_MIN } from '@/core/sharing';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useTrailMap } from '@/hooks/use-trail-map';
import {
  activeRegroup, dropRegroup, getMembers, getPositions, getRide, getRideRoute, latestStatuses, myActiveShares, myVehicles,
  startLocationShare, stopLocationShare, type ActiveShare, type VehicleWithCost,
} from '@/lib/api';
import { clearCarPlay, onCarPlayAction, showRideOnCarPlay } from '@/lib/carplay';
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
  { kind: 'mechanical', label: MECHANICAL_LABEL },
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
  statuses: Record<string, TappedStatus>;
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
  const trail = useTrailMap();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const me = session?.user.id;

  const [ride, setRide] = useState<Ride | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [statuses, setStatuses] = useState<Record<string, TappedStatus>>({});
  const [regroup, setRegroup] = useState<RegroupPoint | null>(null);
  const [share, setShare] = useState<ActiveShare | null>(null);
  const [askShare, setAskShare] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sosOpen, setSosOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const announced = useRef(new Set<string>());
  const [route, setRoute] = useState<{ route: RideRoute | null; offline: boolean }>({ route: null, offline: false });
  // This phone's own fix, kept on the phone: it places me on the route even when I'm not sharing.
  const [myFix, setMyFix] = useState<{ lat: number; lng: number } | null>(null);
  // Each rider's last progress along the route, so loops and out-and-backs don't make them jump.
  const [tracker] = useState(() => new RouteTracker());
  const routeMiles = useRef<number | null | undefined>(undefined);

  const joined = useMemo(() => members.filter((m) => m.status === 'joined'), [members]);
  const leaderIds = useMemo(() => rideLeaderIds(members, ride?.organizer_id), [members, ride?.organizer_id]);
  const mine = joined.find((m) => m.user_id === me);
  const canRegroup = mine && ['organizer', 'co_organizer', 'leader'].includes(mine.role);
  const watchesBubble = mine && ['organizer', 'co_organizer', 'leader', 'sweep'].includes(mine.role);
  const nameOf = useCallback((userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider', [members]);

  // Announcements: only the latest is shown, and it is read aloud so nobody has to look down.
  const chat = useRideChat(id, !!mine);
  // Riders can fold the reply and status buttons away (tap the handle or swipe down) to see more map.
  // Emergency, and calls for help, always stay.
  const [panelOpen, , setPanelOpenRaw] = useRememberedToggle('ride.modePanelOpen.v1', true);
  const setPanelOpen = useCallback((open: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPanelOpenRaw(open);
  }, [setPanelOpenRaw]);
  // The sharing timer folds down to a small pill next to the ride name.
  const [shareOpen, toggleShareOpen] = useRememberedToggle('ride.shareBannerOpen.v1', false);
  const [panelDrag] = useState(() => new Animated.Value(0));
  const panelSwipe = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isVerticalSwipe(g.dx, g.dy),
      onPanResponderMove: (_e, g) => panelDrag.setValue(panelOpen ? Math.max(0, g.dy) : 0),
      onPanResponderRelease: (_e, g) => {
        const result = swipeResult(panelOpen, g.dy, g.vy);
        if (result) {
          Haptics.selectionAsync();
          panelDrag.setValue(0);
          setPanelOpen(result === 'open');
        } else {
          Animated.spring(panelDrag, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(panelDrag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  [panelOpen, setPanelOpen, panelDrag]);
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
    routeMiles.current = d.ride?.route_miles;
    setMembers(d.members);
    setRegroup(d.regroup);
    setStatuses(d.statuses);
    setPositions(d.positions);
  }, []);
  const refresh = useCallback(() => loadSnapshot(id).then(apply).catch(() => {}), [id, apply]);

  const loadRoute = useCallback(() => getRideRoute(id).then(setRoute).catch(() => {}), [id]);

  // Initial load, then ask to share if this rider has no active ride share.
  useEffect(() => {
    loadSnapshot(id).then(apply).catch(() => {});
    loadRoute();
    myActiveShares().then((all) => {
      const s = all.find((x) => x.scope === 'ride' && x.ride_id === id) ?? null;
      setShare(s);
      if (!s) setAskShare(true);
    });
  }, [id, apply, loadRoute]);

  // Follow this phone's position while Ride Mode is open and there is a route to place it on.
  // Only if location access was already given; this never asks and never uploads.
  const hasRoute = !!route.route;
  useEffect(() => {
    if (!hasRoute) return;
    let sub: Location.LocationSubscription | null = null;
    let gone = false;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.status !== 'granted' || gone) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 20 }, (l) =>
          setMyFix({ lat: l.coords.latitude, lng: l.coords.longitude }),
        );
        if (gone) sub.remove();
      })
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
  }, [hasRoute]);

  // Live updates, with polling as a fallback for flaky connections.
  useEffect(() => {
    const channel = newChannel(`ride-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions_latest' }, (payload) => {
        const p = payload.new as Position;
        if (p?.user_id) setPositions((prev) => ({ ...prev, [p.user_id]: p }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        const s = payload.new as TappedStatus & { user_id: string };
        setStatuses((prev) => ({ ...prev, [s.user_id]: s }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regroup_points', filter: `ride_id=eq.${id}` }, () => {
        activeRegroup(id).then((rg) => {
          setRegroup(rg);
          if (rg) Speech.speak('Regroup point set.');
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${id}` }, (payload) => {
        const next = payload.new as Ride;
        // Saving a route updates the ride's miles; pick up the new route when that happens.
        if (next.route_miles !== routeMiles.current) loadRoute();
        routeMiles.current = next.route_miles;
        setRide(next);
      })
      .subscribe();
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id, refresh, loadRoute]);

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
        role: bubbleRole(m.role, leaderIds.includes(m.user_id)),
        sharing: !!p, // rows only arrive for riders currently sharing with us
        fix: p ? { lat: p.lat, lng: p.lng, at: Date.parse(p.recorded_at), speedMps: p.speed_mps, headingDeg: p.heading_deg } : null,
        lastMovedAt: p?.last_moved_at ? Date.parse(p.last_moved_at) : null,
      };
    });
    return computeBubble(riders, settings, now);
  }, [joined, leaderIds, positions, settings, now]);

  // Spoken alert once per rider each time they turn red (leader and tail gunner only).
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

  // Leader and tail gunner hear a Mechanical Issue the moment it's tapped, once per tap.
  const heardBreakdowns = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!watchesBubble) return;
    const heard = (heardBreakdowns.current ??= new Set<string>());
    for (const [userId, s] of Object.entries(statuses)) {
      if (userId === me || s.status !== 'mechanical') continue;
      const key = breakdownKey(userId, s);
      if (heard.has(key)) continue;
      heard.add(key);
      // Opening Ride Mode doesn't read out a breakdown from long ago.
      if (Date.now() - Date.parse(s.tapped_at) > BREAKDOWN_SPEAK_WITHIN_MS) continue;
      Speech.speak(spokenBreakdown(nameOf(userId)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [statuses, watchesBubble, me, nameOf]);

  const mapRiders: MapRider[] = joined.map((m) => {
    const p = positions[m.user_id];
    const b = bubble.riders.find((x) => x.riderId === m.user_id);
    const st = statuses[m.user_id];
    // A broken-down rider who isn't sharing still shows, at the spot they tapped Mechanical Issue.
    const spot = breakdownSpot(st, p) ?? p;
    return {
      id: m.user_id,
      name: m.profiles?.display_name || 'Rider',
      role: bubbleRole(m.role, leaderIds.includes(m.user_id)),
      status: b?.status ?? 'unknown',
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
      stale: b?.reason === 'no_update',
      breakdown: st?.status === 'mechanical',
      detail: [
        p ? ago(p.recorded_at, now) : st?.status === 'mechanical' && spot ? `location from ${ago(st.tapped_at, now)}` : 'not sharing',
        p?.speed_mps != null ? `${Math.round(p.speed_mps * 2.237)} mph` : null,
        st ? STATUS_LABEL[st.status] : null,
      ].filter(Boolean).join(' · '),
    };
  });

  const placed = useMemo(() => {
    if (!route.route) return [];
    const riders = joined.map((m) => {
      const p = positions[m.user_id];
      const at = m.user_id === me && myFix ? myFix : p ? { lat: p.lat, lng: p.lng } : null;
      return { id: m.user_id, role: bubbleRole(m.role, leaderIds.includes(m.user_id)), at };
    });
    return tracker.place(route.route, riders);
  }, [route.route, joined, leaderIds, positions, me, myFix, tracker]);
  const routeSummary = route.route ? summarizeMe(route.route, placed, me) : null;

  // With a route, tell this rider whether their machine's range (from the garage) covers it.
  const [vehicles, setVehicles] = useState<VehicleWithCost[]>([]);
  useEffect(() => {
    if (hasRoute) myVehicles().then(setVehicles).catch(() => {});
  }, [hasRoute]);
  const rangeNote = useMemo(() => {
    const v = rideVehicle(vehicles, mine?.vehicle_id)?.vehicle;
    const r = v && vehicleRange(v);
    if (!route.route || !v || !r) return null;
    const routeMi = route.route.lengthM / 1609.344;
    const check = checkRideRange(routeMi, { tankGallons: v.tank_gallons!, extraGallons: v.extra_fuel_gallons ?? 0, mpg: v.mpg! });
    return { check, text: `${RANGE_LABEL[check]}. ${v.nickname?.trim() || vehicleTitle(v)} goes about ${Math.round(r.fullRangeMiles)} mi.` };
  }, [vehicles, mine?.vehicle_id, route.route]);

  const helpCalls = joined
    .map((m) => ({ m, s: statuses[m.user_id] }))
    .filter(({ s, m }) => m.user_id !== me && isActiveCall(s, now));
  const separations = watchesBubble ? bubble.riders.filter((r) => r.status === 'red' || r.status === 'yellow') : [];
  // Folded, only the calls nobody should miss stay on screen; the rest are counted on the handle.
  const isUrgentCall = (k: RiderStatusKind) => k === 'emergency' || k === 'need_help';
  // A breakdown stays on screen for the leader and tail gunner too: they're the ones who go back.
  const shownHelpCalls = panelOpen
    ? helpCalls
    : helpCalls.filter(({ s }) => isUrgentCall(s.status) || (watchesBubble && s.status === 'mechanical'));
  const myStatus = me ? statuses[me] : undefined;
  const callSpot = (userId: string) => breakdownSpot(statuses[userId], positions[userId]) ?? positions[userId];
  const shownSeparations = panelOpen ? separations : [];
  const foldedCount = helpCalls.length - shownHelpCalls.length + separations.length - shownSeparations.length;

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

  async function sendEmergency() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    let at: { lat: number; lng: number } | null = null;
    try { at = await currentPosition(); } catch {}
    await sendStatusReliably(id, 'emergency', at);
    setStatuses((prev) => ({ ...prev, [me!]: { status: 'emergency', tapped_at: new Date().toISOString() } }));
  }

  // CarPlay: the car screen mirrors the group's state and sends button presses back here.
  const car = carPlayState({
    rideName: ride?.name ?? 'Ride',
    separated: bubble.alerts.map((a) => ({ riderId: a.riderId, message: a.message ?? 'A rider is separated' })),
    watchesBubble: !!watchesBubble,
    canRegroup: !!canRegroup,
    riders: mapRiders.map((r) => ({
      title: `${r.name}${r.role === 'leader' ? ' (Leader)' : r.role === 'sweep' ? ' (Tail gunner)' : ''}`,
      detail: r.detail,
    })),
    helpCalls: helpCalls.map(({ m, s }) => ({ name: m.profiles?.display_name || 'Rider', status: STATUS_LABEL[s.status] })),
  });
  const carKey = JSON.stringify(car);
  useEffect(() => {
    if (ride) showRideOnCarPlay(JSON.parse(carKey));
  }, [carKey, ride]);
  useEffect(() => () => clearCarPlay(), []);
  const carActions = useRef({ tapStatus, quickReply, regroupHere, sendEmergency });
  useEffect(() => {
    carActions.current = { tapStatus, quickReply, regroupHere, sendEmergency };
  });
  useEffect(() => {
    const sub = onCarPlayAction((buttonId) => {
      const a = parseCarPlayAction(buttonId);
      const act = carActions.current;
      if (a.type === 'status') act.tapStatus(a.kind as RiderStatusKind);
      else if (a.type === 'reply' && (QUICK_REPLIES as readonly string[]).includes(a.body)) act.quickReply(a.body as QuickReply);
      else if (a.type === 'regroup') act.regroupHere();
      else if (a.type === 'emergency') act.sendEmergency();
    });
    return () => sub.remove();
  }, []);

  const navigateTo = (lat: number, lng: number) =>
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);

  const myPos = me ? positions[me] : undefined;
  const shareLeft = activeShare?.expires_at ? Date.parse(activeShare.expires_at) - now : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <GroupMap riders={mapRiders} meId={me} regroup={regroup} route={route.route?.points} trail={trail} />
      <TrailMapOverlay trail={trail} top={insets.top + 66} cardTop={insets.top + 118} route={route.route?.points} ride={ride} />

      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} accessibilityLabel="Back" style={{ flexShrink: 1 }}>
            <Text style={styles.topText} numberOfLines={1}>‹ {ride?.name ?? 'Ride'}</Text>
          </Pressable>
          <View style={styles.topRight}>
            <Pressable
              onPress={() => (activeShare ? toggleShareOpen() : setAskShare(true))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={activeShare ? { expanded: shareOpen } : undefined}
              accessibilityLabel={
                activeShare
                  ? `Sharing your location, ${formatRemaining(shareLeft)}. Tap for details`
                  : 'Not sharing your location. Tap to share'
              }
              style={[styles.sharePill, activeShare ? styles.sharePillOn : styles.sharePillOff]}>
              <View style={[styles.shareDot, { backgroundColor: activeShare ? '#fff' : Colors.textSecondary }]} />
              <Text style={[styles.sharePillText, !activeShare && { color: Colors.textSecondary }]}>
                {activeShare ? formatRemainingShort(shareLeft) : 'Off'}
              </Text>
            </Pressable>
            <Text style={[styles.topText, { color: bubble.alerts.length ? RideColors.red : RideColors.green }]}>
              {bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Together'}
            </Text>
          </View>
        </View>
        {activeShare && shareOpen ? (
          <View style={styles.shareBanner}>
            <Text style={[styles.shareText, { flex: 1, textAlign: 'left' }]}>
              Sharing, {formatRemaining(shareLeft)}
            </Text>
            <Pressable onPress={endShare} hitSlop={8} accessibilityRole="button" style={styles.shareAction}>
              <Text style={styles.shareActionText}>Stop</Text>
            </Pressable>
            <Pressable onPress={toggleShareOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide sharing details" style={styles.shareAction}>
              <Text style={styles.shareActionText}>Hide</Text>
            </Pressable>
          </View>
        ) : null}
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

      <Animated.View {...panelSwipe.panHandlers} style={[styles.bottomWrap, { transform: [{ translateY: panelDrag }] }]}>
      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        {route.route ? (
          <RouteStrip
            lengthM={route.route.lengthM}
            riders={placed}
            meId={me}
            summary={routeSummary}
            nameOf={nameOf}
            offline={route.offline}
            range={rangeNote}
            compact={!panelOpen}
          />
        ) : null}
        <Pressable
          onPress={() => setPanelOpen(!panelOpen)}
          accessibilityRole="button"
          accessibilityState={{ expanded: panelOpen }}
          accessibilityLabel={panelOpen ? 'Hide the message and status buttons' : 'Show the message and status buttons'}
          accessibilityHint="You can also swipe the panel down to hide it or up to show it"
          hitSlop={8}
          style={styles.handle}>
          <View style={styles.handleBar} />
          {panelOpen ? <Text style={styles.handleText}>Hide ▼</Text> : null}
        </Pressable>

        {shownSeparations.length || shownHelpCalls.length ? (
          <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ gap: Spacing.two }}>
            {shownSeparations.map((r) => {
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
            })}
            {shownHelpCalls.map(({ m, s }) => {
              const spot = callSpot(m.user_id);
              return (
                <Card key={`s-${m.user_id}`} style={{ borderLeftWidth: 6, borderLeftColor: isUrgentCall(s.status) ? RideColors.red : RideColors.yellow }}>
                  <View style={styles.callRow}>
                    {s.status === 'mechanical' ? <BreakdownBadge size={24} /> : null}
                    <ThemedText type="smallBold" style={{ flex: 1 }}>
                      {m.profiles?.display_name || 'Rider'}: {STATUS_LABEL[s.status]}, {ago(s.tapped_at, now)}
                    </ThemedText>
                  </View>
                  {spot ? <Button title="Navigate" kind="secondary" onPress={() => navigateTo(spot.lat, spot.lng)} /> : null}
                </Card>
              );
            })}
          </ScrollView>
        ) : null}

        {myStatus?.status === 'mechanical' ? (
          <View style={styles.myBreakdown}>
            <BreakdownBadge size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.myBreakdownTitle}>{MECHANICAL_LABEL} Sent</Text>
              <Text style={styles.myBreakdownBody}>Your leader and tail gunner can see where you are.</Text>
            </View>
            <Pressable
              onPress={() => tapStatus('ok')}
              accessibilityRole="button"
              accessibilityLabel="Fixed. Send status OK"
              style={({ pressed }) => [styles.myBreakdownOk, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.myBreakdownOkText}>Fixed, I’m OK</Text>
            </Pressable>
          </View>
        ) : null}

        {!panelOpen ? (
          <View style={styles.foldedRow}>
            <Pressable
              onPress={() => setPanelOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={foldedCount ? `Show buttons and ${foldedCount} more alerts` : 'Show the message and status buttons'}
              style={({ pressed }) => [styles.foldedShow, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.foldedShowText}>Buttons ▲</Text>
              {foldedCount ? (
                <View style={styles.foldedBadge}>
                  <Text style={styles.foldedBadgeText}>{foldedCount}</Text>
                </View>
              ) : null}
            </Pressable>
            {myStatus?.status !== 'mechanical' ? (
              <Pressable
                onPress={() => tapStatus('mechanical')}
                accessibilityRole="button"
                accessibilityLabel={`Send status ${MECHANICAL_LABEL}`}
                style={({ pressed }) => [styles.foldedMech, { opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.statusText, styles.mechText]}>{MECHANICAL_LABEL}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => tapStatus('emergency')}
              accessibilityRole="button"
              accessibilityLabel="Send status EMERGENCY"
              style={({ pressed }) => [styles.foldedSos, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.statusText}>EMERGENCY</Text>
            </Pressable>
          </View>
        ) : null}

        {panelOpen ? (
          <>
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
                    {
                      backgroundColor:
                        s.kind === 'emergency' ? Colors.danger : s.urgent ? Colors.accent : s.kind === 'mechanical' ? RideColors.yellow : Colors.backgroundSelected,
                      opacity: pressed ? 0.75 : 1,
                    },
                    myStatus?.status === s.kind && { borderColor: Colors.text, borderWidth: 3 },
                  ]}>
                  <Text style={[styles.statusText, s.kind === 'mechanical' && styles.mechText]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </SafeAreaView>
      </Animated.View>

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
                await sendEmergency();
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },
  sharePill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 15 },
  sharePillOn: { backgroundColor: Colors.sky },
  sharePillOff: { backgroundColor: Colors.backgroundSelected },
  shareDot: { width: 8, height: 8, borderRadius: 4 },
  sharePillText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 16 },
  shareBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.control, paddingLeft: 14, paddingRight: 6,
    minHeight: 44, backgroundColor: Colors.sky,
  },
  shareText: { color: '#fff', fontFamily: font(700), fontSize: 15, textAlign: 'center' },
  shareAction: { minHeight: 32, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  shareActionText: { color: '#fff', fontFamily: font(700), fontSize: 14 },
  bottomWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottom: {
    padding: Spacing.two, paddingTop: 12,
    backgroundColor: 'rgba(10,22,38,0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  foldedRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  foldedShow: {
    flex: 1, minHeight: 56, borderRadius: Radius.control, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected,
  },
  foldedShowText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  foldedBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: RideColors.yellow },
  foldedBadgeText: { color: '#1A1100', fontFamily: font(800), fontSize: 14 },
  foldedMech: { flex: 1, minHeight: 56, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: RideColors.yellow, paddingHorizontal: 6 },
  mechText: { color: '#1A1100', fontSize: 18, lineHeight: 20 },
  myBreakdown: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.two, padding: 10, paddingLeft: 12,
    borderRadius: Radius.control, backgroundColor: Colors.backgroundElement, borderLeftWidth: 6, borderLeftColor: RideColors.yellow,
  },
  myBreakdownTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
  myBreakdownBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  myBreakdownOk: { minHeight: 44, paddingHorizontal: 12, borderRadius: Radius.control, justifyContent: 'center', backgroundColor: RideColors.green },
  myBreakdownOkText: { color: '#06210F', fontFamily: font(700, 'display'), fontSize: 17 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foldedSos: { flex: 1, minHeight: 56, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.danger },
  actions: { flexDirection: 'row', gap: Spacing.two },
  handle: { alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'center', marginTop: -6 },
  handleBar: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.textSecondary, opacity: 0.6 },
  handleText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
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
