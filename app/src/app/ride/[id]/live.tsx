import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionsSheet } from '@/components/directions';
import { GroupMap, type MapRider } from '@/components/group-map';
import { Icon } from '@/components/icon';
import { KeyboardLift } from '@/components/keyboard';
import { BreakdownBadge } from '@/components/rider-status-badge';
import { RiderList, RiderRows } from '@/components/rider-list';
import { RouteStrip } from '@/components/route-strip';
import { BroadcastCard } from '@/components/broadcast-card';
import { SharePicker } from '@/components/share-picker';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { WaypointBlaze } from '@/components/waypoint-blaze';
import { WaypointSheet, type WaypointSheetTarget } from '@/components/waypoint-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Colors, font, Radius, RideColors, Spacing } from '@/constants/theme';
import { carPlayState, parseCarPlayAction } from '@/core/carplay';
import {
  breakdownKey, breakdownSpot, BREAKDOWN_SPEAK_WITHIN_MS, isActiveCall, MECHANICAL_LABEL, spokenBreakdown, type TappedStatus,
} from '@/core/breakdown';
import { tally } from '@/core/broadcast';
import { BUBBLE_PRESETS, computeBubble, type BubblePreset, type BubbleRider, type BubbleSettings } from '@/core/bubble';
import { rideDirections } from '@/core/directions';
import { riderFreshness, viewerOfflineSince } from '@/core/freshness';
import { RANGE_LABEL, checkRideRange } from '@/core/fuel';
import { mapPanelWidth, sidebarWidth } from '@/core/layout';
import { rideVehicle, vehicleRange, vehicleTitle } from '@/core/garage';
import { latestAnnouncement, QUICK_REPLIES, rideLeaderIds, spokenAnnouncement, type QuickReply } from '@/core/chat';
import { RouteTracker, summarizeMe, type RideRoute } from '@/core/route';
import { formatRemaining, formatRemainingShort, RIDE_SHARE_OPTIONS_MIN } from '@/core/sharing';
import { canShareWaypoints, WAYPOINTS_NOT_SWITCHED_ON } from '@/core/waypoints';
import { newTapId, useAcknowledge, useBroadcast } from '@/hooks/use-broadcast';
import { useLayout } from '@/hooks/use-layout';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import { useTrailMap } from '@/hooks/use-trail-map';
import {
  activeRegroup, dropRegroup, getMembers, getPositions, getPrivateDetails, getRide, getRideRoute, latestStatuses, myActiveShares, myVehicles,
  startLocationShare, stopLocationShare, type ActiveShare, type VehicleWithCost,
} from '@/lib/api';
import { clearCarPlay, onCarPlayAction, showRideOnCarPlay } from '@/lib/carplay';
import { openDirections } from '@/lib/directions';
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
  { kind: 'need_fuel', label: 'Need Fuel' },
  { kind: 'mechanical', label: MECHANICAL_LABEL },
  { kind: 'flat_tire', label: 'Flat Tire' },
  { kind: 'stuck', label: 'Stuck' },
  { kind: 'lost', label: 'Lost' },
  { kind: 'need_help', label: 'Need Help', urgent: true },
  { kind: 'emergency', label: 'EMERGENCY', urgent: true },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.kind, s.label])) as Record<RiderStatusKind, string>;

// Room the open panel needs below the banners to show the full route strip (with and without
// alert cards); with less, the strip shows just the line so the buttons still fit.
const FULL_STRIP_ROOM = 640;
const FULL_STRIP_ROOM_WITH_ALERTS = 720;
// The alert cards and the top banners scroll rather than shrink below these.
const ALERTS_MIN = 72;
const ALERTS_MAX = 180;
const BANNERS_MIN = 76;
const WP_FAB_H = 44;
// On a tablet the panels float this far from the screen's edges.
const EDGE = 12;
// On a tablet the controls panel starts below the map layers button (and its downloaded-map tag).
const TABLET_PANEL_TOP = 112;

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
  const layout = useLayout();
  const screenH = layout.height;
  // On a tablet (or any window Medium width and up) the map fills the screen: the ride, its banners
  // and the riders sit in a sidebar on the left, and the message and status buttons in a panel on
  // the right, so the leader sees the map, every rider and the controls at once.
  const tablet = layout.wide;
  const panelW = mapPanelWidth(layout.width);
  const sideW = sidebarWidth(layout.width);
  const panelBottom = tablet ? Math.max(insets.bottom, EDGE) : 0;
  // The top banners (no service, sharing, regroup, announcement) and the bottom panel share the
  // screen and never cover each other. When room is short the route strip goes compact, then the
  // alert cards scroll, then the banners scroll; the status buttons always stay whole.
  const [topRowBottom, setTopRowBottom] = useState(0);
  const [bannersH, setBannersH] = useState(0);
  const [alertsH, setAlertsH] = useState(0);
  const [stripH, setStripH] = useState(0);
  // The compact strip's last measured height, to tell whether it fits again once it is hidden.
  const [compactStripH, setCompactStripH] = useState(90);
  // Gone from the panel, the strip takes no room. (A stable ref, so it isn't detached each render.)
  const stripRef = useCallback((v: View | null) => {
    if (!v) setStripH(0);
  }, []);
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
  const [ridersOpen, setRidersOpen] = useState(false);
  // When this phone last heard from the server (a refresh or a live update). Long silence means
  // we have no service, so other riders' ages say nothing about their own signal.
  const [lastHeardAt, setLastHeardAt] = useState(() => Date.now());
  const heard = useCallback(() => setLastHeardAt(Date.now()), []);
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

  // Waypoints: the leader's shared ones and this rider's own. Press and hold the map to drop one.
  const wp = useRideWaypoints(id, !!mine);
  const canShareWp = canShareWaypoints(me, mine, leaderIds);
  const [wpTarget, setWpTarget] = useState<WaypointSheetTarget>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  // The exact meeting point, for directions; only riders on the ride get it back.
  const [meet, setMeet] = useState<{ lat: number; lng: number; label: string | null } | null>(null);
  const [panelH, setPanelH] = useState(0);
  const openNewWaypoint = useCallback((at: { lat: number; lng: number }) => {
    if (!wp.switchedOn) return Alert.alert('Not Switched On Yet', WAYPOINTS_NOT_SWITCHED_ON);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWpTarget({ type: 'new', at });
  }, [wp.switchedOn]);

  // Announcements: only the latest is shown, and it is read aloud so nobody has to look down.
  const chat = useRideChat(id, !!mine);
  // Riders can fold the reply and status buttons away (tap the handle or swipe down) to see more map.
  // Emergency, and calls for help, always stay.
  const { open: panelOpen, setOpen: setPanelOpen, drag: panelDrag, panHandlers: panelSwipeHandlers } = usePanelFold('ride.modePanelOpen.v1');
  // The sharing timer folds down to a small pill next to the ride name.
  const [shareOpen, toggleShareOpen] = useRememberedToggle('ride.shareBannerOpen.v1', false);
  // Tablets: the riders sidebar folds away to the left (swipe it left, or tap Hide) to see more map.
  const sidebar = usePanelFold('ride.ridersSidebarOpen.v1', true, 'left', layout.expanded);
  const announcement = useMemo(() => latestAnnouncement(chat.messages), [chat.messages]);
  const [lastReply, setLastReply] = useState<QuickReply | null>(null);
  // The last status tap or quick reply: Sending, then Sent with who has it, or Waiting for
  // Signal; Cancel takes it back. Before the database has Cancel, a status is cancelled by
  // telling the group "OK" and a quick reply by clearing it from the chat.
  const broadcast = useBroadcast(id, me, async (b) => {
    if (b.kind === 'reply') {
      if (!(await chat.clear(b.id))) throw new Error('Could not take the message back. Try again.');
    } else {
      await sendStatusReliably(id, 'ok', null, newTapId());
    }
  });
  // Status calls this rider has dismissed on their own screen (they come back if the rider taps again).
  const [dismissedCalls, setDismissedCalls] = useState<Set<string>>(() => new Set());
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

  // Other riders' status taps reached this phone: their card says so.
  const ackItems = useMemo(
    () => Object.entries(statuses).map(([userId, s]) => ({ id: s.id, user_id: userId, at: s.tapped_at })),
    [statuses],
  );
  useAcknowledge(id, me, ackItems);

  const apply = useCallback((d: RideSnapshot) => {
    setRide(d.ride);
    routeMiles.current = d.ride?.route_miles;
    setMembers(d.members);
    setRegroup(d.regroup);
    setStatuses(d.statuses);
    setPositions(d.positions);
    setLastHeardAt(Date.now());
  }, []);
  const refresh = useCallback(() => loadSnapshot(id).then(apply).catch(() => {}), [id, apply]);

  const loadRoute = useCallback(() => getRideRoute(id).then(setRoute).catch(() => {}), [id]);

  // Find this rider's share for the ride. With one, make sure the phone is sending (it resumes a
  // share after the app was closed or the phone restarted); without one, ask once. With no
  // service this fails quietly and is tried again, rather than asking someone already sharing.
  const shareChecked = useRef(false);
  const loadShare = useCallback(() =>
    myActiveShares()
      .then((all) => {
        const s = all.find((x) => x.scope === 'ride' && x.ride_id === id) ?? null;
        setShare(s);
        if (s) startSendingLocation(id, s.expires_at ? Date.parse(s.expires_at) : null).catch(() => {});
        else if (!shareChecked.current) setAskShare(true);
        shareChecked.current = true;
      })
      .catch(() => {}),
  [id]);

  // Initial load, then ask to share if this rider has no active ride share.
  useEffect(() => {
    loadSnapshot(id).then(apply).catch(() => {});
    loadRoute();
    loadShare();
    getPrivateDetails(id)
      .then((d) => setMeet(d ? { lat: d.meet_lat, lng: d.meet_lng, label: d.meet_label } : null))
      .catch(() => {});
  }, [id, apply, loadRoute, loadShare]);

  // Back from the background or the lock screen: catch up at once instead of waiting for the poll.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh();
      loadShare();
    });
    return () => sub.remove();
  }, [refresh, loadShare]);

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
        heard();
        if (p?.user_id) setPositions((prev) => ({ ...prev, [p.user_id]: p }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        const s = payload.new as TappedStatus & { user_id: string };
        setStatuses((prev) => ({ ...prev, [s.user_id]: s }));
      })
      // A rider cancelled a tap: their status goes back to what it was before.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        if ((payload.new as { cancelled_at?: string | null })?.cancelled_at) refresh();
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
      .subscribe((status) => {
        // The live connection came back after a drop: fetch what was missed right away.
        if (status === 'SUBSCRIBED') refresh();
      });
    const poll = setInterval(() => {
      refresh();
      if (!shareChecked.current) loadShare();
    }, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id, refresh, loadRoute, loadShare, heard]);

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

  // Spoken alert once per rider each time they turn red (leader and tail gunner only). Not while
  // this phone has no service: everyone goes quiet then, and that is our signal, not theirs.
  const meOffline = viewerOfflineSince(lastHeardAt, now) != null;
  useEffect(() => {
    if (!watchesBubble || meOffline) return;
    const red = new Set(bubble.alerts.map((a) => a.riderId));
    for (const a of bubble.alerts) {
      if (!announced.current.has(a.riderId) && a.message) {
        Speech.speak(a.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
    announced.current = red;
  }, [bubble.alerts, watchesBubble, meOffline]);

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

  const offlineSince = viewerOfflineSince(lastHeardAt, now);
  const mapRiders: MapRider[] = joined.map((m) => {
    const p = positions[m.user_id];
    const b = bubble.riders.find((x) => x.riderId === m.user_id);
    const st = statuses[m.user_id];
    // A broken-down rider who isn't sharing still shows, at the spot they tapped Mechanical Issue.
    const spot = breakdownSpot(st, p) ?? p;
    // A shared fix is aged by when it was taken. A breakdown spot from a rider who isn't sharing is
    // aged by the tap and only ever "last seen": with no sharing there is no signal to lose.
    let freshness = p ? riderFreshness(Date.parse(p.recorded_at), now, offlineSince) : null;
    if (!p && spot && st) {
      const f = riderFreshness(Date.parse(st.tapped_at), now, offlineSince);
      freshness = f.state === 'live' ? f : { ...f, state: 'delayed', label: f.ago };
    }
    const live = freshness?.state === 'live';
    return {
      id: m.user_id,
      name: m.profiles?.display_name || 'Rider',
      role: bubbleRole(m.role, leaderIds.includes(m.user_id)),
      status: b?.status ?? 'unknown',
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
      freshness,
      breakdown: st?.status === 'mechanical',
      detail: [
        !freshness ? 'Not Sharing' : live ? 'Live' : freshness.state === 'lost' ? freshness.label : `Last Seen ${freshness.ago}`,
        // A speed is only true while the fix is live.
        live && p?.speed_mps != null ? `${Math.round(p.speed_mps * 2.237)} mph` : null,
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
  // Riders on the route strip whose spot is only where they were last seen.
  const lastSeenIds = mapRiders.filter((r) => r.id !== me && r.freshness && r.freshness.state !== 'live').map((r) => r.id);
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

  const callKey = (userId: string, s: TappedStatus) => `${userId}:${s.status}:${s.tapped_at}`;
  const helpCalls = joined
    .map((m) => ({ m, s: statuses[m.user_id] }))
    .filter(({ s, m }) => m.user_id !== me && isActiveCall(s, now) && !dismissedCalls.has(callKey(m.user_id, s)));
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

  const alertsShown = shownSeparations.length + shownHelpCalls.length > 0;
  const hasBanners = offlineSince != null || !!(activeShare && shareOpen) || !!regroup || !!announcement;
  // Each value below comes from measurements that don't depend on it, so nothing feeds back.
  // On a tablet the banners sit in the sidebar, beside the panel rather than above it.
  const panelTop = tablet ? insets.top + TABLET_PANEL_TOP : topRowBottom;
  const bannersOverPanel = hasBanners && !tablet;
  const bannersBottom = panelTop + (bannersOverPanel ? 6 + bannersH : 0);
  const roomBelowBanners = screenH - panelBottom - bannersBottom - Spacing.two;
  const panelRest = panelH - (alertsShown ? alertsH : 0);
  const stripCompact = !panelOpen || roomBelowBanners < (alertsShown ? FULL_STRIP_ROOM_WITH_ALERTS : FULL_STRIP_ROOM);
  // On a short screen with banners up, the open panel drops the strip (it comes back folded) so
  // the alerts and buttons fit under the banners.
  const panelSpace = screenH - panelBottom - Spacing.two - panelTop - (bannersOverPanel ? 6 + Math.min(bannersH, BANNERS_MIN) : 0);
  const stripHidden = panelOpen && !!panelH &&
    panelSpace < panelRest - stripH + (alertsShown ? ALERTS_MIN : 0) + compactStripH;
  const stripShown = !!route.route && !stripHidden;
  const alertsMax = panelH ? Math.min(ALERTS_MAX, Math.max(ALERTS_MIN, roomBelowBanners - panelRest)) : ALERTS_MAX;
  const bannersMax = tablet
    ? Math.max(BANNERS_MIN, Math.round(screenH * 0.35))
    : panelH
      ? Math.max(BANNERS_MIN, screenH - Spacing.two - panelRest - (alertsShown ? ALERTS_MIN : 0) - topRowBottom - 6)
      : undefined;
  const shownBannersBottom = tablet ? panelTop : topRowBottom + (hasBanners ? 6 + Math.min(bannersH, bannersMax ?? bannersH) : 0);
  // The Add Waypoint button sits just above the panel; with no room there it stays hidden (press
  // and hold the map still drops one).
  const wpFabFits = screenH - panelBottom - panelH - 12 - WP_FAB_H >= shownBannersBottom + Spacing.two;
  // The first framing of the group keeps it clear of the panels over the map.
  const sidebarOpen = sidebar.open;
  const fitPadding = useMemo(
    () => (tablet
      ? { top: insets.top + 60, right: panelW + EDGE + 40, bottom: 60, left: sidebarOpen ? sideW + EDGE + 40 : 60 }
      : undefined),
    [tablet, insets.top, panelW, sideW, sidebarOpen],
  );

  async function beginShare(minutes: number | null) {
    setBusy(true);
    try {
      const s = await startLocationShare({ scope: 'ride', rideId: id, durationMin: minutes });
      await startSendingLocation(id);
      setShare(s);
      setAskShare(false);
    } catch (e) {
      Alert.alert('Could Not Start Sharing', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function endShare() {
    if (share) await stopLocationShare(share.id);
    await stopSendingLocation();
    setShare(null);
  }

  /**
   * Where this rider is, for a status tap, without holding the tap up: the fix Ride Mode already
   * has, else the phone's last known one, else a quick fresh fix (waiting for a full GPS fix made
   * every button feel dead for seconds).
   */
  async function spotNow(): Promise<{ lat: number; lng: number } | null> {
    const known = myFix ?? (me && positions[me] ? { lat: positions[me].lat, lng: positions[me].lng } : null);
    if (known) return known;
    try {
      const l = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      if (l) return { lat: l.coords.latitude, lng: l.coords.longitude };
    } catch {}
    return Promise.race([
      currentPosition(Location.Accuracy.Balanced).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  }

  /** Marks my own tap on screen at once (the button lights up before anything is sent). */
  const showMine = (tapId: string, kind: RiderStatusKind) =>
    me && setStatuses((prev) => ({ ...prev, [me]: { id: tapId, status: kind, tapped_at: new Date().toISOString() } }));

  async function tapStatus(kind: RiderStatusKind) {
    if (kind === 'emergency') return setSosOpen(true);
    const tapId = newTapId();
    showMine(tapId, kind);
    await broadcast.send(
      { id: tapId, kind: 'status', label: STATUS_LABEL[kind], urgent: kind === 'need_help' },
      async (tid) => sendStatusReliably(id, kind, await spotNow(), tid),
    );
  }

  /** Waiting for Signal: try everything in the outbox again now. */
  async function retryOutbox() {
    const sent = await broadcast.retry();
    if (sent > 0) {
      chat.reload();
      refresh();
    }
  }

  async function quickReply(body: QuickReply) {
    setLastReply(body);
    const sent = await broadcast.send({ id: newTapId(), kind: 'reply', label: body }, (tid) => sendQuickReplyReliably(id, body, tid));
    if (sent) chat.reload();
  }

  /** Takes back the last tap, for everyone. */
  async function cancelTap() {
    const b = broadcast.card;
    if (!b) return;
    try {
      await broadcast.cancel();
    } catch (e) {
      Alert.alert('Could Not Cancel', e instanceof Error ? e.message : String(e));
      return;
    }
    if (b.kind === 'reply') {
      setLastReply((r) => (r === b.label ? null : r));
      chat.reload();
    } else {
      setStatuses((prev) => {
        if (!me || prev[me]?.id !== b.id) return prev;
        const next = { ...prev };
        delete next[me];
        return next;
      });
      refresh();
    }
  }

  // A tap that was waiting for signal went out with a refresh: its card says Sent.
  const { checkQueued } = broadcast;
  useEffect(() => {
    checkQueued();
  }, [lastHeardAt, checkQueued]);

  async function regroupHere() {
    try {
      const p = await currentPosition();
      await dropRegroup(id, p.lat, p.lng, 'Regroup here');
      refresh();
    } catch (e) {
      Alert.alert('Could Not Set Regroup Point', e instanceof Error ? e.message : String(e));
    }
  }

  async function dropWaypointHere() {
    let at: { lat: number; lng: number } | null = null;
    try {
      at = await currentPosition();
    } catch {
      at = myFix ?? (me && positions[me] ? { lat: positions[me].lat, lng: positions[me].lng } : null);
    }
    if (at) openNewWaypoint(at);
    else Alert.alert('No Location Yet', 'Press and hold the map where you want the waypoint.');
  }

  async function sendEmergency() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const tapId = newTapId();
    showMine(tapId, 'emergency');
    await broadcast.send(
      { id: tapId, kind: 'status', label: 'EMERGENCY Alert', urgent: true },
      async (tid) => sendStatusReliably(id, 'emergency', await spotNow(), tid),
    );
  }

  // CarPlay: the car screen mirrors the group's state and sends button presses back here.
  const car = carPlayState({
    rideName: ride?.name ?? 'Ride',
    separated: bubble.alerts.map((a) => ({ riderId: a.riderId, message: a.message ?? 'A rider is separated' })),
    watchesBubble: !!watchesBubble,
    canRegroup: !!canRegroup,
    riders: mapRiders.map((r) => ({
      title: `${r.name}${r.role === 'leader' ? ' (Leader)' : r.role === 'sweep' ? ' (Tail Gunner)' : ''}`,
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

  const navigateTo = (lat: number, lng: number, title = 'There') => openDirections({ title, to: { lat, lng } });
  const directionRows = rideDirections({
    regroup,
    meet,
    route: route.route,
    alongM: placed.find((p) => p.id === me)?.place?.alongM,
    destination: ride?.destination_label,
  });

  const myPos = me ? positions[me] : undefined;
  const shareLeft = activeShare?.expires_at ? Date.parse(activeShare.expires_at) - now : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <GroupMap
        riders={mapRiders}
        meId={me}
        regroup={regroup}
        route={route.route?.points}
        trail={trail}
        waypoints={wp.waypoints}
        onPressWaypoint={(w) => setWpTarget({ type: 'view', waypoint: w })}
        onLongPressMap={mine ? openNewWaypoint : undefined}
        edgePadding={fitPadding}
      />
      <TrailMapOverlay
        trail={trail}
        top={tablet ? insets.top + EDGE : insets.top + 66}
        cardTop={tablet ? insets.top + 64 : insets.top + 118}
        cardWidth={tablet ? Math.min(360, layout.width - sideW - 3 * EDGE) : undefined}
        route={route.route?.points}
        ride={ride}
      />

      <SafeAreaView
        edges={['top']}
        pointerEvents="box-none"
        style={[styles.top, tablet && [styles.topTablet, { width: sideW + 2 * Spacing.two, bottom: panelBottom - Spacing.two }]]}>
        <View style={styles.topRow} onLayout={(e) => setTopRowBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={16} accessibilityLabel="Back" style={{ flexShrink: 1 }}>
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
            {tablet ? null : (
              <Pressable
                onPress={() => setRidersOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Together'}. Tap to see every rider and when they last updated`}>
                <Text style={[styles.topText, { color: bubble.alerts.length ? RideColors.red : RideColors.green }]}>
                  {bubble.alerts.length ? `${bubble.alerts.length} Separated` : 'Together'} ›
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        {hasBanners ? (
          <ScrollView
            style={{ maxHeight: bannersMax, flexGrow: 0 }}
            contentContainerStyle={{ gap: 6 }}
            onContentSizeChange={(_w, h) => setBannersH(Math.round(h))}
            showsVerticalScrollIndicator={false}>
          {offlineSince != null ? (
            <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>
                No Service. Riders Show Where They Were Last Seen{activeShare ? ', and Yours Sends When Service Returns' : ''}.
              </Text>
            </View>
          ) : null}
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
            <Pressable onPress={() => navigateTo(regroup.lat, regroup.lng, 'the Regroup Point')} style={[styles.shareBanner, { backgroundColor: RideColors.yellow }]}>
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
          </ScrollView>
        ) : null}
        {tablet ? (
          sidebar.open ? (
            <Animated.View {...sidebar.panHandlers} style={[styles.sidebar, { transform: [{ translateX: sidebar.drag }] }]}>
              <View style={styles.sidebarHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sidebarTitle}>Riders</Text>
                  <Text style={[styles.sidebarState, { color: bubble.alerts.length ? RideColors.red : RideColors.green }]}>
                    {bubble.alerts.length ? `${bubble.alerts.length} Separated` : 'Together'}, {joined.length} on the Ride
                  </Text>
                </View>
                <Pressable
                  onPress={() => sidebar.setOpen(false)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: true }}
                  accessibilityLabel="Hide the riders"
                  accessibilityHint="You can also swipe the list left to hide it"
                  hitSlop={8}
                  style={styles.sidebarFold}>
                  <Text style={styles.sidebarFoldText}>◀ Hide</Text>
                </Pressable>
              </View>
              {offlineSince != null ? (
                <Text style={styles.sidebarNote}>You have no service. Times are from the last update you got.</Text>
              ) : null}
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 4 }} indicatorStyle="white">
                <RiderRows
                  riders={mapRiders}
                  meId={me}
                  onNavigate={navigateTo}
                  narrow
                  extra={(riderId) => (statuses[riderId]?.status === 'mechanical' ? <BreakdownBadge size={18} /> : null)}
                />
              </ScrollView>
            </Animated.View>
          ) : (
            <Pressable
              onPress={() => sidebar.setOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              accessibilityLabel={`Show the riders. ${bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Together'}`}
              style={({ pressed }) => [styles.sidebarShow, { opacity: pressed ? 0.8 : 1 }]}>
              <View style={[styles.shareDot, { backgroundColor: bubble.alerts.length ? RideColors.red : RideColors.green }]} />
              <Text style={styles.sidebarShowText}>
                {bubble.alerts.length ? `${bubble.alerts.length} Separated` : 'Together'}
              </Text>
              <Text style={styles.sidebarShowText}>Show Riders ▶</Text>
            </Pressable>
          )
        ) : null}
      </SafeAreaView>

      {panelH && directionRows.length && wpFabFits ? (
        <Pressable
          onPress={() => setDirectionsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Directions in Apple Maps or Google Maps"
          style={({ pressed }) => [
            styles.wpFab, styles.directionsFab, { bottom: panelBottom + panelH + 12, opacity: pressed ? 0.8 : 1 },
            tablet && { left: layout.width - EDGE - panelW },
          ]}>
          <Icon name="turn" size={24} color={Colors.sky} strokeWidth={2.1} />
          <Text style={styles.wpFabText}>Directions</Text>
        </Pressable>
      ) : null}

      {mine && panelH && wpFabFits ? (
        <Pressable
          onPress={dropWaypointHere}
          accessibilityRole="button"
          accessibilityLabel="Add a waypoint at your location"
          accessibilityHint="You can also press and hold the map to drop one anywhere"
          style={({ pressed }) => [styles.wpFab, styles.waypointFab, { bottom: panelBottom + panelH + 12, opacity: pressed ? 0.8 : 1 }]}>
          <WaypointBlaze kind="spot" shared={false} size={24} />
          <Text style={styles.wpFabText}>Add Waypoint</Text>
        </Pressable>
      ) : null}

      <Animated.View
        {...panelSwipeHandlers}
        onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}
        style={[
          styles.bottomWrap,
          tablet && { left: 'auto', right: EDGE, bottom: panelBottom, width: panelW },
          { transform: [{ translateY: panelDrag }] },
        ]}>
      <SafeAreaView edges={tablet ? [] : ['bottom']} style={[styles.bottom, tablet && styles.bottomTablet]}>
        {route.route && stripShown ? (
          <View
            ref={stripRef}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              setStripH(h);
              if (stripCompact) setCompactStripH(h);
            }}>
          <RouteStrip
            lengthM={route.route.lengthM}
            riders={placed}
            meId={me}
            summary={routeSummary}
            nameOf={nameOf}
            offline={route.offline}
            lastSeenIds={lastSeenIds}
            range={rangeNote}
            compact={stripCompact}
          />
          </View>
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

        {broadcast.card ? (
          <BroadcastCard
            card={broadcast.card}
            tally={tally(broadcast.card.id, broadcast.receipts, joined.filter((m) => m.user_id !== me).map((m) => m.user_id))}
            receiptsOn={broadcast.receiptsOn}
            nameOf={nameOf}
            onCancel={cancelTap}
            onRetry={retryOutbox}
            onDismiss={broadcast.dismiss}
          />
        ) : null}

        {alertsShown ? (
          <ScrollView
            style={{ maxHeight: alertsMax }}
            onLayout={(e) => setAlertsH(Math.round(e.nativeEvent.layout.height))}
            contentContainerStyle={{ gap: Spacing.two }}>
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
                    <Pressable
                      onPress={() => setDismissedCalls((d) => new Set(d).add(callKey(m.user_id, s)))}
                      accessibilityRole="button"
                      accessibilityLabel={`Dismiss ${m.profiles?.display_name || 'Rider'}'s ${STATUS_LABEL[s.status]} on my screen`}
                      hitSlop={12}
                      style={styles.callDismiss}>
                      <Text style={styles.callDismissText}>✕</Text>
                    </Pressable>
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
              <Text style={styles.myBreakdownTitle}>{MECHANICAL_LABEL}</Text>
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

        {myStatus && myStatus.status !== 'ok' && myStatus.status !== 'mechanical' && isActiveCall(myStatus, now) ? (
          <View style={[styles.myBreakdown, { borderLeftColor: isUrgentCall(myStatus.status) ? RideColors.red : RideColors.yellow }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.myBreakdownTitle}>Your Status: {STATUS_LABEL[myStatus.status]}</Text>
              <Text style={styles.myBreakdownBody}>The group sees it until you mark it resolved.</Text>
            </View>
            <Pressable
              onPress={() => tapStatus('ok')}
              accessibilityRole="button"
              accessibilityLabel={`Resolved. Clear ${STATUS_LABEL[myStatus.status]} and send status OK`}
              style={({ pressed }) => [styles.myBreakdownOk, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.myBreakdownOkText}>Resolved, I’m OK</Text>
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
            {canRegroup ? <Button title="Regroup at My Location" big onPress={regroupHere} style={{ marginTop: Spacing.two }} /> : null}

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

      <DirectionsSheet visible={directionsOpen} rows={directionRows} onClose={() => setDirectionsOpen(false)} />

      <RiderList
        visible={ridersOpen && !tablet}
        riders={mapRiders}
        meId={me}
        offline={offlineSince != null}
        onClose={() => setRidersOpen(false)}
        onNavigate={navigateTo}
        extra={(riderId) => (statuses[riderId]?.status === 'mechanical' ? <BreakdownBadge size={18} /> : null)}
      />

      <WaypointSheet
        rideId={id}
        target={wpTarget}
        existing={wp.waypoints}
        me={me}
        canShare={canShareWp}
        stopsOn={wp.stopsSwitchedOn}
        ownerName={nameOf}
        onNavigate={navigateTo}
        onChanged={wp.apply}
        onClose={() => setWpTarget(null)}
      />

      <Modal visible={askShare && ride?.status === 'live'} animationType="slide" transparent onRequestClose={() => setAskShare(false)}>
        <View style={[styles.sheetWrap, tablet && styles.sheetWrapTablet]}>
          <KeyboardLift>
          <View style={[styles.sheet, tablet && styles.sheetTablet]}>
            <ThemedText type="subtitle" style={styles.sheetTitle}>Share Your Location with This Ride?</ThemedText>
            <ThemedText type="small" style={styles.sheetBody}>
              Only riders on this ride will see you. Sharing stops automatically when time runs out or the ride ends.
            </ThemedText>
            <SharePicker options={RIDE_SHARE_OPTIONS_MIN} openLabel="Until I Leave the Ride" onPick={beginShare} busy={busy} />
            <Button title="Not Now" kind="secondary" onPress={() => setAskShare(false)} />
          </View>
          </KeyboardLift>
        </View>
      </Modal>

      <Modal visible={sosOpen} animationType="fade" transparent onRequestClose={() => setSosOpen(false)}>
        <View style={[styles.sheetWrap, tablet && styles.sheetWrapTablet]}>
          <View style={[styles.sheet, tablet && styles.sheetTablet, { borderTopColor: RideColors.red, borderTopWidth: 6 }]}>
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
              title="Alert My Group"
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
  // Tablets: the top bar, banners and riders become a column on the left, as tall as the screen.
  topTablet: { right: 'auto' },
  sidebar: {
    flexShrink: 1, gap: Spacing.two, padding: 10, paddingTop: 12, borderRadius: 20,
    backgroundColor: 'rgba(10,22,38,0.94)', borderWidth: 1, borderColor: Colors.border,
  },
  sidebarHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  sidebarTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  sidebarState: { fontFamily: font(700), fontSize: 14 },
  sidebarFold: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  sidebarFoldText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  sidebarNote: { color: Colors.text, fontFamily: font(700), fontSize: 13, paddingHorizontal: 4 },
  sidebarShow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14,
    borderRadius: 22, backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1.5, borderColor: Colors.border,
  },
  sidebarShowText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  bottomWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomTablet: { borderRadius: 24, borderWidth: 1, borderColor: Colors.border, paddingBottom: 12 },
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
  callDismiss: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  callDismissText: { color: Colors.textSecondary, fontSize: 18 },
  foldedSos: { flex: 1, minHeight: 56, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.danger },
  actions: { flexDirection: 'row', gap: Spacing.two },
  handle: { alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'center', marginTop: -6 },
  handleBar: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.textSecondary, opacity: 0.6 },
  handleText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  // Leaves the map layers button (and its downloaded-map tag) uncovered on the right.
  offlineBanner: {
    marginRight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.control, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(10,22,38,0.94)', borderWidth: 1.5, borderColor: Colors.textSecondary, borderStyle: 'dashed',
  },
  // The same dashed grey as a rider who has lost service: dashed grey always means no signal.
  offlineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: Colors.textSecondary, borderStyle: 'dashed' },
  offlineText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 14, lineHeight: 18 },
  announcement: { borderRadius: Radius.control, padding: 12, backgroundColor: RideColors.yellow, gap: 2 },
  announcementLabel: { color: '#3A2600', fontFamily: font(700), fontSize: 13 },
  announcementText: { color: '#1A1100', fontFamily: font(800), fontSize: 19, lineHeight: 24 },
  replies: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  replyBtn: { flex: 1, minHeight: 58, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.sky, paddingHorizontal: 4 },
  replyText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 18, lineHeight: 20, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  statusBtn: { width: '31.5%', minHeight: 64, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 20, textAlign: 'center' },
  wpFab: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 10, paddingRight: 14,
    borderRadius: 22, backgroundColor: 'rgba(10,22,38,0.92)', borderWidth: 1.5, borderColor: Colors.border,
  },
  directionsFab: { left: 12 },
  waypointFab: { right: 12 },
  wpFabText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  // On a tablet a sheet is a card in the middle of the screen, not a strip across the bottom.
  sheetWrapTablet: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 28 },
  sheet: { backgroundColor: Colors.backgroundElement, padding: Spacing.four, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetTitle: { color: Colors.text },
  sheetBody: { color: Colors.textSecondary },
});
