import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Linking, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionsSheet } from '@/components/directions';
import { FollowMeButton } from '@/components/follow-me-button';
import { FullMapButton } from '@/components/full-map';
import { HoldButton } from '@/components/hold-button';
import { GroupMap, type GroupMapHandle, type MapRider } from '@/components/group-map';
import { Icon } from '@/components/icon';
import { KeyboardLift, keyboardScroll } from '@/components/keyboard';
import { BreakdownBadge } from '@/components/rider-status-badge';
import { LeaveRide } from '@/components/leave-ride';
import { RiderList, RiderRows } from '@/components/rider-list';
import { PanelActions, QuickRow, StatusSheet, tapFeel } from '@/components/ride-controls';
import { RideMessageSheet } from '@/components/ride-message-sheet';
import { RouteStrip } from '@/components/route-strip';
import { BroadcastCard } from '@/components/broadcast-card';
import { CrashCountdown } from '@/components/crash-countdown';
import { TILT_TILE_H, TiltTile } from '@/components/tilt-tile';
import { SharePicker } from '@/components/share-picker';
import { SheetRoot, SheetScroll, SwipeSheet } from '@/components/swipe-sheet';
import { CompassSpot } from '@/components/compass-spot';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { WaypointBlaze } from '@/components/waypoint-blaze';
import { WaypointSheet, type WaypointSheetTarget } from '@/components/waypoint-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Colors, font, Glass, Radius, RideColors, scrollIndicator, Spacing, themedStyles } from '@/constants/theme';
import { carPlayState, parseCarPlayAction } from '@/core/carplay';
import {
  breakdownKey, breakdownSpot, BREAKDOWN_SPEAK_WITHIN_MS, isActiveCall, MECHANICAL_LABEL, spokenBreakdown, type TappedStatus,
} from '@/core/breakdown';
import { BATTERY_PLANS, batteryBannerTag } from '@/core/battery';
import { tally } from '@/core/broadcast';
import { withAlpha } from '@/core/color';
import { BUBBLE_PRESETS, computeBubble, type BubblePreset, type BubbleRider, type BubbleSettings } from '@/core/bubble';
import { crashMessage, type CrashCause } from '@/core/crash-detect';
import { rideDirections } from '@/core/directions';
import { riderFreshness, viewerOfflineSince } from '@/core/freshness';
import { followCamActive, followMeStatus, followMeTap } from '@/core/follow-camera';
import { RESTORE_LABEL, restoreA11yLabel, swipeRestores } from '@/core/full-map';
import { isVerticalSwipe } from '@/core/panel-swipe';
import { heldHeading } from '@/core/heading';
import { positionsFilter, rosterKey } from '@/core/live-costs';
import { applyPositionChange, RosterGate, type PositionChange } from '@/core/live-roster';
import { RANGE_LABEL, checkRideRange } from '@/core/fuel';
import { mapPanelWidth, sidebarWidth } from '@/core/layout';
import { isApproximateFix, LOCATION_PROBLEM_BANNER } from '@/core/precise-location';
import { shouldCenterOnOpen } from '@/core/map-center';
import { rideVehicle, vehicleRange, vehicleTitle } from '@/core/garage';
import { chatMessageText, latestAnnouncement, QUICK_REPLIES, rideLeaderIds, spokenAnnouncement, type QuickReply } from '@/core/chat';
import { FreerideTracker, summarizeFreeride } from '@/core/freeride';
import { tracklineError, tracklineOn } from '@/core/leader-trackline';
import { RouteTracker, summarizeMe, type RideRoute } from '@/core/route';
import { formatRemaining, formatRemainingShort, RIDE_SHARE_OPTIONS_MIN } from '@/core/sharing';
import { canShareWaypoints, WAYPOINTS_NOT_SWITCHED_ON } from '@/core/waypoints';
import { newTapId, useAcknowledge, useBroadcast } from '@/hooks/use-broadcast';
import { useCrashAlert } from '@/hooks/use-crash-alert';
import { useFollowMe } from '@/hooks/use-follow-me';
import { useFullMap } from '@/hooks/use-full-map';
import { useLayout } from '@/hooks/use-layout';
import { useLeaderTrail } from '@/hooks/use-leader-trail';
import { useLeaderTrackline } from '@/hooks/use-leader-trackline';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { usePreciseLocation } from '@/hooks/use-precise-location';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useRideChat } from '@/hooks/use-ride-chat';
import { useSavedReplies } from '@/hooks/use-saved-replies';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import { useTilt } from '@/hooks/use-tilt';
import { useTrailMap } from '@/hooks/use-trail-map';
import {
  activeRegroup, dropRegroup, getMembers, getPositions, getPrivateDetails, getRide, getRideRoute, latestStatuses, myActiveShares, myVehicles,
  setLeaderTrackline, startLocationShare, stopLocationShare, type ActiveShare, type VehicleWithCost,
} from '@/lib/api';
import { useBatteryMode } from '@/lib/battery';
import { clearCarPlay, onCarPlayAction, showRideOnCarPlay } from '@/lib/carplay';
import { showNotice } from '@/lib/confirm';
import { openDirections } from '@/lib/directions';
import { currentPosition, startSendingLocation, stopSendingLocation } from '@/lib/location';
import { useFlag } from '@/lib/app-settings';
import {
  nearbyAvailable, nearbyBridge, onNearbyEvent, setNearbyConditions, setNearbyRelayOnly, setNearbySharing, startNearby, stopNearby, useBluetoothSharingSetting, useNearby,
} from '@/lib/nearby';
import { flushOutbox, sendQuickReplyReliably, sendStatusReliably } from '@/lib/outbox';
import { useSession } from '@/lib/session';
import { setCrashSettings, useTiltSettings } from '@/lib/tilt';
import { endEmergency, endStaleCalls, raiseEmergency } from '@/lib/siren';
import { MusicButton, MusicSheet } from '@/components/music-controls';
import { useMusicControls } from '@/hooks/use-music-controls';
import { newChannel, supabase } from '@/lib/supabase';
import { bubbleRole, type Position, type RegroupPoint, type Ride, type RideMember, type RiderStatusKind } from '@/lib/types';
import { speak } from '@/lib/voice';
import { currentEntitlements, requirePro, useCan } from '@/lib/pro';
import { can } from '@/core/entitlements';
import { ProTag } from '@/components/pro-tag';

import { t } from '@/lib/i18n';
import { SheetModal } from '@/components/sheet-modal';
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
/** The round Center on Me button. */
const LOCATE_SIZE = 48;
// On a tablet the panels float this far from the screen's edges.
const EDGE = 12;
// On a tablet the controls panel starts below the map layers button (and its downloaded-map tag).
const TABLET_PANEL_TOP = 112;

const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return 'no location yet';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? t('just now') : t('{v} min ago', { v: Math.round(s / 60) });
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
  // Leaving Ride Mode while Android is tearing the screen down rejects the keep-awake release
  // ("current activity is no longer available"); the screen is going away anyway, so catch it.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
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
  // waypoint: opened from a "new waypoint" notification; that waypoint's sheet opens once it's loaded.
  const { id, waypoint: openWaypointId } = useLocalSearchParams<{ id: string; waypoint?: string }>();
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
  const [route, setRoute] = useState<{ route: RideRoute | null; offline: boolean; loaded?: boolean }>({ route: null, offline: false });
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
  // The siren screen says "A rider" until the name is known (a call can arrive before the roster).
  const sirenName = useCallback((userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || null, [members]);

  // Waypoints: the leader's shared ones and this rider's own. Press and hold the map to drop one.
  const wp = useRideWaypoints(id, !!mine);
  const canShareWp = canShareWaypoints(me, mine, leaderIds);
  const [wpTarget, setWpTarget] = useState<WaypointSheetTarget>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  // The exact meeting point, for directions; only riders on the ride get it back.
  const [meet, setMeet] = useState<{ lat: number; lng: number; label: string | null } | null>(null);
  const [panelH, setPanelH] = useState(0);
  const openNewWaypoint = useCallback((at: { lat: number; lng: number }) => {
    if (!wp.switchedOn) return Alert.alert(t('Not Switched On Yet'), WAYPOINTS_NOT_SWITCHED_ON);
    if (!requirePro('waypoints')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWpTarget({ type: 'new', at });
  }, [wp.switchedOn]);
  // A tapped "new waypoint" notification: show that waypoint (once per notification).
  // (Set while rendering, once the waypoint has loaded.)
  const [shownWaypoint, setShownWaypoint] = useState<string | null>(null);
  if (openWaypointId && shownWaypoint !== openWaypointId) {
    const w = wp.waypoints.find((x) => x.id === openWaypointId);
    if (w) {
      setShownWaypoint(openWaypointId);
      setWpTarget({ type: 'view', waypoint: w });
    }
  }

  // Announcements: only the latest is shown, and it is read aloud so nobody has to look down.
  const chat = useRideChat(id, !!mine);
  // Riders can fold the reply and status buttons away (tap the handle or swipe down) to see more map.
  // Emergency, and calls for help, always stay.
  // Full Map: everything over the map tucks away except a slim bar at the bottom with the route
  // line (every rider's dot in running order), Controls to bring it all back (tap, or swipe the
  // bar up), Center on Me, and Emergency, which is always one tap away. Calls for help from other
  // riders still show in the bar. The phone remembers it, like Full Map on every other map.
  const { full: fullMap, enter: enterFullMap, exit: exitFullMap } = useFullMap('ride.fullMap.v1');
  // A long swipe down on the panel (or a swipe down on the folded panel) goes straight to Full Map.
  const { open: panelFoldOpen, setOpen: setPanelOpen, drag: panelDrag, panHandlers: panelSwipeHandlers } = usePanelFold('ride.modePanelOpen.v1', true, 'down', true, enterFullMap);
  const panelOpen = panelFoldOpen && !fullMap;
  const showMenus = useCallback(() => {
    exitFullMap();
    setPanelOpen(true);
  }, [exitFullMap, setPanelOpen]);
  const fullMapSwipe = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isVerticalSwipe(g.dx, g.dy),
      onPanResponderRelease: (_e, g) => {
        if (swipeRestores(g.dy, g.vy)) showMenus();
      },
    }),
    [showMenus],
  );
  // The sharing timer folds down to a small pill next to the ride name.
  const [shareOpen, toggleShareOpen] = useRememberedToggle('ride.shareBannerOpen.v1', false);
  // Tablets: the riders sidebar folds away to the left (swipe it left, or tap Hide) to see more map.
  const sidebar = usePanelFold('ride.ridersSidebarOpen.v1', true, 'left', layout.expanded);
  const announcement = useMemo(() => latestAnnouncement(chat.messages), [chat.messages]);
  const [lastReply, setLastReply] = useState<string | null>(null);
  // Type a Message: the rider's own words to the group, sent like a quick reply. Messages they
  // send often can be kept as their own quick replies on this device.
  const [messageOpen, setMessageOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  // More on the panel: every status and quick reply, grouped.
  const [statusesOpen, setStatusesOpen] = useState(false);
  const musicOn = useMusicControls();
  const savedReplies = useSavedReplies();
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
    speak(spokenAnnouncement(nameOf(announcement.user_id), announcement.body));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [announcement, me, nameOf]);

  // Other riders' status taps reached this phone: their card says so.
  const ackItems = useMemo(
    () => Object.entries(statuses).map(([userId, s]) => ({ id: s.id, user_id: userId, at: s.tapped_at })),
    [statuses],
  );
  useAcknowledge(id, me, ackItems);

  // Who is on the ride right now, for the live position handler (a rider not in it joined since).
  const memberIds = useRef<Set<string>>(new Set());
  const rosterGate = useRef(new RosterGate());
  // The same riders as a stable key: the live position listener restarts only when it changes.
  const [memberKey, setMemberKey] = useState('');
  const apply = useCallback((d: RideSnapshot) => {
    setRide(d.ride);
    routeMiles.current = d.ride?.route_miles;
    memberIds.current = new Set(d.members.filter((m) => m.status === 'joined').map((m) => m.user_id));
    setMemberKey(rosterKey(memberIds.current));
    setMembers(d.members);
    setRegroup(d.regroup);
    setStatuses(d.statuses);
    setPositions(d.positions);
    setLastHeardAt(Date.now());
  }, []);
  const refresh = useCallback(() => loadSnapshot(id).then(apply).catch(() => {}), [id, apply]);

  const loadRoute = useCallback(() => getRideRoute(id).then((r) => setRoute({ ...r, loaded: true })).catch(() => {}), [id]);

  // Find this rider's share for the ride. With one, make sure the phone is sending (it resumes a
  // share after the app was closed or the phone restarted); without one, ask once. With no
  // service this fails quietly and is tried again, rather than asking someone already sharing.
  const shareChecked = useRef(false);
  const warnedLocationOff = useRef(false);
  const loadShare = useCallback(() =>
    myActiveShares()
      .then((all) => {
        const s = all.find((x) => x.scope === 'ride' && x.ride_id === id) ?? null;
        setShare(s);
        if (s) {
          startSendingLocation(id, s.expires_at ? Date.parse(s.expires_at) : null).catch(() => {
            // Location was turned off for the app mid-share: the ride still lists this rider as
            // sharing, so say once that nothing is being sent instead of failing quietly.
            if (warnedLocationOff.current) return;
            warnedLocationOff.current = true;
            showNotice(t('Location Is Off'), t('OnMyLead can’t see your location, so your group won’t see you move. Turn on location for OnMyLead in Settings to keep sharing.'));
          });
        }
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

  // Follow this phone's position while Ride Mode is open and there is a line to place it on: the
  // route, or on a Freeride the group behind the leader. Only if location access was already
  // given; this never asks and never uploads.
  const hasRoute = !!route.route;
  const freeride = !!route.loaded && !route.route;
  const placesMe = hasRoute || freeride;
  // Battery Saver also slows this screen's own work: the blue dot and the backup check for riders.
  const batteryMode = useBatteryMode();
  // Tilt meter tile and Crash Alert (phones and tablets; the website has no motion sensors).
  const tiltSettings = useTiltSettings();
  const tiltShown = Platform.OS !== 'web' && tiltSettings.show;
  const tiltReading = useTilt(tiltSettings, tiltShown);
  // Approximate Location (Android) or Precise off (iPhone, iPad) puts this rider miles from where they are.
  const precise = usePreciseLocation(me ? positions[me]?.accuracy_m : null);
  const { followEveryM, refreshSec } = BATTERY_PLANS[batteryMode];
  useEffect(() => {
    if (!placesMe) return;
    let sub: Location.LocationSubscription | null = null;
    let gone = false;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.status !== 'granted' || gone) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: followEveryM }, (l) =>
          setMyFix({ lat: l.coords.latitude, lng: l.coords.longitude }),
        );
        if (gone) sub.remove();
      })
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
  }, [placesMe, followEveryM]);

  // Live updates, with polling as a fallback for flaky connections.
  useEffect(() => {
    const channel = newChannel(`ride-${id}`)
      // A rider joined, left or was removed: reload the list (and everyone's positions) at once.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_members', filter: `ride_id=eq.${id}` }, () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        const s = payload.new as TappedStatus & { user_id: string };
        setStatuses((prev) => ({ ...prev, [s.user_id]: s }));
      })
      // A rider cancelled a tap: their status goes back to what it was before.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_statuses', filter: `ride_id=eq.${id}` }, (payload) => {
        const row = payload.new as { id?: string; cancelled_at?: string | null };
        if (row?.cancelled_at) {
          // A cancelled EMERGENCY stops the siren on every phone that is sounding it.
          if (row.id) endEmergency(row.id);
          refresh();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regroup_points', filter: `ride_id=eq.${id}` }, () => {
        activeRegroup(id).then((rg) => {
          setRegroup(rg);
          if (rg) speak('Regroup point set.');
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
    }, refreshSec * 1000);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [id, refresh, loadRoute, loadShare, heard, refreshSec]);

  // Live positions of this ride's riders only. Listening to the whole table made the server check
  // every rider's update against every open map (core/live-costs). The listener restarts when the
  // roster changes; a new rider's first dot also arrives with the roster reload.
  useEffect(() => {
    const opts = positionsFilter(memberKey ? memberKey.split(',') : []);
    if (!opts) return;
    const channel = newChannel(`ride-positions-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions_latest', ...opts }, (payload) => {
        heard();
        setPositions((prev) => applyPositionChange(prev, payload as unknown as PositionChange<Position>));
        // Only reached without a filter (a ride over Realtime's limit): a position from someone not
        // on the list yet means they joined after it loaded, so reload it now.
        const userId = (payload.new as Partial<Position> | null)?.user_id;
        if (userId && rosterGate.current.shouldReload(userId, memberIds.current.has(userId), Date.now())) refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, memberKey, heard, refresh]);

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

  // Bluetooth Sharing (lib/nearby.ts): with no service, spots, taps and quick replies still pass
  // between nearby riders on this ride. Runs for joined riders while Ride Mode is open; a rider's
  // own spot goes out only while they are sharing with the ride.
  const bluetoothFlag = useFlag('bluetooth_sharing');
  // The rider's own switch (You > Bluetooth Sharing, or the no-service banner here). On by default;
  // turning it back on in Ride Mode starts Bluetooth again at once.
  const [bluetoothMine, setBluetoothMine] = useBluetoothSharingSetting();
  // Bluetooth Sharing is Pro (2.1). On Free the phone still relays for the group and still sends and
  // hears EMERGENCY, Need Help and Crash Alerts (lib/nearby relay only); spots, other taps and
  // messages over Bluetooth need Pro.
  const bluetoothPro = useCan('bluetooth_sharing');
  useEffect(() => setNearbyRelayOnly(!bluetoothPro), [bluetoothPro]);
  const bluetoothOffered = nearbyAvailable && bluetoothFlag;
  const nearby = useNearby();
  const iAmJoined = !!me && joined.some((m) => m.user_id === me);
  useEffect(() => {
    if (!me || !iAmJoined || rideOver || !bluetoothFlag || !bluetoothMine) return;
    void startNearby(id, me);
    return () => stopNearby();
  }, [id, me, iAmJoined, rideOver, bluetoothFlag, bluetoothMine]);
  useEffect(() => {
    setNearbySharing(id, !!activeShare);
  }, [id, activeShare, nearby.state]);
  // With service and nobody in Bluetooth range the radio idles; Max Battery Saver slows it too.
  const meOffline = viewerOfflineSince(lastHeardAt, now) != null;
  useEffect(() => {
    setNearbyConditions(id, { online: !meOffline, batterySaver: batteryMode === 'saver' });
  }, [id, meOffline, batteryMode, nearby.state]);
  // Gateway: what this phone knows from the server goes out over Bluetooth to riders near it with
  // no service (the mesh keeps only what is newer, so nothing it heard over Bluetooth echoes).
  useEffect(() => {
    if (nearby.state !== 'on') return;
    nearbyBridge(id, {
      positions: Object.values(positions),
      statuses: Object.entries(statuses).flatMap(([user_id, s]) => (s.id ? [{ id: s.id, user_id, status: s.status, tapped_at: s.tapped_at, lat: s.lat ?? null, lng: s.lng ?? null }] : [])),
      messages: chat.messages.filter((m) => m.kind === 'status' && !m.via).map((m) => ({ id: m.id, user_id: m.user_id, body: m.body, sent_at: m.sent_at })),
    });
  }, [id, nearby.state, positions, statuses, chat.messages]);
  useEffect(
    () =>
      onNearbyEvent((e) => {
        if (e.kind === 'position') {
          if (!memberIds.current.has(e.position.user_id)) return;
          setPositions((prev) => {
            const old = prev[e.position.user_id];
            return old && Date.parse(old.recorded_at) >= Date.parse(e.position.recorded_at) ? prev : { ...prev, [e.position.user_id]: e.position };
          });
        } else if (e.kind === 'status') {
          if (!memberIds.current.has(e.status.user_id)) return;
          // Over Bluetooth with no service: the Emergency Siren sounds here too (lib/siren).
          raiseEmergency({ ...e.status, rideId: id, userId: e.status.user_id, at: e.status.tapped_at, name: sirenName(e.status.user_id), possibleCrash: e.status.possible_crash, source: e.fromServer ? 'ride' : 'bluetooth' }, me ?? null);
          setStatuses((prev) => {
            const old = prev[e.status.user_id];
            if (old && (old.id === e.status.id || Date.parse(old.tapped_at) > Date.parse(e.status.tapped_at))) return prev;
            const { user_id: _u, possible_crash: _c, ...tap } = e.status;
            return { ...prev, [e.status.user_id]: tap };
          });
        } else if (memberIds.current.has(e.reply.user_id)) {
          // Read out, the way announcements are; the chat shows it too (hooks/use-ride-chat).
          speak(`${nameOf(e.reply.user_id)}: ${chatMessageText({ kind: 'status', body: e.reply.body }, t)}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }),
    [nameOf, sirenName, id, me],
  );

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
        fix: p ? { lat: p.lat, lng: p.lng, at: Date.parse(p.recorded_at), speedMps: p.speed_mps, headingDeg: p.heading_deg, accuracyM: p.accuracy_m } : null,
        lastMovedAt: p?.last_moved_at ? Date.parse(p.last_moved_at) : null,
      };
    });
    return computeBubble(riders, settings, now);
  }, [joined, leaderIds, positions, settings, now]);

  // Spoken alert once per rider each time they turn red (leader and tail gunner only). Not while
  // this phone has no service: everyone goes quiet then, and that is our signal, not theirs.
  useEffect(() => {
    if (!watchesBubble || meOffline) return;
    const red = new Set(bubble.alerts.map((a) => a.riderId));
    for (const a of bubble.alerts) {
      if (!announced.current.has(a.riderId) && a.message) {
        speak(a.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
    announced.current = red;
  }, [bubble.alerts, watchesBubble, meOffline]);

  // Emergency Siren (lib/siren): another rider's fresh EMERGENCY sounds the siren on every phone on
  // the ride, until silenced; a newer tap from that rider (I'm OK...) ends it. Live updates and
  // Bluetooth both land in `statuses`.
  useEffect(() => {
    for (const [userId, s] of Object.entries(statuses)) {
      raiseEmergency({ id: s.id, rideId: id, userId, status: s.status, at: s.tapped_at, name: sirenName(userId), source: 'ride' }, me ?? null);
    }
    endStaleCalls(id, statuses);
  }, [statuses, id, me, sirenName]);

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
      speak(spokenBreakdown(nameOf(userId)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [statuses, watchesBubble, me, nameOf]);

  const offlineSince = viewerOfflineSince(lastHeardAt, now);
  // Each rider's last heading, so their arrow stays on after they stop while they're live (core/heading heldHeading).
  const [heldHeadings] = useState(() => new Map<string, { deg: number; at: number }>());
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
    function heldArrow(id: string, fix: { speedMps: number | null; headingDeg: number | null } | null, isLive: boolean): number | null {
      const h = heldHeading(heldHeadings.get(id), fix, isLive, now);
      if (h) heldHeadings.set(id, h);
      else heldHeadings.delete(id);
      return h?.deg ?? null;
    }
    return {
      id: m.user_id,
      name: m.profiles?.display_name || 'Rider',
      role: bubbleRole(m.role, leaderIds.includes(m.user_id)),
      status: b?.status ?? 'unknown',
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
      freshness,
      breakdown: st?.status === 'mechanical',
      // The arrow only follows this rider's own shared fix, never a breakdown spot.
      headingDeg: spot === p ? heldArrow(m.user_id, p ? { speedMps: p.speed_mps, headingDeg: p.heading_deg } : null, live) : null,
      detail: [
        !freshness ? t('Not Sharing') : live ? t('Live') : freshness.state === 'lost' ? freshness.label : t('Last Seen {ago}', { ago: freshness.ago }),
        // A speed is only true while the fix is live.
        live && p?.speed_mps != null ? `${Math.round(p.speed_mps * 2.237)} mph` : null,
        // Their phone only shares a rough spot (Approximate Location): the dot can be a mile or more off.
        spot === p && isApproximateFix(p?.accuracy_m) ? t('Approximate Location') : null,
        st ? STATUS_LABEL[st.status] : null,
        // This spot came phone to phone, not over the internet.
        p && nearby.positions[m.user_id]?.recorded_at === p.recorded_at ? t('Via Bluetooth') : null,
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

  // Freeride: no route, so the line shows the group behind the leader, measured along the trail
  // the leader has ridden (kept on this phone from the leader's live spots; never uploaded).
  const spotOf = useCallback(
    (userId: string) => (userId === me && myFix ? myFix : positions[userId] ? { lat: positions[userId].lat, lng: positions[userId].lng } : null),
    [me, myFix, positions],
  );
  // Leader Trackline: the same trail drawn on the map behind the leader, on any ride, unless the
  // leader turned it off for the ride (core/leader-trackline).
  const showTrackline = tracklineOn(ride);
  // Kept even while the leader has the line off, so turning it back on shows the whole ride
  // rather than a gap or a straight line across ground nobody rode.
  const keepsTrail = true;
  // The trail stays with the leader it follows while they are still a leader on the ride (a second
  // leader, or a moment without a spot, would otherwise start it over for everyone).
  const [trailLeader, setTrailLeader] = useState<string | null>(null);
  const stillLeads = !!trailLeader && leaderIds.includes(trailLeader) && joined.some((m) => m.user_id === trailLeader);
  const trailLeaderId = stillLeads ? trailLeader : leaderIds.find((l) => joined.some((m) => m.user_id === l) && spotOf(l)) ?? null;
  if (trailLeaderId && trailLeaderId !== trailLeader) setTrailLeader(trailLeaderId);
  const trailLeaderAt = trailLeaderId ? spotOf(trailLeaderId) : null;
  const leaderTrail = useLeaderTrail(id, trailLeaderId, trailLeaderAt, keepsTrail);
  const trackline = useLeaderTrackline(leaderTrail?.points, showTrackline);
  const [tracklineBusy, setTracklineBusy] = useState(false);
  const switchTrackline = useCallback(async (on: boolean) => {
    if (!ride) return;
    setTracklineBusy(true);
    // Shows at once on this phone; every other phone picks it up from the ride's live update.
    setRide((r) => (r ? { ...r, leader_trackline: on } : r));
    try {
      await setLeaderTrackline(ride.id, on);
    } catch (e) {
      setRide((r) => (r ? { ...r, leader_trackline: !on } : r));
      Alert.alert(t('Couldn’t Change the Trackline'), tracklineError(e instanceof Error ? e.message : String(e)));
    } finally {
      setTracklineBusy(false);
    }
  }, [ride]);
  const [freerideTracker] = useState(() => new FreerideTracker());
  const freerideLine = useMemo(() => {
    if (!freeride) return null;
    const riders = joined.map((m) => ({ id: m.user_id, role: bubbleRole(m.role, leaderIds.includes(m.user_id)), at: spotOf(m.user_id) }));
    return freerideTracker.place(leaderTrail, trailLeaderId, riders);
  }, [freeride, joined, leaderIds, spotOf, leaderTrail, trailLeaderId, freerideTracker]);
  const freerideStrip = freerideLine ? { summary: summarizeFreeride(freerideLine, me), waiting: !freerideLine.leaderId } : null;

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
    return { check, text: t('{v}. {v2} goes about {v3} mi.', { v: RANGE_LABEL[check], v2: v.nickname?.trim() || vehicleTitle(v), v3: Math.round(r.fullRangeMiles) }) };
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
  const hasBanners = !!precise.problem || offlineSince != null || !!(activeShare && shareOpen) || !!regroup || !!announcement;
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
  const stripShown = (!!route.route || freeride) && !stripHidden;
  const alertsMax = panelH ? Math.min(ALERTS_MAX, Math.max(ALERTS_MIN, roomBelowBanners - panelRest)) : ALERTS_MAX;
  const bannersMax = tablet
    ? Math.max(BANNERS_MIN, Math.round(screenH * 0.35))
    : panelH
      ? Math.max(BANNERS_MIN, screenH - Spacing.two - panelRest - (alertsShown ? ALERTS_MIN : 0) - topRowBottom - 6)
      : undefined;
  // Map Settings (top left) and the compass (top right) sit level, just under the top bar, or at
  // the top in Full Map (core/map-corner). On a tablet the bar is the riders column, so they're at the top.
  const cornerTop = tablet || fullMap ? insets.top + EDGE : insets.top + 66;
  const compassSpot = { top: cornerTop };
  const shownBannersBottom = fullMap ? insets.top : tablet ? panelTop : topRowBottom + (hasBanners ? 6 + Math.min(bannersH, bannersMax ?? bannersH) : 0);
  // The Add Waypoint button sits just above the panel; with no room there it stays hidden (press
  // and hold the map still drops one).
  const wpFabFits = !fullMap && screenH - panelBottom - panelH - 12 - WP_FAB_H >= shownBannersBottom + Spacing.two;
  // Center on Me. On a phone it sits on the right just above the panel, over Add Waypoint when
  // that is there, and shows when there is room (folding the panel always makes room). On a
  // tablet it sits in the open map's bottom corner, just left of the panel, so it is always there.
  // The website has a live map to move only with Mapbox; otherwise it has no button.
  const locateBottom = tablet ? panelBottom : panelBottom + panelH + 12 + (mine && wpFabFits ? WP_FAB_H + 8 : 0);
  const locateFits = (Platform.OS !== 'web' || trail.mapbox) && !!panelH &&
    (tablet || screenH - locateBottom - LOCATE_SIZE >= shownBannersBottom + Spacing.two);
  // Music (when the rider has it on) sits right above Center on Me, and only when there is room.
  // In Full Map it moves into the slim bar instead.
  const musicBottom = locateBottom + LOCATE_SIZE + 10;
  const musicFits = musicOn && locateFits && !fullMap &&
    (tablet || screenH - musicBottom - LOCATE_SIZE >= shownBannersBottom + Spacing.two);
  // The Tilt tile: on a phone on the left, level with Music (above Center on Me's row); on a tablet
  // in the open map's bottom-left corner. Only when there is room; Full Map hides it.
  const tiltFits = tiltShown && locateFits && !fullMap &&
    (tablet || screenH - musicBottom - TILT_TILE_H >= shownBannersBottom + Spacing.two);
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
      Alert.alert(t('Could Not Start Sharing'), e instanceof Error ? e.message : String(e));
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

  async function quickReply(body: string) {
    setLastReply(body);
    const sent = await broadcast.send({ id: newTapId(), kind: 'reply', label: body }, (tid) => sendQuickReplyReliably(id, body, tid));
    if (sent) chat.reload();
  }

  /** From the Message the Group sheet: close it first so the Sending card shows at once. */
  function sendTyped(body: string, save: boolean) {
    setMessageOpen(false);
    if (save) savedReplies.save(body);
    quickReply(body);
  }

  /** Takes back the last tap, for everyone. */
  async function cancelTap() {
    const b = broadcast.card;
    if (!b) return;
    try {
      await broadcast.cancel();
    } catch (e) {
      Alert.alert(t('Could Not Cancel'), e instanceof Error ? e.message : String(e));
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
      Alert.alert(t('Could Not Set Regroup Point'), e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Center on Me: move the map so this rider's spot is in the middle of the open map (between
   * the banners and the panel on a phone, between the riders list and the panel on a tablet),
   * keeping the zoom. Uses the fix Ride Mode already has, else the phone's recent one, else a
   * fresh one, asking for while-using access only if it was never given.
   */
  const groupMap = useRef<GroupMapHandle>(null);
  const [locating, setLocating] = useState(false);
  // The open map between the panels: on a phone between the banners and the panel, on a tablet
  // between the riders list and the panel.
  const openMapInset = tablet
    ? { top: insets.top + EDGE, right: panelW + 2 * EDGE, bottom: panelBottom, left: sidebar.open ? sideW + 2 * EDGE : 0 }
    : { top: shownBannersBottom, right: 0, bottom: panelBottom + panelH, left: 0 };
  // Follow Me (core/follow-camera): the map keeps this rider's dot in the open map as they ride.
  // Dragging the map pauses it; Center on Me or the Follow Me button picks it back up.
  const follow = useFollowMe();
  const following = followCamActive(follow.cam, { recording: false, following: false, nearTrail: false, followMe: follow.on });
  const followStatus = followMeStatus(follow.on, follow.cam);
  function tapFollowMe() {
    const act = followMeTap(followStatus);
    if (act === 'turn-off') return follow.setOn(false);
    if (act === 'turn-on') follow.setOn(true);
    follow.camEvent('center');
  }
  async function centerOnMe() {
    Haptics.selectionAsync().catch(() => {});
    follow.camEvent('center');
    let at = myFix;
    if (!at) {
      try {
        const l = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (l) at = { lat: l.coords.latitude, lng: l.coords.longitude };
      } catch {}
    }
    if (!at) {
      setLocating(true);
      try {
        at = await Promise.race([
          currentPosition(Location.Accuracy.Balanced),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
      } catch {
        setLocating(false);
        Alert.alert(t('Location Is Off'), t('Allow OnMyLead to use your location in Settings to center the map on you.'), [
          { text: t('Not Now'), style: 'cancel' },
          { text: t('Open Settings'), onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      setLocating(false);
    }
    if (!at) {
      Alert.alert(t('No Location Yet'), t('Your phone hasn\'t found where you are yet. Try again in a moment.'));
      return;
    }
    opening.current = 'done';
    await groupMap.current?.centerOn(at, openMapInset);
  }

  /**
   * When Ride Mode opens, the map centers on this rider at riding zoom: from the phone's recent
   * fix at once, else the first fix that comes in. Never asks for location (Center on Me and
   * sharing do), and never moves the map once the rider has moved it themselves.
   */
  const opening = useRef<'waiting' | 'done'>('waiting');
  const [mapReady, setMapReady] = useState(false);
  // The rider dragged or pinched the map before their spot was known: leave the map where they put it.
  const [mapMoved, setMapMoved] = useState(false);
  const [openFix, setOpenFix] = useState<{ lat: number; lng: number } | null>(null);
  const liveMap = Platform.OS !== 'web' || trail.mapbox;
  useEffect(() => {
    // The website's sketch has nothing to center; its Mapbox map does.
    if (!liveMap) return;
    let gone = false;
    (async () => {
      const p = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (p?.status !== 'granted' || gone) return;
      try {
        const l = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 });
        if (l) {
          if (!gone) setOpenFix({ lat: l.coords.latitude, lng: l.coords.longitude });
          return;
        }
      } catch {}
      try {
        const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!gone) setOpenFix({ lat: l.coords.latitude, lng: l.coords.longitude });
      } catch {}
    })();
    return () => {
      gone = true;
    };
  }, [liveMap]);
  const openAt = openFix ?? myFix;
  // On a phone, wait until the panel is measured so the rider lands above it, not under it.
  const openLaidOut = mapReady && (tablet || panelH > 0);
  const openInsetKey = JSON.stringify(openMapInset);
  useEffect(() => {
    if (!shouldCenterOnOpen({ done: opening.current === 'done', userMoved: mapMoved, mapReady: openLaidOut, at: openAt })) return;
    opening.current = 'done';
    groupMap.current?.centerOn(openAt!, JSON.parse(openInsetKey), { animated: false });
  }, [openLaidOut, openAt, openInsetKey, mapMoved]);

  async function dropWaypointHere() {
    let at: { lat: number; lng: number } | null = null;
    try {
      at = await currentPosition();
    } catch {
      at = myFix ?? (me && positions[me] ? { lat: positions[me].lat, lng: positions[me].lng } : null);
    }
    if (at) openNewWaypoint(at);
    else Alert.alert(t('No Location Yet'), t('Press and hold the map where you want the waypoint.'));
  }

  async function sendEmergency() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const tapId = newTapId();
    showMine(tapId, 'emergency');
    await broadcast.send(
      { id: tapId, kind: 'status', label: t('EMERGENCY Alert'), urgent: true },
      async (tid) => sendStatusReliably(id, 'emergency', await spotNow(), tid),
    );
  }

  // Crash Alert: a crash while riding starts the I'm OK countdown; at zero the group gets the
  // EMERGENCY alert plus a chat line saying why, both through the outbox (so they go out on reconnect).
  const crash = useCrashAlert(tiltSettings.crash, !!mine);
  function sendCrashAlert(cause: CrashCause) {
    crash.dismiss();
    void sendEmergency();
    const body = crashMessage(cause);
    void broadcast.send({ id: newTapId(), kind: 'reply', label: body }, (tid) => sendQuickReplyReliably(id, body, tid));
  }

  // CarPlay: the car screen mirrors the group's state and sends button presses back here.
  const car = carPlayState({
    rideName: ride?.name ?? t('Ride'),
    separated: bubble.alerts.map((a) => ({ riderId: a.riderId, message: a.message ?? t('A rider is separated') })),
    watchesBubble: !!watchesBubble,
    canRegroup: !!canRegroup,
    riders: mapRiders.map((r) => ({
      title: `${r.name}${r.role === 'leader' ? t(' (Leader)') : r.role === 'sweep' ? t(' (Tail Gunner)') : ''}`,
      detail: r.detail,
    })),
    helpCalls: helpCalls.map(({ m, s }) => ({ name: m.profiles?.display_name || t('Rider'), status: t(STATUS_LABEL[s.status]) })),
  });
  const carKey = JSON.stringify(car);
  // CarPlay is Pro (2.1). On Free the car keeps the Pro notice (root layout) and gets no ride.
  const carPlayPro = useCan('carplay');
  useEffect(() => {
    if (!carPlayPro) return clearCarPlay();
    if (ride) showRideOnCarPlay(JSON.parse(carKey));
  }, [carKey, ride, carPlayPro]);
  useEffect(() => () => clearCarPlay(), []);
  const carActions = useRef({ tapStatus, quickReply, regroupHere, sendEmergency });
  useEffect(() => {
    carActions.current = { tapStatus, quickReply, regroupHere, sendEmergency };
  });
  useEffect(() => {
    const sub = onCarPlayAction((buttonId) => {
      if (!can(currentEntitlements(), 'carplay')) return;
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
  // To a rider who sent Need Help, EMERGENCY or a crash alert: always free.
  const navigateToRiderInNeed = (lat: number, lng: number) => openDirections({ title: t('There'), to: { lat, lng } }, { safety: true });
  const directionRows = rideDirections({
    regroup,
    meet,
    route: route.route,
    alongM: placed.find((p) => p.id === me)?.place?.alongM,
    destination: ride?.destination_label,
  });

  const myPos = me ? positions[me] : undefined;
  const shareLeft = activeShare?.expires_at ? Date.parse(activeShare.expires_at) - now : null;
  // Leave Ride sits under the riders (the Riders sheet on phones, the sidebar on tablets).
  const leaveButton = ride && mine ? (
    <LeaveRide
      ride={ride}
      members={members}
      me={me}
      sharing={!!activeShare}
      look="dark"
      onLeft={() => {
        setShare(null);
        setRidersOpen(false);
        router.replace('/');
      }}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CompassSpot.Provider value={compassSpot}>
        <GroupMap
          ref={groupMap}
          riders={mapRiders}
          meId={me}
          regroup={regroup}
          route={route.route?.points}
          trackline={trackline}
          trail={trail}
          waypoints={wp.waypoints}
          onPressWaypoint={(w) => setWpTarget({ type: 'view', waypoint: w })}
          onLongPressMap={mine ? openNewWaypoint : undefined}
          edgePadding={fitPadding}
          fallback={meet}
          onReady={() => setMapReady(true)}
          onUserMove={() => {
            setMapMoved(true);
            follow.camEvent('pan');
          }}
          follow={following ? { inset: openMapInset } : null}
          locationEveryMs={batteryMode === 'best' ? 1000 : BATTERY_PLANS[batteryMode].fixEveryMs}
        />
      </CompassSpot.Provider>
      {/* Map Settings stays in the top-left corner of the map, Full Map included (on a tablet, just right of the riders column). */}
      <TrailMapOverlay
        trail={trail}
        controls
        bare={fullMap}
        top={cornerTop}
        left={tablet && !fullMap ? sideW + 2 * Spacing.two + EDGE - Spacing.two : undefined}
        cardTop={tablet || fullMap ? insets.top + 64 : insets.top + 118}
        cardWidth={tablet ? Math.min(360, layout.width - sideW - 3 * EDGE) : undefined}
        route={route.route?.points}
        ride={ride}
        trackline={canShareWp ? { on: showTrackline, busy: tracklineBusy, onChange: switchTrackline } : undefined}
      />

      {fullMap ? null : (
      <SafeAreaView
        edges={['top']}
        pointerEvents="box-none"
        style={[styles.top, tablet && [styles.topTablet, { width: sideW + 2 * Spacing.two, bottom: panelBottom - Spacing.two }]]}>
        <View style={styles.topRow} onLayout={(e) => setTopRowBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Back')} style={styles.backBtn}>
            <Icon name="back" size={18} color={Colors.text} strokeWidth={2.6} />
          </Pressable>
          <Pressable
            onPress={() => (activeShare ? toggleShareOpen() : setAskShare(true))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={activeShare ? { expanded: shareOpen } : undefined}
            accessibilityLabel={
              activeShare
                ? t('{v}. Sharing your location, {v2}. Tap for details', { v: ride?.name ?? 'Ride', v2: formatRemaining(shareLeft) })
                : t('{v}. Not sharing your location. Tap to share', { v: ride?.name ?? 'Ride' })
            }
            style={styles.topTitleWrap}>
            <Text style={styles.topText} numberOfLines={1}>{ride?.name ?? 'Ride'}</Text>
            <View style={styles.topSubRow}>
              <View style={[styles.shareDot, { backgroundColor: activeShare ? RideColors.green : Colors.textSecondary }]} />
              <Text style={styles.topSub} numberOfLines={1}>
                {activeShare
                  ? formatRemainingShort(shareLeft) === t('On') ? t('Sharing') : t('Sharing · {v} Left', { v: formatRemainingShort(shareLeft) })
                  : t('Not Sharing · Tap to Share')}
              </Text>
            </View>
          </Pressable>
          {tablet ? null : (
            <Pressable
              onPress={() => setRidersOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('{v}. Tap to see every rider and when they last updated', { v: bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Together' })}
              style={({ pressed }) => [styles.groupChip, bubble.alerts.length ? styles.groupChipRed : styles.groupChipGreen, pressed && { opacity: 0.75 }]}>
              <Text style={[styles.groupChipText, { color: bubble.alerts.length ? Glass.softRed : RideColors.green }]}>
                {bubble.alerts.length ? `${bubble.alerts.length} Separated` : t('Together')}
              </Text>
            </Pressable>
          )}
        </View>
        {hasBanners ? (
          <ScrollView
            style={{ maxHeight: bannersMax, flexGrow: 0 }}
            // On a phone Map Settings sits at the left of the first banner and the compass at its right: leave them room.
            contentContainerStyle={{ gap: 6, paddingHorizontal: tablet ? 0 : 54 }}
            onContentSizeChange={(_w, h) => setBannersH(Math.round(h))}
            showsVerticalScrollIndicator={false}>
          {precise.problem ? (
            <Pressable
              onPress={() => void precise.fix()}
              style={[styles.shareBanner, styles.amberBanner]}
              accessibilityRole="button"
              accessibilityLabel={t(LOCATION_PROBLEM_BANNER[precise.problem])}>
              <Icon name="warning" size={18} color={Glass.amber} strokeWidth={2.2} />
              <Text style={[styles.shareText, { flex: 1, textAlign: 'left' }]}>
                {t(LOCATION_PROBLEM_BANNER[precise.problem])}
              </Text>
            </Pressable>
          ) : null}
          {offlineSince != null ? (
            <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>
                {nearby.state === 'on' && nearby.peers > 0 && bluetoothPro
                  ? activeShare
                    ? t(nearby.peers === 1 ? 'No Service. Sharing With {n} Nearby Phone Over Bluetooth.' : 'No Service. Sharing With {n} Nearby Phones Over Bluetooth.', { n: nearby.peers })
                    : t(nearby.peers === 1 ? 'No Service. Sharing With {n} Nearby Phone Over Bluetooth (Your Spot Stays Private Until You Share).' : 'No Service. Sharing With {n} Nearby Phones Over Bluetooth (Your Spot Stays Private Until You Share).', { n: nearby.peers })
                  : activeShare
                    ? t('No Service. Riders Show Where They Were Last Seen, and Yours Sends When Service Returns.')
                    : t('No Service. Riders Show Where They Were Last Seen.')}
                {bluetoothOffered && !bluetoothMine ? ` ${t('Bluetooth Sharing Is Off.')}` : ''}
              </Text>
              {bluetoothOffered ? (
                <Pressable
                  onPress={() => setBluetoothMine(!bluetoothMine)}
                  hitSlop={8}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: bluetoothMine }}
                  accessibilityLabel={t('Bluetooth Sharing')}
                  accessibilityHint={t('Passes spots, taps and messages to nearby riders on this ride when there is no service')}
                  style={[styles.shareAction, styles.btChip, bluetoothMine && styles.btChipOn]}>
                  <Icon name="bluetooth" size={14} color={bluetoothMine ? Colors.sky : Colors.textSecondary} strokeWidth={2.2} />
                  {/* Shows what it is now, like a switch; tapping flips it. */}
                  <Text style={styles.shareActionText}>{bluetoothMine ? t('Bluetooth On') : t('Bluetooth Off')}</Text>
                  <ProTag feature="bluetooth_sharing" style={{ marginLeft: 2 }} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {activeShare && shareOpen ? (
            <View style={styles.shareBanner}>
              <Text style={[styles.shareText, { flex: 1, textAlign: 'left' }]}>{t('Sharing, {v}{v2}', { v: formatRemaining(shareLeft), v2: batteryBannerTag(batteryMode) })}</Text>
              <Pressable onPress={endShare} hitSlop={8} accessibilityRole="button" style={styles.shareAction}>
                <Text style={styles.shareActionText}>{t('Stop')}</Text>
              </Pressable>
              <Pressable onPress={toggleShareOpen} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Hide sharing details')} style={styles.shareAction}>
                <Text style={styles.shareActionText}>{t('Hide')}</Text>
              </Pressable>
            </View>
          ) : null}
          {regroup ? (
            <Pressable
              onPress={() => navigateTo(regroup.lat, regroup.lng, 'the Regroup Point')}
              accessibilityRole="button"
              style={[styles.shareBanner, styles.amberBanner]}>
              <Icon name="regroup" size={18} color={Glass.amber} strokeWidth={2.2} />
              <Text style={[styles.shareText, { flex: 1, textAlign: 'left' }]}>{t('Regroup point set. Tap to navigate')}</Text>
            </Pressable>
          ) : null}
          {announcement ? (
            <Pressable
              onPress={() => speak(spokenAnnouncement(nameOf(announcement.user_id), announcement.body))}
              accessibilityRole="button"
              accessibilityLabel={t('Announcement from {v}: {body}. Tap to hear it again.', { v: nameOf(announcement.user_id), body: announcement.body })}
              style={styles.announcement}>
              <View style={styles.announcementIcon}>
                <Icon name="megaphone" size={18} color={Glass.amber} strokeWidth={2.1} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.announcementLabel} numberOfLines={1}>{t('{v} · Tap to Hear Again', { v: nameOf(announcement.user_id) })}</Text>
                <Text style={styles.announcementText} numberOfLines={3}>{announcement.body}</Text>
              </View>
            </Pressable>
          ) : null}
          </ScrollView>
        ) : null}
        {tablet ? (
          sidebar.open ? (
            <Animated.View {...sidebar.panHandlers} style={[styles.sidebar, { transform: [{ translateX: sidebar.drag }] }]}>
              <View style={styles.sidebarHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sidebarTitle}>{t('Riders')}</Text>
                  <Text style={[styles.sidebarState, { color: bubble.alerts.length ? RideColors.red : RideColors.green }]}>{t('{v}, {length} on the Ride', { v: bubble.alerts.length ? t('{n} Separated', { n: bubble.alerts.length }) : t('Together'), length: joined.length })}</Text>
                </View>
                <Pressable
                  onPress={() => sidebar.setOpen(false)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: true }}
                  accessibilityLabel={t('Hide the riders')}
                  accessibilityHint={t('You can also swipe the list left to hide it')}
                  hitSlop={8}
                  style={styles.sidebarFold}>
                  <Text style={styles.sidebarFoldText}>{t('◀ Hide')}</Text>
                </Pressable>
              </View>
              {offlineSince != null ? (
                <Text style={styles.sidebarNote}>{t('You have no service. Times are from the last update you got.')}</Text>
              ) : null}
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 6, paddingBottom: 4 }} indicatorStyle={scrollIndicator()}>
                <RiderRows
                  riders={mapRiders}
                  meId={me}
                  onNavigate={navigateTo}
                  narrow
                  extra={(riderId) => (statuses[riderId]?.status === 'mechanical' ? <BreakdownBadge size={18} /> : null)}
                />
                {leaveButton ? <View style={{ marginTop: Spacing.two }}>{leaveButton}</View> : null}
              </ScrollView>
            </Animated.View>
          ) : (
            <Pressable
              onPress={() => sidebar.setOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              accessibilityLabel={t('Show the riders. {v}', { v: bubble.alerts.length ? `${bubble.alerts.length} separated` : 'Together' })}
              style={({ pressed }) => [styles.sidebarShow, { opacity: pressed ? 0.8 : 1 }]}>
              <View style={[styles.shareDot, { backgroundColor: bubble.alerts.length ? RideColors.red : RideColors.green }]} />
              <Text style={styles.sidebarShowText}>
                {bubble.alerts.length ? `${bubble.alerts.length} Separated` : t('Together')}
              </Text>
              <Text style={styles.sidebarShowText}>{t('Show Riders ▶')}</Text>
            </Pressable>
          )
        ) : null}
      </SafeAreaView>
      )}

      {panelH && directionRows.length && wpFabFits ? (
        <Pressable
          onPress={() => setDirectionsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('Directions in Apple Maps or Google Maps')}
          style={({ pressed }) => [
            styles.wpFab, styles.directionsFab, { bottom: panelBottom + panelH + 12, opacity: pressed ? 0.8 : 1 },
            tablet && { left: layout.width - EDGE - panelW },
          ]}>
          <Icon name="turn" size={24} color={Colors.sky} strokeWidth={2.1} />
          <Text style={styles.wpFabText}>{t('Directions')}</Text>
          <ProTag feature="directions" style={styles.fabPro} />
        </Pressable>
      ) : null}

      {mine && panelH && wpFabFits ? (
        <Pressable
          onPress={dropWaypointHere}
          accessibilityRole="button"
          accessibilityLabel={t('Add a waypoint at your location')}
          accessibilityHint={t('You can also press and hold the map to drop one anywhere')}
          style={({ pressed }) => [styles.wpFab, styles.waypointFab, { bottom: panelBottom + panelH + 12, opacity: pressed ? 0.8 : 1 }]}>
          <WaypointBlaze symbol="spot" shared={false} size={24} />
          <Text style={styles.wpFabText}>{t('Add Waypoint')}</Text>
          <ProTag feature="waypoints" style={styles.fabPro} />
        </Pressable>
      ) : null}

      {locateFits ? (
        <FollowMeButton
          status={followStatus}
          onPress={tapFollowMe}
          compact={fullMap}
          style={{ bottom: locateBottom, right: (tablet ? panelW + 2 * EDGE : 12) + LOCATE_SIZE + 8 }}
        />
      ) : null}
      {locateFits ? (
        <Pressable
          onPress={centerOnMe}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel={t('Center the map on you')}
          accessibilityState={{ busy: locating }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.locateFab, { bottom: locateBottom, opacity: pressed ? 0.8 : 1 },
            tablet && { right: panelW + 2 * EDGE },
          ]}>
          {locating ? <ActivityIndicator color={Colors.sky} /> : <Icon name="locate" size={26} color={Colors.sky} strokeWidth={2.2} />}
        </Pressable>
      ) : null}

      {tiltFits ? (
        <TiltTile
          reading={tiltReading}
          limits={tiltSettings.limits}
          style={tablet ? { bottom: panelBottom, left: (sidebar.open ? sideW + EDGE : 0) + EDGE } : { bottom: musicBottom, left: 12 }}
        />
      ) : null}
      {crash.alarm ? (
        <CrashCountdown cause={crash.alarm.cause} startedAt={crash.alarm.startedAt} onOk={crash.dismiss} onSend={() => sendCrashAlert(crash.alarm!.cause)}
          onTurnOff={() => {
            crash.dismiss();
            setCrashSettings({ ...tiltSettings.crash, enabled: false });
          }}
        />
      ) : null}

      {musicFits ? (
        <MusicButton
          onPress={() => setMusicOpen(true)}
          size={LOCATE_SIZE}
          style={[styles.musicFab, { bottom: musicBottom }, tablet && { right: panelW + 2 * EDGE }]}
        />
      ) : null}

      <Animated.View
        {...(fullMap ? fullMapSwipe.panHandlers : panelSwipeHandlers)}
        onLayout={(e) => setPanelH(Math.round(e.nativeEvent.layout.height))}
        style={[
          styles.bottomWrap,
          tablet && { left: 'auto', right: EDGE, bottom: panelBottom, width: panelW },
          { transform: [{ translateY: fullMap ? 0 : panelDrag }] },
        ]}>
      <SafeAreaView edges={tablet ? [] : ['bottom']} style={[styles.bottom, tablet && styles.bottomTablet]}>
        {/* In Full Map a small grab bar says the bar swipes up to bring everything back. */}
        {fullMap ? (
          <View pointerEvents="none" style={styles.fullGrab}>
            <View style={styles.handleBar} />
          </View>
        ) : null}
        {stripShown ? (
          <View
            ref={stripRef}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              setStripH(h);
              if (stripCompact) setCompactStripH(h);
            }}>
          <RouteStrip
            lengthM={route.route?.lengthM ?? freerideLine?.lengthM ?? 0}
            riders={route.route ? placed : freerideLine?.placed ?? []}
            meId={me}
            summary={routeSummary}
            nameOf={nameOf}
            offline={route.offline}
            lastSeenIds={lastSeenIds}
            range={route.route ? rangeNote : null}
            compact={stripCompact}
            freeride={route.route ? null : freerideStrip}
          />
          </View>
        ) : null}
        {fullMap ? null : (
          <View>
            <Pressable
              onPress={() => setPanelOpen(!panelOpen)}
              accessibilityRole="button"
              accessibilityState={{ expanded: panelOpen }}
              accessibilityLabel={panelOpen ? t('Hide the message and status buttons') : t('Show the message and status buttons')}
              accessibilityHint={t('You can also swipe the panel down to hide it or up to show it')}
              hitSlop={8}
              style={styles.handle}>
              <View style={styles.handleBar} />
            </Pressable>
            <FullMapButton onPress={enterFullMap} style={styles.fullMapBtn} />
            <Pressable
              onPress={() => requirePro('quick_replies') && setMessageOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('Type a Message')}
              accessibilityHint={t('Write your own message to everyone on this ride, or send one of your saved quick replies')}
              hitSlop={8}
              style={({ pressed }) => [styles.typeBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Icon name="chat" size={16} color={Colors.text} strokeWidth={2.2} />
              <Text style={styles.typeText}>{t('Message')}</Text>
              <ProTag feature="quick_replies" />
            </Pressable>
          </View>
        )}

        {broadcast.card && !fullMap ? (
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
                <View key={r.riderId} style={[styles.alertRow, r.status === 'yellow' && styles.alertRowAmber]}>
                  <Icon name="warning" size={18} color={r.status === 'yellow' ? Glass.amber : Glass.softRed} strokeWidth={2.2} />
                  <Text style={styles.alertText}>{r.message}</Text>
                  <View style={styles.alertActions}>
                    {p ? <AlertChip label={t('Navigate')} onPress={() => navigateToRiderInNeed(p.lat, p.lng)} /> : null}
                    {canRegroup ? <AlertChip label={t('Regroup')} onPress={regroupHere} /> : null}
                  </View>
                </View>
              );
            })}
            {shownHelpCalls.map(({ m, s }) => {
              const spot = callSpot(m.user_id);
              return (
                <View key={`s-${m.user_id}`} style={[styles.alertRow, !isUrgentCall(s.status) && styles.alertRowAmber]}>
                  {s.status === 'mechanical' ? <BreakdownBadge size={22} /> : (
                    <Icon name="warning" size={18} color={isUrgentCall(s.status) ? Glass.softRed : Glass.amber} strokeWidth={2.2} />
                  )}
                  <Text style={styles.alertText}>
                    <Text style={{ fontFamily: font(700) }}>{m.profiles?.display_name || 'Rider'}: {t(STATUS_LABEL[s.status])}</Text>, {ago(s.tapped_at, now)}
                  </Text>
                  <View style={styles.alertActions}>
                    {spot ? <AlertChip label={t('Navigate')} onPress={() => navigateToRiderInNeed(spot.lat, spot.lng)} /> : null}
                    <Pressable
                      onPress={() => setDismissedCalls((d) => new Set(d).add(callKey(m.user_id, s)))}
                      accessibilityRole="button"
                      accessibilityLabel={t('Dismiss {v}’s {v2} on my screen', { v: m.profiles?.display_name || 'Rider', v2: STATUS_LABEL[s.status] })}
                      hitSlop={12}
                      style={styles.callDismiss}>
                      <Icon name="close" size={16} color={Colors.textSecondary} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {myStatus?.status === 'mechanical' ? (
          <View style={styles.myBreakdown}>
            <BreakdownBadge size={28} />
            <View style={{ flex: 1 }}>
              <Text style={styles.myBreakdownTitle}>{MECHANICAL_LABEL}</Text>
              <Text style={styles.myBreakdownBody}>{t('Your leader and tail gunner can see where you are.')}</Text>
            </View>
            <Pressable
              onPress={() => tapStatus('ok')}
              accessibilityRole="button"
              accessibilityLabel={t('Fixed. Send status OK')}
              style={({ pressed }) => [styles.myBreakdownOk, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.myBreakdownOkText}>{t('Fixed, I’m OK')}</Text>
            </Pressable>
          </View>
        ) : null}

        {myStatus && myStatus.status !== 'ok' && myStatus.status !== 'mechanical' && isActiveCall(myStatus, now) ? (
          <View style={[styles.myBreakdown, { borderLeftColor: isUrgentCall(myStatus.status) ? RideColors.red : RideColors.yellow }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.myBreakdownTitle}>{t('Your Status: {v}', { v: t(STATUS_LABEL[myStatus.status]) })}</Text>
              <Text style={styles.myBreakdownBody}>{t('The group sees it until you mark it resolved.')}</Text>
            </View>
            <Pressable
              onPress={() => tapStatus('ok')}
              accessibilityRole="button"
              accessibilityLabel={t('Resolved. Clear {v} and send status OK', { v: STATUS_LABEL[myStatus.status] })}
              style={({ pressed }) => [styles.myBreakdownOk, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.myBreakdownOkText}>{t('Resolved, I’m OK')}</Text>
            </Pressable>
          </View>
        ) : null}

        {fullMap ? (
          <View style={[styles.foldedRow, !stripShown && { marginTop: 0 }]}>
            <Pressable
              onPress={showMenus}
              accessibilityRole="button"
              accessibilityLabel={restoreA11yLabel(foldedCount)}
              accessibilityHint={t('Brings back messages, status buttons and the ride. You can also swipe the bar up')}
              style={({ pressed }) => [styles.foldedShow, styles.fullMapBarBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Icon name="collapse" size={20} color={Colors.text} strokeWidth={2.4} />
              <Text style={styles.foldedShowText}>{RESTORE_LABEL}</Text>
              {foldedCount ? (
                <View style={styles.foldedBadge}>
                  <Text style={styles.foldedBadgeText}>{foldedCount}</Text>
                </View>
              ) : null}
            </Pressable>
            {musicOn ? <MusicButton onPress={() => setMusicOpen(true)} size={56} style={styles.fullMapMusic} /> : null}
            <Pressable
              onPress={() => tapStatus('emergency')}
              accessibilityRole="button"
              accessibilityLabel={t('Send status EMERGENCY')}
              style={({ pressed }) => [styles.foldedSos, styles.fullMapBarBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.statusText, styles.sosText]}>{t('EMERGENCY')}</Text>
            </Pressable>
          </View>
        ) : !panelOpen ? (
          <View style={styles.foldedRow}>
            <Pressable
              onPress={() => setPanelOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={foldedCount ? t('Show buttons and {foldedCount} more alerts', { foldedCount }) : t('Show the message and status buttons')}
              style={({ pressed }) => [styles.foldedShow, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.foldedShowText}>{t('Buttons ▲')}</Text>
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
                accessibilityLabel={t('Send status {v}', { v: MECHANICAL_LABEL })}
                style={({ pressed }) => [styles.foldedMech, { opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.statusText, styles.mechText]}>{MECHANICAL_LABEL}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => tapStatus('emergency')}
              accessibilityRole="button"
              accessibilityLabel={t('Send status EMERGENCY')}
              style={({ pressed }) => [styles.foldedSos, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.statusText, styles.sosText]}>{t('EMERGENCY')}</Text>
            </Pressable>
          </View>
        ) : null}

        {panelOpen ? (
          <>
            <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
              <QuickRow lastReply={lastReply} onReply={quickReply} onMore={() => setStatusesOpen(true)} />
              <PanelActions onRegroup={canRegroup ? regroupHere : undefined} onEmergency={() => tapStatus('emergency')} />
            </View>
          </>
        ) : null}
      </SafeAreaView>
      </Animated.View>

      <StatusSheet
        visible={statusesOpen}
        tablet={tablet}
        labels={STATUS_LABEL}
        myStatus={myStatus?.status}
        lastReply={lastReply}
        onReply={quickReply}
        onStatus={tapStatus}
        onRegroup={canRegroup ? regroupHere : undefined}
        onEmergency={() => tapStatus('emergency')}
        onClose={() => setStatusesOpen(false)}
      />

      <RideMessageSheet
        visible={messageOpen}
        tablet={tablet}
        saved={savedReplies.saved}
        onSend={sendTyped}
        onRemove={savedReplies.remove}
        onClose={() => setMessageOpen(false)}
      />

      {musicOn ? <MusicSheet visible={musicOpen} tablet={tablet} onClose={() => setMusicOpen(false)} /> : null}

      <DirectionsSheet visible={directionsOpen} rows={directionRows} onClose={() => setDirectionsOpen(false)} />

      <RiderList
        visible={ridersOpen && !tablet}
        riders={mapRiders}
        meId={me}
        offline={offlineSince != null}
        onClose={() => setRidersOpen(false)}
        onNavigate={navigateTo}
        extra={(riderId) => (statuses[riderId]?.status === 'mechanical' ? <BreakdownBadge size={18} /> : null)}
        footer={leaveButton}
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

      <SheetModal visible={askShare && ride?.status === 'live'} animationType="slide" transparent onRequestClose={() => setAskShare(false)}>
        <SheetRoot style={[styles.sheetWrap, tablet && styles.sheetWrapTablet]}>
          <KeyboardLift>
          <SwipeSheet onClose={() => setAskShare(false)} style={[styles.sheet, tablet && styles.sheetTablet]} accessibilityViewIsModal>
            <ThemedText type="subtitle" style={styles.sheetTitle}>{t('Share Your Location with This Ride?')}</ThemedText>
            <ThemedText type="small" style={styles.sheetBody}>
              {t('Only riders on this ride will see you. Sharing always stops when the ride ends or you leave it.')}
            </ThemedText>
            <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} {...keyboardScroll}>
              <SharePicker
                options={RIDE_SHARE_OPTIONS_MIN}
                openLabel="Until I Turn It Off"
                openHint="No time limit. Stops when you tap Stop, leave, or the ride ends."
                onPick={beginShare}
                busy={busy}
              />
            </SheetScroll>
            <Button title={t('Not Now')} kind="secondary" onPress={() => setAskShare(false)} />
          </SwipeSheet>
          </KeyboardLift>
        </SheetRoot>
      </SheetModal>

      <SheetModal visible={sosOpen} animationType="fade" transparent onRequestClose={() => setSosOpen(false)}>
        <SheetRoot style={[styles.sheetWrap, tablet && styles.sheetWrapTablet]}>
          <SwipeSheet
            onClose={() => setSosOpen(false)}
            style={[styles.sheet, tablet && styles.sheetTablet, { borderTopColor: RideColors.red, borderTopWidth: 6 }]}
            accessibilityViewIsModal>
            <ThemedText type="subtitle" style={styles.sheetTitle}>{t('Emergency')}</ThemedText>
            <ThemedText style={styles.sheetBody}>
              {t('This alerts everyone on the ride with your location. It does not contact emergency services. Call 911 if anyone is hurt.')}
            </ThemedText>
            {myPos ? (
              <ThemedText style={[styles.sheetBody, { fontSize: 24, fontWeight: 800, color: Colors.text }]}>
                {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)}
              </ThemedText>
            ) : null}
            <HoldButton
              title={t('Alert My Group')}
              accessibilityLabel={t('Alert my group: send EMERGENCY to everyone on this ride')}
              onHold={() => {
                // Close the sheet first so the Sending card shows at once; the send keeps going
                // (and retries from the outbox) after the sheet is gone.
                setSosOpen(false);
                sendEmergency();
              }}
            />
            <Button title={t('Call 911')} kind="danger" onPress={() => Linking.openURL('tel:911')} />
            <Button title={t('Cancel')} kind="secondary" onPress={() => setSosOpen(false)} />
          </SwipeSheet>
        </SheetRoot>
      </SheetModal>
    </View>
  );
}

/** A small action inside an alert row (Navigate, Regroup). */
function AlertChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tapFeel();
        onPress();
      }}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [styles.alertChip, pressed && { opacity: 0.7 }]}>
      <Text style={styles.alertChipText}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two, gap: 6 },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, paddingLeft: 8, paddingRight: 10, paddingVertical: 7,
    minHeight: 54, backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile },
  topTitleWrap: { flex: 1, minWidth: 0 },
  topText: { color: Colors.text, fontSize: 20, lineHeight: 22, fontFamily: font(700, 'display') },
  topSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  topSub: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12, flexShrink: 1 },
  groupChip: { paddingHorizontal: 10, minHeight: 30, borderRadius: 15, justifyContent: 'center', borderWidth: 1 },
  groupChipRed: { backgroundColor: Glass.redTint, borderColor: Glass.redEdge },
  groupChipGreen: { backgroundColor: withAlpha(RideColors.green, 0.1), borderColor: withAlpha(RideColors.green, 0.4) },
  groupChipText: { fontFamily: font(700), fontSize: 13 },
  shareDot: { width: 7, height: 7, borderRadius: 4 },
  shareBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingLeft: 12, paddingRight: 6,
    minHeight: 44, backgroundColor: Glass.panel, borderWidth: 1, borderColor: 'rgba(59,134,247,0.45)',
  },
  amberBanner: { borderColor: 'rgba(242,178,51,0.45)', paddingRight: 12, paddingVertical: 8 },
  shareText: { color: Colors.text, fontFamily: font(700), fontSize: 14, lineHeight: 18, textAlign: 'center' },
  shareAction: { minHeight: 32, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: Glass.tile },
  shareActionText: { color: Colors.text, fontFamily: font(700), fontSize: 13 },
  btChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'transparent' },
  btChipOn: { borderColor: Colors.sky },
  // Tablets: the top bar, banners and riders become a column on the left, as tall as the screen.
  topTablet: { right: 'auto' },
  sidebar: {
    flexShrink: 1, gap: Spacing.two, padding: 10, paddingTop: 12, borderRadius: 20,
    backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
  },
  sidebarHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  sidebarTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 26, lineHeight: 28 },
  sidebarState: { fontFamily: font(700), fontSize: 14 },
  sidebarFold: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: Colors.backgroundSelected },
  sidebarFoldText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  sidebarNote: { color: Colors.text, fontFamily: font(700), fontSize: 13, paddingHorizontal: 4 },
  sidebarShow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14,
    borderRadius: 22, backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
  },
  sidebarShowText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  bottomWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomTablet: { borderRadius: 24, borderWidth: 1, paddingBottom: 12 },
  bottom: {
    paddingHorizontal: 12, paddingBottom: Spacing.two, paddingTop: 10,
    backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge, borderBottomWidth: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26,
  },
  foldedRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  foldedShow: {
    flex: 1, minHeight: 56, borderRadius: Radius.control, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge,
  },
  foldedShowText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19 },
  foldedBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: RideColors.yellow },
  foldedBadgeText: { color: '#1A1100', fontFamily: font(800), fontSize: 14 },
  foldedMech: {
    flex: 1, minHeight: 56, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    backgroundColor: Glass.amberTint, borderWidth: 1.5, borderColor: 'rgba(242,178,51,0.6)',
  },
  mechText: { color: Glass.amber, fontSize: 18, lineHeight: 20 },
  myBreakdown: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.two, padding: 10, paddingLeft: 12,
    borderRadius: 16, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge, borderLeftWidth: 4, borderLeftColor: RideColors.yellow,
  },
  myBreakdownTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 18 },
  myBreakdownBody: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  myBreakdownOk: { minHeight: 44, paddingHorizontal: 12, borderRadius: Radius.control, justifyContent: 'center', backgroundColor: RideColors.green },
  myBreakdownOkText: { color: '#06210F', fontFamily: font(700, 'display'), fontSize: 17 },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 16, backgroundColor: Glass.redTint, borderWidth: 1, borderColor: Glass.redEdge,
  },
  alertRowAmber: { backgroundColor: 'rgba(242,178,51,0.08)', borderColor: 'rgba(242,178,51,0.4)' },
  alertText: { flex: 1, minWidth: 150, color: Colors.text, fontFamily: font(500), fontSize: 14, lineHeight: 18 },
  alertActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  alertChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  alertChipText: { color: Colors.text, fontFamily: font(700), fontSize: 13 },
  callDismiss: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  foldedSos: {
    flex: 1, minHeight: 56, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Glass.redTint, borderWidth: 1.5, borderColor: 'rgba(229,38,46,0.75)',
  },
  sosText: { color: Glass.softRed },
  actions: { flexDirection: 'row', gap: Spacing.two },
  handle: { alignItems: 'center', minHeight: 40, justifyContent: 'center', marginTop: -6 },
  fullGrab: { alignItems: 'center', paddingBottom: 6, marginTop: -4 },
  handleBar: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  fullMapBtn: { position: 'absolute', right: 0, top: -4 },
  // Mirrors Full Map on the left of the handle: Type a Message.
  typeBtn: {
    position: 'absolute', left: 0, top: 0, minHeight: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', gap: 6,
    alignItems: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge,
  },
  typeText: { color: Colors.text, fontFamily: font(700), fontSize: 13 },
  fullMapBarBtn: { minHeight: 48 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Glass.panel, borderWidth: 1.5, borderColor: Colors.textSecondary, borderStyle: 'dashed',
  },
  // The same dashed grey as a rider who has lost service: dashed grey always means no signal.
  offlineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: Colors.textSecondary, borderStyle: 'dashed' },
  offlineText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 14, lineHeight: 18 },
  announcement: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 10, paddingRight: 12,
    backgroundColor: Glass.panel, borderWidth: 1, borderColor: 'rgba(242,178,51,0.45)',
  },
  announcementIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.amberTint },
  announcementLabel: { color: Glass.amber, fontFamily: font(700), fontSize: 12, letterSpacing: 0.3 },
  announcementText: { color: Colors.text, fontFamily: font(700), fontSize: 16, lineHeight: 21 },
  statusText: { color: '#fff', fontFamily: font(700, 'display'), fontSize: 20, textAlign: 'center' },
  wpFab: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 10, paddingRight: 14,
    borderRadius: 22, backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
  },
  directionsFab: { left: 12 },
  fabPro: { marginLeft: 2 },
  locateFab: {
    position: 'absolute', right: 12, width: LOCATE_SIZE, height: LOCATE_SIZE, borderRadius: LOCATE_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Glass.panel, borderWidth: 1, borderColor: Glass.edge,
  },
  waypointFab: { right: 12 },
  musicFab: { position: 'absolute', right: 12 },
  // Square-cornered like its neighbours in the Full Map bar, and as tall.
  fullMapMusic: { borderRadius: Radius.control },
  wpFabText: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 17 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  // On a tablet a sheet is a card in the middle of the screen, not a strip across the bottom.
  sheetWrapTablet: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 28 },
  sheet: { flexShrink: 1, backgroundColor: Colors.backgroundElement, padding: Spacing.four, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetTitle: { color: Colors.text },
  sheetBody: { color: Colors.textSecondary },
}));
