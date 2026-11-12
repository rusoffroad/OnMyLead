import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, Switch, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { CUSTOM_TRAIL_INTRO_KEY, CustomTrailIntro } from '@/components/custom-trail-intro';
import { ExitModeButton, leaveModeScreen, useModeBackButton } from '@/components/exit-mode';
import { BarChip, BarReadout, FullMapBar } from '@/components/full-map';
import { ObstacleSheet } from '@/components/obstacle-sheet';
import { Icon } from '@/components/icon';
import { MapSearch } from '@/components/map-search';
import { NavMap, RECORD_INK, type NavMapHandle } from '@/components/nav-map';
import { PanelHandle } from '@/components/panel-handle';
import { CompassSpot } from '@/components/compass-spot';
import { TrailMapOverlay } from '@/components/trail-map-overlay';
import { WaypointSheet, type WaypointSheetTarget } from '@/components/waypoint-sheet';
import { Colors, font, Glass, GlassSurface, Radius, RideColors, Spacing, themedStyles } from '@/constants/theme';
import { followCamActive, followMeStatus, followMeTap, nearFollowedTrail } from '@/core/follow-camera';
import { carMapGuide, carMapLine, carPlayMapState, parseCarPlayAction, type CarMapLine } from '@/core/carplay';
import { flatLook, mapboxStyleFor } from '@/core/terrain';
import { MAPBOX_TOKEN } from '@/lib/terrain';
import { riderHeading } from '@/core/heading';
import { useFollowMe } from '@/hooks/use-follow-me';
import { FollowMeButton } from '@/components/follow-me-button';
import { bottomPanelPadding, FULL_MAP_BAR_H, fullMapPadding } from '@/core/full-map';
import { backPress, mapExitPrompt } from '@/core/mode-exit';
import { distanceM, type LatLng } from '@/core/geo';
import { foregroundPermission } from '@/core/location-permission';
import { compassAllowed } from '@/lib/compass';
import {
  acceptFix, canRate, clock, coveredM, EMPTY_DETAILS, feet, feetOrMiles, followProgress, newTrailId, RIDER_TRAIL_INK, toLatLngs, toTrackPoint,
  DEFAULT_TRAIL_RULES, trackStats, unseenHidden, type LocalTrail, type PublicTrail, type TrailRules,
} from '@/core/nav-trails';
import { newObstacleId, nextName, type Obstacle, type ObstacleKind } from '@/core/obstacles';
import { dayLines, TRACK_DAY_COLORS, TRACK_LINE_SWITCH_KEY } from '@/core/track-line';
import {
  addTripFix, dashHeading, EMPTY_TRIP, headingReadout, movingReadout, parseTrip, TRIP_STORAGE_KEY, type TripMeter,
} from '@/core/trip-meter';
import type { Place } from '@/core/places';
import { cumulativeM, lineLengthM } from '@/core/route';
import type { Waypoint } from '@/core/waypoints';
import { useFullMap } from '@/hooks/use-full-map';
import { useLayout } from '@/hooks/use-layout';
import { useMapModeRide } from '@/hooks/use-map-mode-ride';
import { usePanelFold } from '@/hooks/use-panel-fold';
import { useRememberedToggle } from '@/hooks/use-remembered-toggle';
import { useRouteDraft } from '@/hooks/use-route-draft';
import { useTilt } from '@/hooks/use-tilt';
import { useTrailMap } from '@/hooks/use-trail-map';
import { confirmAsync, showNotice } from '@/lib/confirm';
import { openDirections } from '@/lib/directions';
import { useMapWaypoints } from '@/lib/map-waypoints';
import {
  fetchTrailRules, getLocalTrail, getPublicTrail, loadTrails, markHiddenSeen, readRecording, saveLocalTrail, syncMyTrails, trailLine, useLocalTrails, writeRecording,
  type Recording,
} from '@/lib/nav-trails';
import { clearCarPlayMap, onCarPlayAction, showMapOnCarPlay } from '@/lib/carplay';
import { requirePro, showProGate, useCan } from '@/lib/pro';
import { useMapModeTime } from '@/lib/map-mode-time';
import { mapTimeLeftText } from '@/core/map-mode-time';
import { useTiltSettings } from '@/lib/tilt';
import { TiltTile } from '@/components/tilt-tile';
import { clearTrackLine, flushTrackLine, recordTrackFixes, setTrackLineOn, useTrackDays } from '@/lib/track-line';
import { setSyncedItem } from '@/lib/settings-sync';
import { MusicButton, MusicSheet } from '@/components/music-controls';
import { useMusicControls } from '@/hooks/use-music-controls';
import { ProTag } from '@/components/pro-tag';
import { MAP_BLUE } from '@/components/home/map-mode-card';
import { groupRideDetail, groupRideHref } from '@/core/nav-solo';

import { t as tr } from '@/lib/i18n';
type Mode = 'explore' | 'record' | 'measure';
type Followed = { name: string; points: LatLng[]; publicTrail: PublicTrail | null; obstacles?: Obstacle[] };
/** A spot being named: where it goes (the drawn line or the recording) and, when editing, which one. */
type Pending = { lat: number; lng: number; where: 'draw' | 'rec'; id?: string; name: string; kind: ObstacleKind };

const WEB = Platform.OS === 'web';
const PANEL_W = 400;
const SAND = '#ECCD91';
const MPS_TO_MPH = 2.23694;

/**
 * Map Mode: OnMyLead as a rider's everyday off-road map when they aren't on a group ride.
 * The same map as Ride Mode (satellite or topo, Forest Service, BLM, OpenStreetMap and rider trails)
 * with three tools in the panel, plus Track Line (where you've been, a colour per day):
 *  - Explore: where you are, speed and elevation, and a trail to follow (yours or a rider's) with
 *    the distance to its start or what's left of it;
 *  - Record: lays down your own trail as you ride, kept on this phone until you choose to share it;
 *  - Draw: map a custom trail or measure, tap points (along the trails or straight) for the miles
 *    between, name spots on it, and save it as a trail. Opened with ?draw=1 (home screen's Map a
 *    Custom Trail), it first explains how custom trails are shared, rated and taken down.
 * The screen stays on while recording or following. Trails saved here work as group ride routes.
 */
export default function NavMode() {
  const params = useLocalSearchParams<{ follow?: string; trail?: string; draw?: string }>();
  const trackLinePro = useCan('track_line');
  // Free riders get a number of Map Mode hours each month; riding with a group never counts.
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const mapTime = useMapModeTime(focused);
  const mapTimeText = mapTime.onGroupRide ? null : mapTimeLeftText(mapTime.left);
  useEffect(() => {
    if (!mapTime.usedUp) return;
    showProGate({ kind: 'pro_required', feature: 'map_mode' });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [mapTime.usedUp]);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const layout = useLayout();
  const wide = layout.expanded;
  const floating = layout.wide && !wide;
  const trail = useTrailMap();
  const map = useRef<NavMapHandle>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const musicOn = useMusicControls();
  // The bottom panel's measured height on a phone, so the map buttons sit just above it rather
  // than at a guessed height that ended up under a tall panel (3.0 test pass).
  const [panelH, setPanelH] = useState<number | undefined>(undefined);
  // Full Map: the top bar, layers and panel tuck away; one slim bar keeps the number that matters
  // (speed, miles left on the trail, or the measured length) and Center on Me stays.
  const fullMap = useFullMap('nav.fullMap.v1');
  const full = fullMap.full;
  // A long swipe down on the panel (or a swipe on the folded panel) goes straight to Full Map.
  const fold = usePanelFold('nav.panelOpen.v1', true, wide ? 'up' : 'down', true, fullMap.enter);
  const open = fold.open;
  const [mode, setMode] = useState<Mode>('explore');
  const { trails: local } = useLocalTrails();

  // --- Waypoints: press and hold the map to drop one --------------------------------
  // On a live group ride (sharing location with it), they go to that ride like in Ride Mode, and the
  // leader's are shared with the group. Otherwise they're the rider's own, on this device and backed
  // up with Sync (lib/map-waypoints).
  const groupRide = useMapModeRide(focused);
  const mapWaypoints = useMapWaypoints();
  const shownWaypoints = groupRide.rideId ? [...groupRide.wp.waypoints, ...mapWaypoints] : mapWaypoints;
  const [wpTarget, setWpTarget] = useState<WaypointSheetTarget>(null);
  // Which list the open sheet works on: the ride's, or Map Mode's own.
  const [wpOnRide, setWpOnRide] = useState(false);
  const openNewWaypoint = useCallback((at: LatLng) => {
    if (!requirePro('waypoints')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWpOnRide(!!groupRide.rideId && groupRide.wp.switchedOn);
    setWpTarget({ type: 'new', at });
  }, [groupRide.rideId, groupRide.wp.switchedOn]);
  const openWaypoint = useCallback((w: Waypoint) => {
    setWpOnRide(!!w.ride_id);
    setWpTarget({ type: 'view', waypoint: w });
  }, []);

  // --- Where the rider is -------------------------------------------------------
  const [me, setMe] = useState<LatLng | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  // Which way the rider is moving, for the arrow on their own dot on the website's map.
  const [meHeading, setMeHeading] = useState<number | null>(null);
  const [meFixAt, setMeFixAt] = useState<number | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const fixListener = useRef<(l: Location.LocationObject) => void>(() => {});
  // The phone's compass, for the Heading readout while standing still (phones only).
  const [compass, setCompass] = useState<number | null>(null);
  // Trip meter: miles and moving time while Map Mode is open, kept on this phone until reset.
  const [trip, setTripState] = useState<TripMeter>(EMPTY_TRIP);
  const tripRef = useRef<TripMeter>(EMPTY_TRIP);
  const tripSaved = useRef(0);
  const saveTrip = useCallback((t: TripMeter) => {
    tripSaved.current = t.distanceM;
    AsyncStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify({ distanceM: Math.round(t.distanceM), movingS: Math.round(t.movingS) })).catch(() => {});
  }, []);
  const setTrip = useCallback((t: TripMeter) => {
    tripRef.current = t;
    setTripState(t);
  }, []);
  const resetTrip = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const fresh = { ...EMPTY_TRIP, last: tripRef.current.last };
    setTrip(fresh);
    saveTrip(fresh);
  }, [saveTrip, setTrip]);

  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let headingSub: Location.LocationSubscription | null = null;
      let gone = false;
      AsyncStorage.getItem(TRIP_STORAGE_KEY)
        .then((raw) => {
          if (gone || !raw) return;
          const t = parseTrip(JSON.parse(raw));
          // A fix may already have landed: keep it as the anchor.
          setTrip({ ...t, last: tripRef.current.last });
          tripSaved.current = t.distanceM;
        })
        .catch(() => {});
      foregroundPermission({
        get: () => Location.getForegroundPermissionsAsync(),
        // Allowed just now: the compass starts at once for the dot's arrow (lib/compass).
        request: () => Location.requestForegroundPermissionsAsync().then((p) => {
          if (p.status === 'granted') compassAllowed();
          return p;
        }),
      })
        .then(async (p) => {
          if (gone) return;
          if (p.status !== 'granted') return setNoLocation(true);
          setNoLocation(false);
          // Open on the rider straight away from the phone's last known spot, while GPS warms up.
          Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })
            .then((l) => {
              if (!gone && l) setMe((m) => m ?? { lat: l.coords.latitude, lng: l.coords.longitude });
            })
            .catch(() => {});
          if (Platform.OS !== 'web') {
            Location.watchHeadingAsync((h) => {
              const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
              if (!(deg >= 0)) return;
              // Only a real turn re-draws the panel; the compass reports many times a second.
              setCompass((c) => (c != null && Math.abs(((deg - c + 540) % 360) - 180) < 3 ? c : Math.round(deg) % 360));
            })
              .then((s) => {
                if (gone) s.remove();
                else headingSub = s;
              })
              .catch(() => {});
          }
          sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 }, (l) => {
            setMe({ lat: l.coords.latitude, lng: l.coords.longitude });
            setSpeed(l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null);
            setMeHeading(riderHeading({ speedMps: l.coords.speed, headingDeg: l.coords.heading }, true));
            setMeFixAt(l.timestamp);
            setAltitude(l.coords.altitude ?? null);
            const t = addTripFix(tripRef.current, { lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? null, speedMps: l.coords.speed, timestamp: l.timestamp });
            if (t !== tripRef.current) {
              setTrip(t);
              if (t.distanceM - tripSaved.current >= 50) saveTrip(t);
            }
            fixListener.current(l);
          });
          if (gone) sub.remove();
        })
        .catch(() => setNoLocation(true));
      loadTrails();
      syncMyTrails().catch(() => {});
      return () => {
        gone = true;
        sub?.remove();
        headingSub?.remove();
        saveTrip(tripRef.current);
        // The next visit starts a fresh step from wherever the rider is then.
        tripRef.current = { ...tripRef.current, last: null };
        flushTrackLine();
      };
    }, [saveTrip, setTrip]),
  );

  // --- Recording ----------------------------------------------------------------
  const [rec, setRec] = useState<Recording | null>(null);
  const recRef = useRef<Recording | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const setRecording = useCallback((r: Recording | null) => {
    recRef.current = r;
    setRec(r);
  }, []);

  // A recording survives leaving the screen, a crash or a dead battery: pick it back up.
  useEffect(() => {
    readRecording().then((r) => {
      if (r && !recRef.current) {
        setRecording({ ...r, paused: true });
        setMode('record');
      }
    });
  }, [setRecording]);

  // --- Following a trail ----------------------------------------------------------
  const [followed, setFollowed] = useState<Followed | null>(null);
  // Follow Me (core/follow-camera): the map keeps the rider on screen as they move. The switch is
  // shared with Ride Mode and remembered; dragging the map pauses it until Center on Me.
  const followMe = useFollowMe();
  const { cam, camEvent } = followMe;
  const followTrack = useRef<LatLng[]>([]);
  const [followCovered, setFollowCovered] = useState(0);
  const hint = useRef<number | null>(null);
  const cum = useMemo(() => (followed ? cumulativeM(followed.points) : []), [followed]);

  const follow = useCallback((f: Followed) => {
    followTrack.current = [];
    hint.current = null;
    setFollowCovered(0);
    setFollowed(f);
    camEvent('follow');
    setMode('explore');
    trail.pick(null);
    setTimeout(() => map.current?.fit(f.points), 50);
    // `trail.pick` is stable enough: it's a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened with a trail to follow: a rider's public trail (?follow=) or one of yours (?trail=).
  useEffect(() => {
    if (params.follow) {
      getPublicTrail(params.follow)
        .then((t) => t && follow({ name: t.name, points: t.points, publicTrail: t, obstacles: t.obstacles }))
        .catch(() => {});
    } else if (params.trail) {
      loadTrails().then(() => {
        const t = getLocalTrail(params.trail!);
        if (t) follow({ name: t.details.name || 'Your Trail', points: trailLine(t), publicTrail: null, obstacles: t.obstacles });
      });
    }
  }, [params.follow, params.trail, follow]);

  // Every fix: add it to the recording, and note how much of a followed trail has been ridden.
  useEffect(() => {
    fixListener.current = (l) => {
      void recordTrackFixes([{ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? null, timestamp: l.timestamp }]);
      const r = recRef.current;
      if (r && !r.paused) {
        const fix = { lat: l.coords.latitude, lng: l.coords.longitude, altitude: l.coords.altitude ?? null, accuracy: l.coords.accuracy ?? null, timestamp: l.timestamp };
        if (acceptFix(r.points[r.points.length - 1], fix)) {
          const next = { ...r, points: [...r.points, toTrackPoint(fix)] };
          setRecording(next);
          if (next.points.length % 5 === 1) writeRecording(next);
        }
      }
      if (followed) {
        followTrack.current.push({ lat: l.coords.latitude, lng: l.coords.longitude });
        if (followTrack.current.length % 10 === 0) setFollowCovered(coveredM(followed.points, followTrack.current));
      }
    };
  }, [followed, setRecording]);

  // The screen stays on while recording or following, like Ride Mode.
  const awake = (!!rec && !rec.paused) || !!followed;
  useEffect(() => {
    if (!awake || WEB) return;
    activateKeepAwakeAsync('nav').catch(() => {});
    return () => {
      deactivateKeepAwake('nav').catch(() => {});
    };
  }, [awake]);

  // The recording clock ticks once a second.
  useEffect(() => {
    if (!rec || rec.paused) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rec]);

  const recStats = useMemo(() => (rec ? trackStats(rec.points) : null), [rec]);
  const recLine = useMemo(() => (rec ? toLatLngs(rec.points) : []), [rec]);

  async function startRecording() {
    if (noLocation) return;
    if (!requirePro('record_trails')) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const r: Recording = { startedAt: Date.now(), points: [], paused: false };
    setRecording(r);
    writeRecording(r);
    camEvent('record');
    setNow(Date.now());
  }

  function pauseRecording(paused: boolean) {
    if (!rec) return;
    Haptics.selectionAsync();
    const r = { ...rec, paused };
    setRecording(r);
    writeRecording(r);
    if (!paused) camEvent('record');
  }

  /** Save the recording as one of your trails (and stop recording). Null when nothing was recorded. */
  async function saveRecording(): Promise<LocalTrail | null> {
    if (!rec || rec.points.length < 2) return null;
    const nowIso = new Date().toISOString();
    const t: LocalTrail = {
      id: newTrailId(),
      details: { ...EMPTY_DETAILS, name: tr('Trail {v}', { v: new Date(rec.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }) },
      points: rec.points,
      source: 'recorded',
      obstacles: rec.obstacles ?? [],
      photos: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      shared: null,
    };
    await saveLocalTrail(t);
    setRecording(null);
    writeRecording(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return t;
  }

  async function finishRecording() {
    if (!rec) return;
    if (rec.points.length < 2) {
      if (await confirmAsync(tr('Nothing Recorded Yet'), tr('Ride a little further first. Discard this recording?'), tr('Discard'), tr('Keep Recording'))) discardNow();
      return;
    }
    const t = await saveRecording();
    if (t) router.push(`/nav/trail/${t.id}?fresh=1`);
  }

  // --- Make It a Group Ride (Pro, 3.0) -----------------------------------------------
  // Map Mode is solo. One tap turns it into a group ride: the trail you're recording (saved first)
  // or following becomes the route, and where you are now is the meeting point.
  const followingOwn = followed && !followed.publicTrail && params.trail ? params.trail : null;
  async function makeGroupRide() {
    if (!requirePro('trail_rides')) return;
    let trailId = followingOwn;
    if (rec && rec.points.length >= 2) {
      const ok = await confirmAsync(
        tr('Finish Recording?'),
        tr('Your recording is saved to My Trails and becomes the group ride’s route.'),
        tr('Finish and Plan'),
        tr('Keep Recording'),
      );
      if (!ok) return;
      trailId = (await saveRecording())?.id ?? trailId;
    }
    router.push(groupRideHref({ trailId, at: me, spot: followed?.name ?? tr('Meet Point') }) as never);
  }

  function discardNow() {
    setRecording(null);
    writeRecording(null);
  }

  async function discard() {
    if (await confirmAsync(tr('Discard This Recording?'), tr('The trail you recorded is deleted from this phone.'), tr('Discard'), tr('Keep It'))) discardNow();
  }

  // --- Measuring ------------------------------------------------------------------
  const [follows, , setFollows] = useRememberedToggle('nav.measureTrails.v1', true);
  const draft = useRouteDraft(follows, trail.offline);
  const measureLen = useMemo(() => lineLengthM(draft.points), [draft.points]);
  const lastTap = draft.taps[draft.taps.length - 1];

  // --- Map a Custom Trail: the how-it-works sheet, then Draw ------------------------
  const [intro, setIntro] = useState(false);
  const [rules, setRules] = useState<TrailRules>(DEFAULT_TRAIL_RULES);
  const introDone = useRef<boolean | null>(null);
  const showIntroIfNew = useCallback(() => {
    AsyncStorage.getItem(CUSTOM_TRAIL_INTRO_KEY)
      .catch(() => null)
      .then((v) => {
        if (v === '1' || introDone.current) return;
        introDone.current = true;
        fetchTrailRules().then(setRules).catch(() => {});
        setIntro(true);
      });
  }, []);
  useEffect(() => {
    if (params.draw !== '1') return;
    // From the home screen's Map a Custom Trail: open on Draw (Pro).
    if (!requirePro('custom_trails')) return;
    Promise.resolve().then(() => setMode('measure'));
    showIntroIfNew();
  }, [params.draw, showIntroIfNew]);
  const changeMode = (m: Mode) => {
    if (m === 'measure' && !requirePro('custom_trails')) return;
    setMode(m);
    if (m === 'measure') showIntroIfNew();
  };

  // --- Named spots (obstacles) on a drawn line or a recording ------------------------
  const [drawObs, setDrawObs] = useState<Obstacle[]>([]);
  const [marking, setMarking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const markAt = (p: LatLng, where: 'draw' | 'rec') => {
    if (!requirePro('trail_spots')) return;
    const list = where === 'draw' ? drawObs : rec?.obstacles ?? [];
    setPending({ ...p, where, name: nextName(list), kind: 'obstacle' });
  };
  const editSpot = (o: Obstacle) => {
    const where = drawObs.some((x) => x.id === o.id) ? 'draw' : rec?.obstacles?.some((x) => x.id === o.id) ? 'rec' : null;
    if (where) setPending({ lat: o.lat, lng: o.lng, where, id: o.id, name: o.name, kind: o.kind });
  };
  const putSpots = (where: 'draw' | 'rec', change: (list: Obstacle[]) => Obstacle[]) => {
    if (where === 'draw') setDrawObs(change);
    else if (recRef.current) {
      const r = { ...recRef.current, obstacles: change(recRef.current.obstacles ?? []) };
      setRecording(r);
      writeRecording(r);
    }
  };
  const saveSpot = (name: string, kind: ObstacleKind) => {
    if (!pending) return;
    const p = pending;
    putSpots(p.where, (list) => (p.id
      ? list.map((o) => (o.id === p.id ? { ...o, name, kind } : o))
      : [...list, { id: newObstacleId(), lat: p.lat, lng: p.lng, name, kind }]));
    Haptics.selectionAsync();
    setPending(null);
  };
  const removeSpot = () => {
    if (!pending?.id) return;
    const id = pending.id;
    putSpots(pending.where, (list) => list.filter((o) => o.id !== id));
    setPending(null);
  };

  // --- Track Line ---------------------------------------------------------------------
  const [trackSwitch, , setTrackSwitch] = useRememberedToggle(TRACK_LINE_SWITCH_KEY, false);
  // Track Line is Pro; a Free rider's saved switch is kept for when they're on Pro.
  const trackOn = trackSwitch && trackLinePro;
  const trackDays = useTrackDays();
  const trackLines = useMemo(() => (trackOn ? dayLines(trackDays, now) : []), [trackOn, trackDays, now]);
  const switchTrack = (on: boolean) => {
    if (on && !requirePro('track_line')) return;
    setTrackSwitch(on);
    setTrackLineOn(on);
    Haptics.selectionAsync();
  };
  async function clearTrack() {
    if (await confirmAsync(tr('Clear Track Line?'), tr('Every day of your Track Line is deleted from this phone.'), tr('Clear'), tr('Keep It'))) clearTrackLine();
  }

  async function saveMeasure() {
    if (draft.points.length < 2) return;
    if (!requirePro('save_trails')) return;
    const nowIso = new Date().toISOString();
    const t: LocalTrail = {
      id: newTrailId(),
      details: { ...EMPTY_DETAILS, name: 'Custom Trail' },
      points: draft.points.map((p, i) => [p.lat, p.lng, null, i]),
      source: 'drawn',
      obstacles: drawObs,
      photos: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      shared: null,
    };
    await saveLocalTrail(t);
    draft.clear();
    setDrawObs([]);
    router.push(`/nav/trail/${t.id}?fresh=1`);
  }

  // --- Search and the hidden-trail notice -------------------------------------------
  const [searching, setSearching] = useState<LatLng | null | false>(false);
  const [found, setFound] = useState<Place | null>(null);
  const looking = useRef<LatLng | null>(null);
  const hidden = unseenHidden(local)[0] ?? null;

  const progress = followed && me ? followProgress(followed.points, cum, me, hint.current) : null;
  if (progress?.alongM != null) hint.current = progress.alongM;
  // Measuring taps the map, so the camera holds still while the Measure tab is open.
  const camOn = mode !== 'measure' && followCamActive(cam, { recording: !!rec && !rec.paused, following: !!followed, nearTrail: nearFollowedTrail(progress), followMe: followMe.on });
  const followStatus = followMeStatus(followMe.on, cam);
  function tapFollowMe() {
    const act = followMeTap(followStatus);
    if (act === 'turn-off') return followMe.setOn(false);
    if (act === 'turn-on') followMe.setOn(true);
    camEvent('center');
    if (me) map.current?.centerOn(me);
  }
  const rateable = !!followed?.publicTrail && !followed.publicTrail.mine && canRate(lineLengthM(followed.points), followCovered);

  // CarPlay (Pro): with no ride on the car screen, it shows Map Mode's dash while this screen is
  // in front (core/carplay carPlayMapState). A ride in Ride Mode takes the car screen over.
  const carPlayPro = useCan('carplay');
  // The car map (Navigation entitlement; builds without it ignore `map`): the trail you follow and
  // your recording, with "Follow <trail>" guidance. Thinned once per change.
  const carFollowLine = useMemo(() => carMapLine('following', followed?.points, Colors.accent, 5), [followed]);
  const carRecLine = useMemo(() => carMapLine('recorded', recLine, '#F6F1E3', 4.5), [recLine]);
  const carMap = carPlayMapState({
    map: {
      style: mapboxStyleFor(flatLook(trail.look)),
      token: MAPBOX_TOKEN,
      lines: [carFollowLine, carRecLine].filter((l): l is CarMapLine => !!l),
      dots: [],
      guide: followed && progress
        ? carMapGuide({
            name: followed.name,
            points: followed.points,
            onTrail: progress.onTrail,
            remainingM: progress.remainingM ?? 0,
            toStartM: progress.toStartM,
            tripM: trip.distanceM,
            movingS: trip.movingS,
          })
        : null,
    },
    speedMps: speed,
    altitudeM: altitude,
    headingDeg: dashHeading(meHeading, compass),
    tripM: trip.distanceM,
    movingS: trip.movingS,
    followed: followed && progress
      ? { name: followed.name, onTrail: progress.onTrail, remainingM: progress.remainingM ?? 0, toStartM: progress.toStartM }
      : null,
    recording: rec ? { lengthM: recStats?.lengthM ?? 0, paused: rec.paused } : null,
  });
  const carMapKey = JSON.stringify(carMap);
  const carMapOn = carPlayPro && focused && !WEB;
  useEffect(() => {
    if (carMapOn) showMapOnCarPlay(JSON.parse(carMapKey));
  }, [carMapOn, carMapKey]);
  useEffect(() => {
    if (!carMapOn) return;
    return () => clearCarPlayMap();
  }, [carMapOn]);
  // Exit (top left, the Full Map bar, Android back, the car screen): a running recording pauses
  // and is saved first, so ask (core/mode-exit). Following a trail just stops.
  const exitNow = () => {
    if (recRef.current && !recRef.current.paused) pauseRecording(true);
    leaveModeScreen();
  };
  const leave = async () => {
    const p = mapExitPrompt(recRef.current);
    if (p && !(await confirmAsync(p.title, p.message, p.confirm, p.stay))) return;
    exitNow();
  };
  useModeBackButton(() => {
    const b = backPress({ fullMap: full, searching: searching !== false });
    if (b === 'close_full_map') fullMap.exit();
    else if (b === 'close_search') setSearching(false);
    else void leave();
  });

  // Pause, Resume and Exit on the car screen work Map Mode here (the car asks before an exit
  // that pauses a recording).
  const carPause = useRef(pauseRecording);
  const carExit = useRef(exitNow);
  useEffect(() => {
    carPause.current = pauseRecording;
    carExit.current = exitNow;
  });
  useEffect(() => {
    const sub = onCarPlayAction((id) => {
      const a = parseCarPlayAction(id);
      if (a.type === 'record') carPause.current(a.paused);
      else if (a.type === 'exit' && a.mode === 'map') carExit.current();
    });
    return () => sub.remove();
  }, []);
  // Center on Me's corner, with Follow Me just left of it.
  const locatePos = full
    ? { right: 12, bottom: Math.max(insets.bottom, 12) + (wide || floating ? 0 : FULL_MAP_BAR_H + 12) }
    : wide ? { right: 12, bottom: 24 } : { right: 12, bottom: panelH && panelH > 0 ? panelH + 12 : open ? 340 : 180 };
  const musicBottom = locatePos.bottom + (me ? 58 : 0);
  const panelPad: [number, number, number, number] = full ? fullMapPadding(insets.top, insets.bottom) : wide ? [90, 70, 40, PANEL_W + 60] : bottomPanelPadding(panelH, open);
  // The one number the Full Map bar keeps.
  const barValue = ((): [string, string] => {
    if (mode === 'measure') {
      const [v, u] = feetOrMiles(measureLen).split(' ');
      return [v, u];
    }
    if (followed && progress) {
      const [v, u] = feetOrMiles(progress.onTrail ? progress.remainingM ?? 0 : progress.toStartM).split(' ');
      return [v, progress.onTrail ? `${u} Left` : `${u} to Start`];
    }
    return [speed != null ? String(Math.round(speed * MPS_TO_MPH)) : '–', 'mph'];
  })();

  // Map Settings (top left) and the compass (top right) sit level, just under the top bar, or at
  // the top in Full Map (core/map-corner). On a wide tablet the bar is the panel column, so they're at the top.
  const cornerTop = full ? insets.top + 12 : wide ? insets.top + 20 : insets.top + 108; // under the top bar and the Solo tag
  const compassSpot = { top: cornerTop };
  // On a short phone screen with the panel open there may be no room between the top corner and
  // the panel: hide a button rather than draw it over the top bar.
  const musicFits = full || wide || winH - musicBottom - 48 >= cornerTop + 56;
  const locateFits = full || wide || winH - locatePos.bottom - 48 >= cornerTop + 56;
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <CompassSpot.Provider value={compassSpot}>
        <NavMap
          ref={map}
          trail={trail}
          recorded={recLine}
          following={followed?.points ?? null}
          measure={mode === 'measure' ? draft.points : []}
          measureTaps={mode === 'measure' ? draft.taps : []}
          measuring={mode === 'measure'}
          onMeasure={(p, snap) => {
            Haptics.selectionAsync();
            if (marking) {
              setMarking(false);
              markAt(p, 'draw');
            } else draft.add(p, snap);
          }}
          trackLines={trackLines}
          obstacles={mode === 'measure' ? drawObs : rec ? rec.obstacles ?? [] : followed?.obstacles ?? []}
          onObstacle={editSpot}
          center={me}
          found={found}
          onCenter={(c) => (looking.current = c)}
          padding={panelPad}
          followMe={camOn ? me : null}
          meHeading={meHeading}
          meFixAt={meFixAt}
          onUserMove={() => camEvent('pan')}
          waypoints={shownWaypoints}
          onPressWaypoint={openWaypoint}
          onLongPressMap={mode === 'measure' ? undefined : openNewWaypoint}
        />
      </CompassSpot.Provider>
      <TrailMapOverlay
        trail={trail}
        controls
        bare={full}
        top={cornerTop}
        left={wide && !full ? PANEL_W + 32 : undefined}
        cardTop={full ? insets.top + 64 : wide ? insets.top + 118 : undefined}
        bottom={wide ? 12 : open ? 330 : 170}
        cardWidth={wide || floating ? 380 : undefined}
        lookupHint="Tap a line to see what it is. Press and hold to drop a waypoint."
        onFollow={(t) => follow({ name: t.name, points: t.points, publicTrail: t, obstacles: t.obstacles })}
        ridden={(t) => (followed?.publicTrail?.id === t.id ? followCovered : null)}
      />

      {full ? (
        <FullMapBar onRestore={fullMap.exit} wide={wide || floating} onExit={() => void leave()} exitLabel={tr('Exit Map Mode')}>
          {rec && !rec.paused ? (
            <View style={styles.barRec} accessible accessibilityLabel={tr('Recording')}>
              <View style={styles.recDot} />
              <Text style={styles.barRecText}>{tr('Rec')}</Text>
            </View>
          ) : null}
          <BarReadout value={barValue[0]} unit={barValue[1]} />
          {mode === 'measure' ? <BarChip title={tr('Undo')} label={tr('Undo the last point')} disabled={!draft.taps.length} onPress={draft.undo} /> : null}
        </FullMapBar>
      ) : null}

      {full ? null : (
      <SafeAreaView edges={['top']} style={[styles.top, wide && styles.topWide]} pointerEvents="box-none">
        {searching !== false ? (
          <MapSearch
            near={searching}
            onPick={(p) => {
              // Looking at a place: stop following so the map stays on it.
              camEvent('pan');
              setFound(p);
            }}
            onClose={() => setSearching(false)}
          />
        ) : (
          <View style={styles.topRow}>
            <ExitModeButton onPress={() => void leave()} label={tr('Exit Map Mode')} />
            <Text style={[styles.topText, styles.flex]} numberOfLines={1} accessibilityRole="header">{tr('Map Mode')}</Text>
            <Pressable onPress={() => router.push('/nav/trails')} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}>
              <Text style={styles.chipText}>{tr('My Trails{v}', { v: local.length ? ` ${local.length}` : '' })}</Text>
            </Pressable>
            <Pressable
              onPress={() => setSearching(looking.current ?? me)}
              accessibilityRole="button"
              accessibilityLabel={tr('Search the Map for a Place')}
              hitSlop={8}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}>
              <Icon name="search" size={17} color={Colors.text} />
            </Pressable>
          </View>
        )}
        {searching === false ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Solo. Only you see this map. Tap to learn more')}
            onPress={() => showNotice(tr('Riding Solo'), tr('Map Mode is just you: nobody sees where you are. To ride with others, tap Make It a Group Ride and invite them with a code.'))}
            style={({ pressed }) => [styles.solo, pressed && { opacity: 0.85 }]}>
            <Icon name="person" size={15} color={Colors.text} strokeWidth={2.2} />
            <Text style={styles.soloText}>{tr('Solo. Only you see this')}</Text>
            {rec && !rec.paused ? <View style={[styles.recDot, { marginLeft: 4 }]} /> : null}
            {rec && !rec.paused ? <Text style={styles.soloText}>{tr('Recording')}</Text> : null}
          </Pressable>
        ) : null}
        {hidden && searching === false ? (
          <View style={styles.notice} accessibilityRole="alert">
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.noticeTitle}>{tr('{name} Is Hidden', { name: hidden.details.name })}</Text>
              <Text style={styles.noticeText}>
                {hidden.shared?.hiddenReason === 'admin'
                  ? tr('It was taken off the public map. It’s still saved on this phone.')
                  : tr('Riders rated its line inaccurate, so other riders can’t see it. It’s still saved on this phone. Re-record it and share again.')}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => markHiddenSeen(hidden).catch(() => {})} hitSlop={8} style={styles.noticeOk}>
              <Text style={styles.chipText}>OK</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
      )}

      {me && mode !== 'measure' && locateFits ? (
        <FollowMeButton status={followStatus} onPress={tapFollowMe} compact={full} style={[locatePos, { right: locatePos.right + 56 }]} />
      ) : null}
      {musicOn && musicFits ? (
        <MusicButton onPress={() => setMusicOpen(true)} style={[styles.music, { bottom: musicBottom }]} />
      ) : null}
      {musicOn ? <MusicSheet visible={musicOpen} tablet={wide} onClose={() => setMusicOpen(false)} /> : null}

      {me && locateFits ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Center on me')}
          accessibilityHint={followMe.on ? tr('Centers the map on you and follows you again') : tr('Centers the map on you')}
          onPress={() => {
            camEvent('center');
            map.current?.centerOn(me);
          }}
          style={({ pressed }) => [styles.locate, locatePos, pressed && { opacity: 0.8 }]}>
          <Icon name="locate" size={22} color={Colors.text} />
        </Pressable>
      ) : null}

      {full ? null : (
      <Animated.View
        {...fold.panHandlers}
        onLayout={(e) => {
          const h = wide || floating ? undefined : e.nativeEvent.layout.height;
          setPanelH((old) => (old === h ? old : h));
        }}
        style={[styles.panel, wide && [styles.panelWide, { top: Math.max(88, insets.top + 72) }], floating && styles.panelFloating, { transform: [{ translateY: fold.drag }] }]}>
        <SafeAreaView edges={wide || floating ? [] : ['bottom']} style={[styles.panelInner, !open && { gap: 6 }]}>
          <PanelHandle open={open} onToggle={() => fold.setOpen(!open)} what="Navigation Tools" fromTop={wide} onFullMap={fullMap.enter} />
          <ModeTabs mode={mode} onChange={changeMode} recording={!!rec} />
          {mapTimeText ? (
            <Text style={styles.mapTime} accessibilityLiveRegion="polite" onPress={() => showProGate({ kind: 'pro_required', feature: 'map_mode' })}>
              {tr('Free Map Mode: {mapTimeText}', { mapTimeText })}
            </Text>
          ) : null}

          {mode === 'explore' ? (
            <ExplorePanel
              open={open}
              followed={followed}
              progress={progress}
              speed={speed}
              altitude={altitude}
              heading={dashHeading(meHeading, compass)}
              trip={trip}
              onResetTrip={resetTrip}
              noLocation={noLocation}
              rateable={rateable}
              onRate={() => followed?.publicTrail && trail.pick(followed.publicTrail)}
              onStop={() => setFollowed(null)}
              onMyTrails={() => router.push('/nav/trails')}
              trackOn={trackOn}
              onTrack={switchTrack}
              onClearTrack={clearTrack}
              hasTrack={Object.keys(trackDays).length > 0}
            />
          ) : mode === 'record' ? (
            <RecordPanel
              open={open}
              rec={rec}
              stats={recStats}
              elapsed={rec ? (rec.paused ? (rec.points.length > 1 ? (rec.points[rec.points.length - 1][3] - rec.startedAt) / 1000 : 0) : (now - rec.startedAt) / 1000) : 0}
              noLocation={noLocation}
              onStart={startRecording}
              onPause={pauseRecording}
              onFinish={finishRecording}
              onDiscard={discard}
              spots={rec?.obstacles?.length ?? 0}
              onMark={me ? () => markAt(me, 'rec') : null}
            />
          ) : (
            <MeasurePanel
              open={open}
              lengthM={measureLen}
              taps={draft.taps.length}
              fromMeM={me && lastTap ? distanceM(me, lastTap) : null}
              finding={draft.finding}
              follows={follows}
              onFollows={setFollows}
              onUndo={draft.undo}
              onClear={() => {
                draft.clear();
                setDrawObs([]);
              }}
              onSave={saveMeasure}
              spots={drawObs.length}
              marking={marking}
              onMark={() => (marking || requirePro('trail_spots')) && setMarking(!marking)}
            />
          )}
          {open && mode !== 'measure' ? (
            <GroupRideCard detail={tr(groupRideDetail({ recording: !!rec && rec.points.length >= 2, following: followed?.name ?? null }))} onPress={makeGroupRide} />
          ) : null}
        </SafeAreaView>
      </Animated.View>
      )}

      <CustomTrailIntro
        visible={intro}
        rules={rules}
        onClose={() => setIntro(false)}
        onStart={(skip) => {
          setIntro(false);
          if (skip) setSyncedItem(CUSTOM_TRAIL_INTRO_KEY, '1').catch(() => {});
        }}
      />
      <ObstacleSheet
        visible={!!pending}
        initial={{ name: pending?.name ?? '', kind: pending?.kind ?? 'obstacle' }}
        editing={!!pending?.id}
        onSave={saveSpot}
        onRemove={removeSpot}
        onClose={() => setPending(null)}
      />
      <WaypointSheet
        rideId={wpOnRide && groupRide.rideId ? groupRide.rideId : undefined}
        target={wpTarget}
        existing={wpOnRide ? groupRide.wp.waypoints : mapWaypoints}
        me={groupRide.me}
        canShare={wpOnRide && groupRide.canShare}
        stopsOn={groupRide.wp.stopsSwitchedOn}
        ownerName={groupRide.nameOf}
        onNavigate={(lat, lng, title = 'There') => openDirections({ title, to: { lat, lng } })}
        onChanged={(c) => wpOnRide && groupRide.wp.apply(c)}
        onClose={() => setWpTarget(null)}
      />
    </View>
  );
}

/** Make It a Group Ride: the blue card at the bottom of Map Mode's panel (Pro; Free riders see the Pro tag). */
function GroupRideCard({ detail, onPress }: { detail: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tr('Make It a Group Ride')}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.groupRide, pressed && { opacity: 0.9 }]}>
      <View style={styles.groupRideIcon}>
        <Icon name="people" size={20} color="#fff" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.groupRideTitle} numberOfLines={1}>{tr('Make It a Group Ride')}</Text>
        <Text style={styles.groupRideText} numberOfLines={2}>{detail}</Text>
      </View>
      <ProTag feature="trail_rides" />
    </Pressable>
  );
}

function ModeTabs({ mode, onChange, recording }: { mode: Mode; onChange: (m: Mode) => void; recording: boolean }) {
  const tabs: { value: Mode; label: string }[] = [
    { value: 'explore', label: tr('Explore') },
    { value: 'record', label: tr('Record') },
    { value: 'measure', label: tr('Draw') },
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.value === mode;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(t.value);
            }}
            style={[styles.tab, on && styles.tabOn]}>
            {t.value === 'record' && recording ? <View style={styles.recDot} /> : null}
            <Text style={[styles.tabText, on && { color: Colors.text }]}>{tr(t.label)}</Text>
            {t.value === 'measure' ? <ProTag feature="custom_trails" style={{ marginLeft: 6 }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One big number with its unit and a small label, like a gauge on a dash. */
function Gauge({ value, unit, label, big, small, inCell }: { value: string; unit?: string; label: string; big?: boolean; small?: boolean; inCell?: boolean }) {
  return (
    <View style={[styles.gauge, small && !inCell && styles.dashCell]} accessible accessibilityLabel={`${label} ${value} ${unit ?? ''}`}>
      <Text style={[styles.gaugeValue, big && styles.gaugeBig, small && styles.gaugeSmall]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={[styles.gaugeUnit, small && styles.gaugeUnitSmall]}> {unit}</Text> : null}
      </Text>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  );
}

function ExplorePanel({
  open, followed, progress, speed, altitude, heading, trip, onResetTrip, noLocation, rateable, onRate, onStop, onMyTrails, trackOn, onTrack, onClearTrack, hasTrack,
}: {
  open: boolean;
  followed: Followed | null;
  progress: ReturnType<typeof followProgress>;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
  trip: TripMeter;
  onResetTrip: () => void;
  noLocation: boolean;
  rateable: boolean;
  onRate: () => void;
  onStop: () => void;
  onMyTrails: () => void;
  trackOn: boolean;
  onTrack: (on: boolean) => void;
  onClearTrack: () => void;
  hasTrack: boolean;
}) {
  // The sentence around the colored words, split so the words can sit wherever the language puts them.
  const mintHint = tr('{mint} are trails other riders mapped and shared.', { mint: '\u0000' }).split('\u0000');
  const mph = speed != null ? String(Math.round(speed * MPS_TO_MPH)) : '–';
  const elev = altitude != null ? feet(altitude)!.replace(' ft', '') : '–';
  const [hdg, deg] = headingReadout(heading);
  const [tripV, tripU] = feetOrMiles(trip.distanceM).split(' ');
  const [movV, movU] = movingReadout(trip.movingS);
  const following = !!(followed && progress);
  // The Tilt tile under the dash (phones and tablets; the website has no motion sensors).
  const tiltSettings = useTiltSettings();
  const tiltOn = Platform.OS !== 'web' && tiltSettings.show;
  const tilt = useTilt(tiltSettings, tiltOn);
  return (
    <>
      {followed ? (
        <View style={styles.follow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.followLabel}>{followed.publicTrail && !followed.publicTrail.mine ? tr('Following a Rider Trail') : tr('Following')}</Text>
            <Text style={styles.followName} numberOfLines={1}>{followed.name}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onStop} hitSlop={8} style={styles.smallBtn}>
            <Text style={styles.chipText}>{tr('Stop')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.gauges}>
        {followed && progress ? (
          progress.onTrail ? (
            <Gauge big value={feetOrMiles(progress.remainingM ?? 0).split(' ')[0]} unit={feetOrMiles(progress.remainingM ?? 0).split(' ')[1]} label={tr('Left on Trail')} />
          ) : (
            <Gauge big value={feetOrMiles(progress.toStartM).split(' ')[0]} unit={feetOrMiles(progress.toStartM).split(' ')[1]} label={progress.offTrailM < progress.toStartM ? tr('Off Trail by {v}', { v: feetOrMiles(progress.offTrailM) }) : tr('To the Start')} />
          )
        ) : (
          <Gauge big value={mph} unit="mph" label={tr('Speed')} />
        )}
        {/* The dash: a 2 by 2 grid filling the rest of the row. */}
        <View style={styles.dash}>
          {following ? <Gauge small value={mph} unit="mph" label={tr('Speed')} /> : <Gauge small value={elev} unit="ft" label={tr('Elevation')} />}
          {following ? <Gauge small value={elev} unit="ft" label={tr('Elevation')} /> : <Gauge small value={hdg} unit={deg} label={tr('Heading')} />}
          <Pressable
            onLongPress={onResetTrip}
            delayLongPress={600}
            accessibilityRole="button"
            accessibilityLabel={tr('Trip {tripV} {tripU}', { tripV, tripU })}
            accessibilityHint={tr('Press and hold to reset the trip')}
            accessibilityActions={[{ name: 'longpress', label: tr('Reset Trip') }]}
            onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onResetTrip()}
            style={styles.dashCell}>
            <Gauge small inCell value={tripV} unit={tripU} label={tr('Trip')} />
          </Pressable>
          {following ? <Gauge small value={hdg} unit={deg} label={tr('Heading')} /> : <Gauge small value={movV} unit={movU} label={tr('Moving')} />}
        </View>
      </View>
      {tiltOn ? <TiltTile bar reading={tilt} limits={tiltSettings.limits} /> : null}
      {open ? (
        noLocation ? (
          <Text style={styles.hint}>{tr('Location is off for OnMyLead, so the map can’t show where you are. Turn it on in Settings to record and follow trails.')}</Text>
        ) : rateable ? (
          <Pressable accessibilityRole="button" onPress={onRate} style={({ pressed }) => [styles.rateCta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.rateText}>{tr('You’ve Ridden This Trail. Rate It')}</Text>
          </Pressable>
        ) : !followed ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.hint}>
              {tr('Tap any line to see what it is.')}{' '}
              {mintHint[0]}<Text style={{ color: RIDER_TRAIL_INK }}>{tr('Mint dotted lines')}</Text>{mintHint[1]}
            </Text>
            <Pressable accessibilityRole="button" onPress={onMyTrails} style={({ pressed }) => [styles.wideBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.wideBtnText}>{tr('My Trails')}</Text>
              <Icon name="chevron" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ) : null
      ) : null}
      {open ? (
        <View style={styles.track}>
          <Icon name="trackLine" size={22} color={trackOn ? TRACK_DAY_COLORS[0] : Colors.textSecondary} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.wideBtnText}>{tr('Track Line')}</Text>
              <ProTag feature="track_line" style={{ alignSelf: 'auto' }} />
            </View>
            <View style={styles.days}>
              {(['Today', 'Yesterday', 'Older'] as const).map((label, i) => (
                <View key={label} style={styles.day}>
                  <View style={[styles.dayLine, { backgroundColor: TRACK_DAY_COLORS[i] }]} />
                  <Text style={styles.dayText}>{tr(label)}</Text>
                </View>
              ))}
              {hasTrack ? (
                <Pressable accessibilityRole="button" accessibilityLabel={tr('Clear Track Line')} hitSlop={8} onPress={onClearTrack}>
                  <Text style={[styles.dayText, { color: Colors.sky }]}>{tr('Clear')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Switch
            value={trackOn}
            onValueChange={onTrack}
            accessibilityLabel={tr('Track Line. Draws where you\'ve been, a new colour each day. Kept on this phone only')}
            trackColor={{ true: Colors.sky, false: Colors.backgroundSelected }}
            thumbColor="#fff"
          />
        </View>
      ) : null}
    </>
  );
}

function RecordPanel({
  open, rec, stats, elapsed, noLocation, onStart, onPause, onFinish, onDiscard, spots, onMark,
}: {
  open: boolean;
  rec: Recording | null;
  stats: ReturnType<typeof trackStats> | null;
  elapsed: number;
  noLocation: boolean;
  onStart: () => void;
  onPause: (paused: boolean) => void;
  onFinish: () => void;
  onDiscard: () => void;
  spots: number;
  /** Name the spot where the rider is now; null without a fix. */
  onMark: (() => void) | null;
}) {
  if (!rec) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Start recording a trail')}
          disabled={noLocation || WEB}
          onPress={onStart}
          style={({ pressed }) => [styles.recBtn, (noLocation || WEB) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }]}>
          <Svg width={30} height={30} viewBox="0 0 30 30">
            <Circle cx={15} cy={15} r={13} stroke="#fff" strokeWidth={2.5} fill="none" />
            <Circle cx={15} cy={15} r={7} fill="#fff" />
          </Svg>
          <Text style={styles.recText}>{tr('Record a Trail')}</Text>
          <ProTag feature="record_trails" />
        </Pressable>
        {open ? (
          <Text style={styles.hint}>
            {WEB
              ? tr('Recording works in the OnMyLead app on your phone or tablet. Here you can measure, plan and look at trails.')
              : noLocation
                ? tr('Turn on location for OnMyLead in Settings to record.')
                : tr('Ride and OnMyLead draws your line. It stays on this phone unless you share it. Keep Map Mode open: the screen stays on while recording.')}
          </Text>
        ) : null}
      </>
    );
  }
  const len = feetOrMiles(stats?.lengthM ?? 0).split(' ');
  return (
    <>
      <View style={styles.recHead}>
        <View style={[styles.recDot, rec.paused && { backgroundColor: Colors.textSecondary }]} />
        <Text style={styles.recState}>{rec.paused ? tr('Paused') : tr('Recording')}</Text>
        {!rec.paused && rec.points.length < 2 ? <ActivityIndicator size="small" color={RECORD_INK} /> : null}
      </View>
      <View style={styles.gauges}>
        <Gauge big value={len[0]} unit={len[1]} label={tr('Distance')} />
        <Gauge value={clock(elapsed)} label={tr('Time')} />
        <Gauge value={stats?.gainM != null ? feet(stats.gainM)!.replace(' ft', '') : '–'} unit="ft" label={tr('Climb')} />
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => onPause(!rec.paused)} style={({ pressed }) => [styles.ctl, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctlText}>{rec.paused ? tr('Resume') : tr('Pause')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onFinish} style={({ pressed }) => [styles.ctl, styles.ctlMain, pressed && { opacity: 0.85 }]}>
          <Text style={[styles.ctlText, { color: Colors.background }]}>{tr('Finish and Save')}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('Mark a spot here, like a ledge or water crossing')}
        disabled={!onMark}
        onPress={() => onMark?.()}
        style={({ pressed }) => [styles.wideBtn, !onMark && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.wideBtnText}>{tr('Mark a Spot Here')}</Text>
          <ProTag feature="trail_spots" style={{ alignSelf: 'auto' }} />
        </View>
        <Text style={styles.dayText}>{spots ? `${spots} marked` : tr('Ledges, crossings, views')}</Text>
      </Pressable>
      {open ? (
        <Pressable accessibilityRole="button" onPress={onDiscard} hitSlop={6} style={{ alignSelf: 'center', padding: 4 }}>
          <Text style={styles.discard}>{tr('Discard Recording')}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function MeasurePanel({
  open, lengthM, taps, fromMeM, finding, follows, onFollows, onUndo, onClear, onSave, spots, marking, onMark,
}: {
  open: boolean;
  lengthM: number;
  taps: number;
  fromMeM: number | null;
  finding: boolean;
  follows: boolean;
  onFollows: (on: boolean) => void;
  onUndo: () => void;
  onClear: () => void;
  onSave: () => void;
  spots: number;
  marking: boolean;
  onMark: () => void;
}) {
  const len = feetOrMiles(lengthM).split(' ');
  return (
    <>
      <View style={styles.gauges}>
        <Gauge big value={taps > 1 ? len[0] : '0'} unit={taps > 1 ? len[1] : 'mi'} label={follows ? tr('Along the Trails') : tr('Straight Line')} />
        <Gauge value={fromMeM != null ? feetOrMiles(fromMeM) : '–'} label={tr('You to Last Point')} />
      </View>
      {open ? (
        <>
          <View style={styles.tabs} accessibilityRole="radiogroup" accessibilityLabel={tr('How the distance finder joins points')}>
            {[{ on: true, label: tr('Follow Trails') }, { on: false, label: tr('Straight Line') }].map((o) => (
              <Pressable key={o.label} accessibilityRole="radio" accessibilityState={{ selected: follows === o.on }} onPress={() => onFollows(o.on)} style={[styles.tab, follows === o.on && styles.tabOn]}>
                <Text style={[styles.tabText, follows === o.on && { color: Colors.text }]}>{tr(o.label)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.hintRow}>
            {finding ? <ActivityIndicator size="small" color={SAND} /> : null}
            <Text style={[styles.hint, { flex: 1 }]}>
              {marking ? tr('{v} the map where the spot is.', { v: WEB ? 'Click' : 'Tap' }) : finding ? tr('Finding the trail…') : taps === 0 ? tr('{v} the map where you want to measure from.', { v: WEB ? 'Click' : 'Tap' }) : taps === 1 ? tr('Now {v} where you want to measure to.', { v: WEB ? 'click' : 'tap' }) : tr('Add more points, mark spots, or save it as a custom trail.')}
            </Text>
          </View>
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: marking }}
        accessibilityLabel={marking ? tr('Cancel marking a spot') : tr('Mark a spot on the trail, like a ledge or water crossing')}
        onPress={onMark}
        style={({ pressed }) => [styles.wideBtn, marking && { borderWidth: 1.5, borderColor: SAND }, pressed && { opacity: 0.85 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.wideBtnText}>{marking ? tr('Cancel Marking') : tr('Mark a Spot')}</Text>
          <ProTag feature="trail_spots" style={{ alignSelf: 'auto' }} />
        </View>
        <Text style={styles.dayText}>{spots ? `${spots} marked` : tr('Ledges, crossings, views')}</Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!taps} onPress={onUndo} style={({ pressed }) => [styles.ctl, !taps && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctlText}>{tr('Undo')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!taps} onPress={onClear} style={({ pressed }) => [styles.ctl, !taps && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctlText}>{tr('Clear')}</Text>
        </Pressable>
        {open ? (
          <Pressable accessibilityRole="button" disabled={taps < 2 || finding} onPress={onSave} style={({ pressed }) => [styles.ctl, { flexGrow: 1.5 }, (taps < 2 || finding) && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctlText}>{tr('Save Trail')}</Text>
            <ProTag feature="save_trails" />
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const glass = GlassSurface;

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.two, gap: Spacing.two, zIndex: 30 },
  topWide: { right: 'auto', width: PANEL_W + Spacing.two * 2, padding: 20, paddingBottom: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, ...GlassSurface, borderRadius: 20, paddingLeft: 8, paddingRight: 14, minHeight: 50 },
  topText: { color: Colors.text, fontSize: 20, fontFamily: font(700, 'display') },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  chipText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  // "Solo. Only you see this": Map Mode is just you (3.0).
  solo: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', height: 34, paddingHorizontal: 12, borderRadius: Radius.pill, ...GlassSurface },
  soloText: { color: Colors.text, fontFamily: font(600), fontSize: 13.5 },
  groupRide: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: MAP_BLUE,
    boxShadow: 'inset 0px 1px 0px rgba(255, 255, 255, 0.2)',
  },
  groupRideIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  groupRideTitle: { color: '#fff', fontFamily: font(700), fontSize: 16 },
  groupRideText: { color: 'rgba(255,255,255,0.85)', fontFamily: font(500), fontSize: 12.5, lineHeight: 16 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.card, ...glass, borderColor: RIDER_TRAIL_INK },
  noticeTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  noticeText: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  noticeOk: { paddingHorizontal: 14, height: 36, borderRadius: Radius.pill, justifyContent: 'center', backgroundColor: Glass.tile },
  music: { position: 'absolute', right: 12, zIndex: 15 },
  locate: { position: 'absolute', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', zIndex: 15, ...glass },
  panel: { position: 'absolute', bottom: 0, left: 0, right: 0, ...GlassSurface, borderBottomWidth: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, zIndex: 20 },
  panelWide: { bottom: 'auto', left: 20, right: 'auto', width: PANEL_W, borderRadius: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' },
  panelFloating: { left: 12, right: 'auto', bottom: 12, width: PANEL_W, borderRadius: 24, borderWidth: 1 },
  panelInner: { padding: Spacing.three, paddingTop: 4, gap: 12 },
  tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: Radius.control, backgroundColor: 'rgba(0,0,0,0.22)' },
  tab: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 42, borderRadius: Radius.control - 4, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  tabText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 15 },
  gauges: { flexDirection: 'row', alignItems: 'flex-end', gap: 18 },
  gauge: { flexShrink: 1, gap: 0 },
  gaugeValue: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 30, lineHeight: 34 },
  gaugeBig: { fontSize: 52, lineHeight: 54 },
  gaugeSmall: { fontSize: 22, lineHeight: 26 },
  gaugeUnitSmall: { fontSize: 14 },
  dash: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 12, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: Glass.edge, alignSelf: 'stretch', alignContent: 'center' },
  dashCell: { width: '45%', flexGrow: 1 },
  gaugeUnit: { color: Colors.textSecondary, fontFamily: font(700, 'display'), fontSize: 20 },
  gaugeLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: Colors.accent },
  followLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  followName: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22 },
  smallBtn: { paddingHorizontal: 14, height: 36, borderRadius: Radius.pill, justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  hint: { color: Colors.text, fontFamily: font(500), fontSize: 15, lineHeight: 21 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wideBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  wideBtnText: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  rateCta: { minHeight: 50, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: RIDER_TRAIL_INK },
  rateText: { color: Colors.background, fontFamily: font(700), fontSize: 16 },
  recBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 68, borderRadius: 18, backgroundColor: Colors.accent },
  recText: { color: '#fff', fontFamily: font(800, 'display'), fontSize: 26 },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barRec: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barRecText: { color: RideColors.red, fontFamily: font(800), fontSize: 14 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: RideColors.red },
  recState: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  row: { flexDirection: 'row', gap: Spacing.two },
  mapTime: { color: Colors.gold, fontFamily: font(700), fontSize: 13, textAlign: 'center' },
  ctl: { flex: 1, minHeight: 50, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  ctlMain: { flexGrow: 1.6, backgroundColor: RECORD_INK, borderColor: RECORD_INK },
  ctlText: { color: Colors.text, fontFamily: font(700), fontSize: 16 },
  discard: { color: Colors.danger, fontFamily: font(600), fontSize: 14 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  days: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayLine: { width: 14, height: 3, borderRadius: 2 },
  dayText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12 },
}));
