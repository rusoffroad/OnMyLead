import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Colors, font, Glass, GlassSurface, Radius, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { difficultyColor, difficultyLabel, feetOrMiles, mappedBy, RIDER_TRAIL_INK, vehicleLabel, type PublicTrail } from '@/core/nav-trails';
import { formatBytes, IMAGERY_ATTRIBUTION, statusLine, type OfflineChoice } from '@/core/offline-maps';
import { OSM_ATTRIBUTION } from '@/core/osm-trails';
import { PARK_LEVEL_COLORS, PARK_LEVEL_LEGEND, PARK_TRAILS_ATTRIBUTION, parkLevelLabel, parkTrailColor, parkTrailLength, type ParkTrail } from '@/core/park-trails';
import {
  FEATURE_GROUPS, FEATURE_INK, featuresChanged, MAP_FEATURES, QUICK_LAYERS, quickLayerOn, quickLayerToggle, type MapFeature, type MapFeatureId, type QuickLayer,
} from '@/core/map-features';
import { TOPO_ATTRIBUTION, TRAIL_INK, type BaseMap, type LandInfo, type TrailInfo } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { downloadRide, pauseDownload, planRide, resumeDownload, rideDownload, useOfflineMaps } from '@/lib/offline-maps';
import { can, type FeatureKey } from '@/core/entitlements';
import { currentEntitlements, PRO_PROMPT_WAITS_FOR_DISMISS, requirePro, useCan } from '@/lib/pro';
import { RateTrailSheet } from './rate-trail-sheet';
import { RigFitLine, TrailWidthRow } from './trail-width-row';
import { inches } from '@/core/trail-width';
import { useGarageWidths } from '@/lib/trail-width';
import { StarScore } from './stars';
import { ProTag } from '@/components/pro-tag';
import { tracklineInk } from './leader-trackline-ink';
import { SheetRoot, SheetScroll, SwipeSheet } from './swipe-sheet';
import { useLayout } from '@/hooks/use-layout';
import { withAlpha } from '@/core/color';
import { useFollowMePref } from '@/hooks/use-follow-me';
import { useEdgeZoomPref } from '@/hooks/use-edge-zoom';
import { useDotSizePref, useDotStylePref } from '@/hooks/use-dot-size';
import { DOT_SIZE_NAME, DOT_SIZES } from '@/core/dot-size';
import { DOT_STYLE_INK, DOT_STYLE_NAME, DOT_STYLES } from '@/core/own-dot-art';
import { DotSample } from './own-dot';
import { useIntersectionZoomPref } from '@/hooks/use-intersection-zoom';
import { useMusicControlsSetting } from '@/hooks/use-music-controls';
import { useFlag } from '@/lib/app-settings';
import { musicAvailable } from '@/lib/music';
import { setTiltShown, useTiltSettings } from '@/lib/tilt';

import { t as tr } from '@/lib/i18n';
import { SheetModal } from '@/components/sheet-modal';
const SAND = '#ECCD91';
const WEB = Platform.OS === 'web';

/**
 * Everything drawn over a map for the trails feature: the layers button and its panel (with the
 * agencies' credit), and the card for a tapped trail. Place it as a sibling after the MapView.
 * `top`, `cardTop` and `bottom` keep it clear of each screen's own header and panels; `ride` with
 * its `route` adds a one-tap download of the ride's map for riding with no signal (apps only: the
 * website draws the same layers with Leaflet but can't save maps).
 */
export function TrailMapOverlay({
  trail, top = 12, cardTop, bottom = 12, route, ride, lookupHint = 'Tap a line to see who can ride it.', cardWidth, onFollow, ridden, bare = false, controls = false, trackline,
}: {
  trail: TrailMap;
  /** Where the layers button sits. */
  top?: number;
  /** Show a tapped trail's card at this distance from the top instead of at the bottom. */
  cardTop?: number;
  bottom?: number;
  route?: LatLng[] | null;
  ride?: { id: string; name: string } | null;
  lookupHint?: string;
  /** On a tablet the trail card sits on the right at this width, clear of the panels on the left. */
  cardWidth?: number;
  /** Map Mode follows a tapped rider trail itself; elsewhere Navigate opens Map Mode on it. */
  onFollow?: (t: PublicTrail) => void;
  /** Meters of a rider trail covered in Map Mode (for the rating sheet). */
  ridden?: (t: PublicTrail) => number | null;
  /** Full Map: no Map Settings button or zoom hint, just the No Signal tag and a tapped trail's card. */
  bare?: boolean;
  /** Ride Mode and Map Mode: Map Settings also shows the switches for the buttons on the map (Tilt Meter, Music and so on). */
  controls?: boolean;
  /** Ride Mode, for the leader (and organizers): the Leader Trackline switch for the whole ride. */
  trackline?: TracklineSwitch;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<PublicTrail | null>(null);
  const osmOn = (['highways', 'roads', 'dirtRoads', 'offroad', 'hiking', 'closed'] as MapFeatureId[]).some((id) => trail.features[id]);
  const credit = [
    trail.base === 'topo' ? TOPO_ATTRIBUTION : trail.offline ? IMAGERY_ATTRIBUTION : null,
    ...trail.agencyLayers.map((a) => a.attribution),
    osmOn ? OSM_ATTRIBUTION : trail.parkTrailsOn ? PARK_TRAILS_ATTRIBUTION : null,
  ]
    .filter(Boolean)
    .join(', ');
  // A small dot on the Map Settings button says the map isn't showing the standard set.
  // A Free rider's map shows only the free features (the rest read as off), so only those count.
  const layersPro = useCan('map_layers');
  const changed = trail.base !== 'satellite' || featuresChanged(trail.features, layersPro ? undefined : FREE_FEATURES);

  return (
    <>
      <View pointerEvents="box-none" style={[styles.corner, { top }]}>
        {bare ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Map Settings')}
            accessibilityHint={tr('Map style, roads, trails, land and the buttons on the map')}
            accessibilityState={{ expanded: open }}
            hitSlop={6}
            onPress={() => setOpen(true)}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
            <SettingsIcon color={Colors.text} />
            {changed ? <View style={styles.fabDot} /> : null}
          </Pressable>
        )}
        {trail.offline ? (
          <View style={styles.offline} accessible accessibilityLabel={tr('No signal. The map is showing what\'s downloaded on this phone.')}>
            <Text style={styles.offlineText}>{tr('No Signal')}</Text>
            <Text style={styles.offlineSub}>{tr('Downloaded Map')}</Text>
          </View>
        ) : null}
      </View>
      {bare ? null : (
        <MapSettingsSheet
          visible={open}
          onClose={() => setOpen(false)}
          trail={trail}
          route={route}
          ride={ride}
          lookupHint={lookupHint}
          credit={credit}
          trackline={trackline}
          controls={controls}
        />
      )}

      {(trail.zoomInHint || trail.closerForTracks) && !bare ? (
        <View pointerEvents="none" style={[styles.hint, { top: top + 6 }]}>
          <Text style={styles.hintText}>{trail.zoomInHint ? tr('Zoom In to See Trails') : tr('Zoom In for Park and Local Trails')}</Text>
        </View>
      ) : null}

      {(
        <View pointerEvents="box-none" style={[styles.bottom, cardTop != null ? { top: cardTop } : { bottom }, cardWidth ? { left: 'auto', width: cardWidth } : null]}>
          {trail.looking ? (
            <View style={styles.looking}>
              <ActivityIndicator color={SAND} size="small" />
              <Text style={styles.lookingText}>{tr('Checking that trail')}</Text>
            </View>
          ) : trail.picked ? (
            <RiderTrailCard
              t={trail.picked}
              onClose={() => trail.pick(null)}
              onRate={() => requirePro('rate_trails') && setRating(trail.picked)}
              onFollow={() => (onFollow ? onFollow(trail.picked!) : router.push(`/nav?follow=${trail.picked!.id}`))}
            />
          ) : trail.pickedPark ? (
            <ParkTrailCard t={trail.pickedPark} onClose={() => trail.pickPark(null)} />
          ) : trail.info ? (
            <TrailCard info={trail.info} onClose={trail.clearInfo} />
          ) : trail.land ? (
            <LandCard land={trail.land} onClose={trail.clearLand} />
          ) : null}
        </View>
      )}
      <RateTrailSheet
        trail={rating}
        ridden={rating ? ridden?.(rating) : null}
        onClose={() => setRating(null)}
        onRated={(status) => {
          trail.reloadRiderTrails();
          if (status === 'hidden') trail.pick(null);
        }}
      />
    </>
  );
}

const FREE_FEATURES: MapFeatureId[] = ['riderTrails', 'parkTrails'];

/**
 * The Pro check for controls inside Map Settings. The sheet is a Modal, and iPhone won't show the
 * Pro prompt (another Modal) over it, so a Free rider's tap closes the sheet and then opens the prompt.
 */
const SheetPro = createContext<(feature: FeatureKey) => boolean>(requirePro);

/**
 * Map Settings (2.1): everything about the map in one sheet, opened from the Map Settings button. The map
 * style as three pictures (Satellite, Topo, 3D Terrain), four big switches for what riders think in
 * (Streets and Roads, Off-Road Trails, Hiking Trails, Land Boundaries), every Map Feature for
 * fine-tuning, the leader's Leader Trackline, and on the riding maps the switches for the buttons on
 * the map. It slides up from the bottom on a phone and docks on the right of a tablet in landscape,
 * with a light dim so the map shows each change as it's made.
 */
function MapSettingsSheet({
  visible, onClose, trail, route, ride, lookupHint, credit, trackline, controls,
}: {
  visible: boolean;
  onClose: () => void;
  trail: TrailMap;
  route?: LatLng[] | null;
  ride?: { id: string; name: string } | null;
  lookupHint: string;
  credit: string;
  trackline?: TracklineSwitch;
  controls: boolean;
}) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const [every, setEvery] = useState(false);
  // A tablet in landscape (or a wide window) keeps the map in view: the sheet docks on the right.
  const side = layout.wide && layout.landscape;
  const bases: BaseMap[] = trail.terrainAvailable ? ['satellite', 'topo', 'terrain'] : ['satellite', 'topo'];
  const pendingPro = useRef<FeatureKey | null>(null);
  const proLater = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Leaving the screen drops a Pro prompt still waiting, so it can't pop up somewhere else.
  useEffect(() => () => clearTimeout(proLater.current), []);
  const pro = useCallback((feature: FeatureKey) => {
    if (can(currentEntitlements(), feature)) return true;
    onClose();
    if (PRO_PROMPT_WAITS_FOR_DISMISS) {
      pendingPro.current = feature;
      // In case the close never reports back (onDismiss), ask just after it would have finished.
      clearTimeout(proLater.current);
      proLater.current = setTimeout(() => {
        if (pendingPro.current !== feature) return;
        pendingPro.current = null;
        requirePro(feature);
      }, 1500);
    } else requirePro(feature);
    return false;
  }, [onClose]);
  const dismissed = () => {
    const feature = pendingPro.current;
    pendingPro.current = null;
    if (feature) requirePro(feature);
  };
  return (
    <SheetPro.Provider value={pro}>
    <SheetModal visible={visible} transparent animationType={side ? 'fade' : 'slide'} onRequestClose={onClose} onDismiss={dismissed} statusBarTranslucent>
      <SheetRoot style={[styles.sheetRoot, side && styles.sheetRootSide]}>
        <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        <SwipeSheet
          onClose={onClose}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            side ? [styles.sheetSide, { marginTop: insets.top + 12, marginBottom: Math.max(insets.bottom, 12), marginRight: Math.max(insets.right, 12) }]
              : layout.wide ? styles.sheetWide : null,
            { paddingBottom: side ? 12 : Math.max(insets.bottom, 16) + 8 },
          ]}>
          {side ? null : <View style={styles.grip} />}
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{tr('Map Settings')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.sheetClose}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.text} strokeWidth={2.8} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          <SheetScroll style={{ flexShrink: 1 }} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{tr('Map Style')}</Text>
                <ProTag feature="map_layers" style={{ alignSelf: 'auto' }} />
              </View>
              <View style={styles.styles} accessibilityRole="radiogroup" accessibilityLabel={tr('Map style')}>
                {bases.map((b) => (
                  <StyleTile key={b} base={b} on={trail.base === b} onPress={() => pro('map_layers') && trail.setBase(b)} />
                ))}
              </View>
              {trail.base === 'terrain' ? (
                <Text style={styles.fine}>
                  {trail.terrain3d
                    ? tr('Satellite on the real shape of the land, with contour lines and peak heights in feet. {v} Shows in Ride Mode and Map Mode.', { v: WEB ? tr('Right-drag or Ctrl-drag to tilt and turn.') : tr('Drag up or down with two fingers to tilt, twist to turn.') })
                    : tr('No signal here, so the flat map is showing. Add 3D Terrain to a download in Offline Maps to see it with no signal.')}
                </Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{tr('On the Map')}</Text>
              <View style={styles.quickGrid}>
                {QUICK_LAYERS.map((q) => (
                  <QuickTile
                    key={q.id}
                    q={q}
                    on={quickLayerOn(trail.features, q)}
                    onPress={() => {
                      if (!pro('map_layers')) return;
                      trail.setFeatures(quickLayerToggle(trail.features, q));
                    }}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: every }}
                onPress={() => setEvery((e) => !e)}
                style={({ pressed }) => [styles.disclose, pressed && { opacity: 0.7 }]}>
                <Text style={styles.discloseText}>{tr('Every Map Feature')}</Text>
                <Text style={styles.discloseSub}>{every ? tr('Hide') : tr('Fine-Tune')}</Text>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: every ? '180deg' : '0deg' }] }}>
                  <Path d="M6 9l6 6 6-6" stroke={Colors.textSecondary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
              {every ? <MapFeaturesList trail={trail} lookupHint={lookupHint} /> : null}
            </View>

            {trackline ? <TracklineRow sw={trackline} /> : null}

            {controls ? <MapButtons trail={trail} /> : null}

            {!WEB && ride && route && route.length > 1 ? <RideMapDownload ride={ride} route={route} terrain={trail.terrainAvailable && trail.base === 'terrain'} /> : null}
            {!WEB ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  onClose();
                  router.push('/maps');
                }}
                hitSlop={6}
                style={styles.link}>
                <Text style={styles.linkText}>{tr('Offline Maps')}</Text>
                <Text style={styles.linkText}>›</Text>
              </Pressable>
            ) : null}
            {credit ? <Text style={styles.fine}>{tr('Map data: {credit}', { credit })}</Text> : null}
          </SheetScroll>
        </SwipeSheet>
      </SheetRoot>
    </SheetModal>
    </SheetPro.Provider>
  );
}

/** One map style as a picture of itself, its name set on the picture; the chosen one has a sky ring and a check. */
function StyleTile({ base, on, onPress }: { base: BaseMap; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={tr(BASE_NAME[base])}
      onPress={onPress}
      style={({ pressed }) => [styles.styleTile, on && styles.styleTileOn, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={styles.styleArt}>
        <View style={StyleSheetFill}>
          <StyleThumb base={base} />
        </View>
        <Svg style={StyleSheetFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`fade-${base}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.45" stopColor="#061223" stopOpacity={0} />
              <Stop offset="1" stopColor="#061223" stopOpacity={0.85} />
            </LinearGradient>
          </Defs>
          <Rect width={100} height={100} fill={`url(#fade-${base})`} />
        </Svg>
        <Text style={styles.styleName} numberOfLines={1}>{tr(BASE_NAME[base])}</Text>
        {on ? (
          <View style={styles.styleCheck}>
            <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const StyleSheetFill = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

/**
 * One of the four big switches: a strip of map with the lines drawn exactly as the map draws them
 * (core/map-features inks), lit in their own colors while on and grey when off, over the name and
 * a small switch.
 */
function QuickTile({ q, on, onPress }: { q: QuickLayer; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={tr(q.name)}
      accessibilityHint={tr(q.detail)}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, on && styles.quickOn, pressed && { transform: [{ scale: 0.97 }] }]}>
      <QuickArt id={q.id} on={on} />
      <View style={styles.quickFoot}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[styles.quickName, !on && { color: Colors.textSecondary }]} numberOfLines={2}>{tr(q.name)}</Text>
        </View>
        <View style={[styles.pill, on && styles.pillOn]}>
          <View style={[styles.knob, on && styles.knobOn]} />
        </View>
      </View>
    </Pressable>
  );
}

/** The quick switch's strip of map. Off, every line fades to grey so the tile reads as off at a glance. */
function QuickArt({ id, on }: { id: QuickLayer['id']; on: boolean }) {
  const grey = '#6E7A88';
  const ink = (c: string) => (on ? c : grey);
  const casing = 'rgba(6,18,35,0.92)';
  return (
    <View style={styles.quickArt}>
      <Svg width="100%" height="100%" viewBox="0 0 160 56" preserveAspectRatio="xMidYMid slice">
        <Rect width={160} height={56} fill={on ? '#1D2B20' : '#1A2129'} />
        <Path d="M0 40 C30 30 50 52 90 38 S140 20 160 26" stroke="rgba(255,255,255,0.05)" strokeWidth={14} fill="none" />
        {id === 'streets' ? (
          <>
            <Path d="M-4 46 C40 40 80 18 164 12" stroke={casing} strokeWidth={8.5} fill="none" strokeLinecap="round" />
            <Path d="M-4 46 C40 40 80 18 164 12" stroke={ink(FEATURE_INK.highway)} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Path d="M52 -4 C58 20 70 40 74 60" stroke={casing} strokeWidth={6.5} fill="none" />
            <Path d="M52 -4 C58 20 70 40 74 60" stroke={ink(FEATURE_INK.road)} strokeWidth={3.4} fill="none" />
            <Path d="M110 60 C116 46 128 34 150 30" stroke={casing} strokeWidth={6} fill="none" />
            <Path d="M110 60 C116 46 128 34 150 30" stroke={ink(FEATURE_INK.dirtRoad)} strokeWidth={2.8} fill="none" />
          </>
        ) : id === 'offroad' ? (
          <>
            <Path d="M-4 40 C30 44 52 14 92 20 S140 44 164 30" stroke={casing} strokeWidth={7.5} fill="none" strokeLinecap="round" />
            <Path d="M-4 40 C30 44 52 14 92 20 S140 44 164 30" stroke={ink(FEATURE_INK.trail)} strokeWidth={3.6} strokeDasharray="10 5.5" fill="none" />
            <Path d="M96 20 C104 6 120 2 140 -4" stroke={casing} strokeWidth={7} fill="none" />
            <Path d="M96 20 C104 6 120 2 140 -4" stroke={ink(FEATURE_INK.narrow)} strokeWidth={3.4} strokeDasharray="4.5 3.4" fill="none" />
          </>
        ) : id === 'hiking' ? (
          <>
            <Path d="M-4 18 C26 14 40 42 76 40 S128 12 164 22" stroke="rgba(6,18,35,0.6)" strokeWidth={4.4} fill="none" />
            <Path d="M-4 18 C26 14 40 42 76 40 S128 12 164 22" stroke={ink(FEATURE_INK.hiking)} strokeWidth={2.6} strokeDasharray="7 3 1.2 3" fill="none" />
            <Path d="M76 40 C84 48 92 52 104 60" stroke={ink(FEATURE_INK.hiking)} strokeWidth={2.6} strokeDasharray="7 3 1.2 3" fill="none" />
          </>
        ) : (
          <>
            <Path d="M-6 -6 L86 -6 L76 30 L40 44 L-6 38 Z" fill={ink(FEATURE_INK.nationalForest)} fillOpacity={on ? 0.32 : 0.16} stroke={ink(FEATURE_INK.nationalForest)} strokeWidth={2} />
            <Path d="M86 -6 L166 -6 L166 40 L110 50 L76 30 Z" fill={ink(FEATURE_INK.blm)} fillOpacity={on ? 0.3 : 0.14} stroke={ink(FEATURE_INK.blm)} strokeWidth={2} />
            <Path d="M40 44 L76 30 L110 50 L104 62 L36 62 Z" fill={ink(FEATURE_INK.statePark)} fillOpacity={on ? 0.28 : 0.12} stroke={ink(FEATURE_INK.statePark)} strokeWidth={2} />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * The switches for what floats on the riding maps, so a rider tunes the whole map screen in one
 * place. The same switches are on the You tab; they're shared, so a change shows everywhere.
 */
function MapButtons({ trail }: { trail: TrailMap }) {
  const tilt = useTiltSettings();
  const [music, setMusic] = useMusicControlsSetting();
  const musicFlag = useFlag('music_controls');
  const [followMe, setFollowMe] = useFollowMePref();
  const [edgeZoom, setEdgeZoom] = useEdgeZoomPref();
  const [junctions, setJunctions] = useIntersectionZoomPref();
  const following: SwitchRowItem[] = [
    { key: 'follow', name: 'Follow Me', detail: 'The map moves to keep your dot on screen as you ride.', on: followMe, set: setFollowMe },
    { key: 'edge', name: 'Zoom Out at the Edge', detail: 'The first time your dot nears the edge, the map zooms out one step. After that it slides along with you.', on: edgeZoom, set: setEdgeZoom, off: !followMe },
    ...(trail.mapbox ? [{ key: 'junctions', name: 'Zoom In at Intersections', detail: 'Closes in on a road or trail junction as you reach it so you can see which way to go, then zooms back out.', on: junctions, set: setJunctions, off: !followMe }] : []),
  ];
  const buttons: SwitchRowItem[] = [
    ...(!WEB ? [{ key: 'tilt', name: 'Tilt Meter', detail: 'Roll and pitch on the map. Calibrate it on the Tilt screen.', on: tilt.show, set: setTiltShown }] : []),
    ...(musicAvailable && musicFlag ? [{ key: 'music', name: 'Music Button', detail: 'Play, pause, skip and volume without leaving the map.', on: music, set: setMusic }] : []),
  ];
  return (
    <>
      <DotSizeRow />
      <SwitchGroup title="Following" rows={following} note={followMe ? null : 'Zooming works while Follow Me is on.'} />
      {buttons.length ? <SwitchGroup title="Map Buttons" rows={buttons} /> : null}
    </>
  );
}

/** Your Dot: its look and its size, the same choice on every live map and the You tab. */
function DotSizeRow() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('Your Dot')}</Text>
      <DotStyleChoice />
      <View style={[styles.group2, styles.switchRow]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.switchName}>{tr('Dot Size')}</Text>
          <Text style={styles.switchDetail}>{tr('How big your own dot is on the map.')}</Text>
        </View>
        <DotSizeChoice />
      </View>
    </View>
  );
}

/** The Dot Styles as sample tiles, one tap to pick (Map Settings and the You tab). */
export function DotStyleChoice() {
  const [style, setStyle] = useDotStylePref();
  return (
    <View style={styles.dotStyles} accessibilityRole="radiogroup" accessibilityLabel={tr('Dot Style')}>
      {DOT_STYLES.map((s) => {
        const on = style === s;
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={tr(DOT_STYLE_NAME[s])}
            onPress={() => setStyle(s)}
            style={[styles.dotStyle, on && { borderColor: DOT_STYLE_INK[s], backgroundColor: withAlpha(DOT_STYLE_INK[s], 0.1) }]}>
            <View style={styles.dotStyleArt}>
              <DotSample style={s} size={40} />
            </View>
            <Text style={[styles.dotStyleName, on && { color: Colors.text }]} numberOfLines={2}>{tr(DOT_STYLE_NAME[s])}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small, Medium, Large as one pill (Map Settings and the You tab). */
export function DotSizeChoice() {
  const [size, setSize] = useDotSizePref();
  return (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={tr('Dot Size')}>
      {DOT_SIZES.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="radio"
          accessibilityState={{ checked: size === s }}
          accessibilityLabel={tr(DOT_SIZE_NAME[s])}
          onPress={() => setSize(s)}
          hitSlop={4}
          style={[styles.segItem, size === s && styles.segOn]}>
          <Text style={[styles.segText, size === s && styles.segTextOn]}>{tr(DOT_SIZE_NAME[s])}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type SwitchRowItem = { key: string; name: string; detail: string; on: boolean; set: (on: boolean) => void; /** Shown dimmed: it only works with another switch on. */ off?: boolean };

function SwitchGroup({ title, rows, note }: { title: string; rows: SwitchRowItem[]; note?: string | null }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr(title)}</Text>
      <View style={styles.group2}>
        {rows.map((r, i) => (
          <View key={r.key} style={[styles.switchRow, i > 0 && styles.switchRowRule, r.off && { opacity: 0.5 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.switchName}>{tr(r.name)}</Text>
              <Text style={styles.switchDetail}>{tr(r.detail)}</Text>
            </View>
            <Switch
              value={r.on}
              onValueChange={r.set}
              accessibilityLabel={tr(r.name)}
              trackColor={{ false: withAlpha(Colors.textSecondary, 0.35), true: Colors.sky }}
              thumbColor="#FFFFFF"
              {...(WEB ? { activeThumbColor: '#FFFFFF' } : {})}
              ios_backgroundColor={withAlpha(Colors.textSecondary, 0.35)}
            />
          </View>
        ))}
      </View>
      {note ? <Text style={styles.fine}>{tr(note)}</Text> : null}
    </View>
  );
}

/**
 * Map Features: every kind of line and land the map can show, grouped as Roads, Trails and Land,
 * each with a sample of exactly how it looks on the map. Tapping a row turns it on or off; each
 * group has one tap to show or hide all of it. Choices are saved and follow the rider to their
 * other devices.
 */
function MapFeaturesList({ trail, lookupHint }: { trail: TrailMap; lookupHint: string }) {
  const pro = useContext(SheetPro);
  const set = (id: MapFeatureId, on: boolean) => {
    // Rider Trails and Park Trails are free for everyone; the rest are part of map layers (Pro).
    if (id === 'riderTrails' || id === 'parkTrails' || pro('map_layers')) trail.setFeature(id, on);
  };
  return (
    <View style={{ gap: 14 }}>
      {FEATURE_GROUPS.map((g) => {
        const list = MAP_FEATURES.filter((f) => f.group === g.id);
        const allOn = list.every((f) => trail.features[f.id]);
        return (
          <View key={g.id} style={styles.group} accessibilityRole="list" accessibilityLabel={tr(g.name)}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>{tr(g.name)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={allOn ? tr('Hide All {group}', { group: tr(g.name) }) : tr('Show All {group}', { group: tr(g.name) })}
                hitSlop={8}
                onPress={() => {
                  if (!pro('map_layers')) return;
                  trail.setFeatures(list.filter((f) => trail.features[f.id] !== !allOn).map((f) => ({ id: f.id, on: !allOn })));
                }}>
                <Text style={styles.groupAll}>{allOn ? tr('Hide All') : tr('Show All')}</Text>
              </Pressable>
            </View>
            {list.map((f) => (
              <FeatureRow key={f.id} feature={f} on={trail.features[f.id]} onToggle={(on) => set(f.id, on)} />
            ))}
            {g.id === 'trails' ? (
              <Text style={styles.fine}>
                {tr('Closures come from Forest Service, BLM and OpenStreetMap travel plans and seasons, not live gate reports. Check posted signs and local orders. {lookupHint}', { lookupHint }).trim()}
              </Text>
            ) : g.id === 'land' ? (
              <Text style={styles.fine}>{tr('Tap the map to see whose land you are on. Boundaries come from public records and can lag behind the real ones, so obey posted signs.')}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export type TracklineSwitch = { on: boolean; busy?: boolean; onChange: (on: boolean) => void };

/**
 * The leader's Leader Trackline switch: free for everyone, and for the whole ride (every rider's
 * map follows it). Its sample is the line itself, an older pass faded under the fresh one.
 */
function TracklineRow({ sw }: { sw: TracklineSwitch }) {
  const ink = tracklineInk();
  const fresh = sw.on ? ink.fresh : '#7B8794';
  const old = sw.on ? ink.old : '#56606C';
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{tr('Leader Trackline')}</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: sw.on, busy: !!sw.busy }}
        accessibilityLabel={tr('Leader Trackline')}
        accessibilityHint={tr('A line behind the leader in the leader color, on every rider’s map')}
        disabled={sw.busy}
        onPress={() => sw.onChange(!sw.on)}
        style={({ pressed }) => [styles.feature, sw.on && styles.featureOn, pressed && { opacity: 0.85 }]}>
        <Svg width={44} height={32} viewBox="0 0 44 32" style={styles.sample}>
          <Rect width={44} height={32} fill="#1B2A1E" />
          <Path d="M4 28 C14 26 18 6 28 6 S40 14 40 22" stroke={ink.casing} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d="M4 28 C14 26 18 6 28 6 S40 14 40 22" stroke={old} strokeWidth={2.2} strokeDasharray="3 3" fill="none" />
          <Path d="M40 22 C34 26 22 22 14 12 S4 6 2 6" stroke={ink.casing} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M40 22 C34 26 22 22 14 12 S4 6 2 6" stroke={fresh} strokeWidth={3} fill="none" strokeLinecap="round" />
        </Svg>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[styles.featureName, !sw.on && { color: Colors.textSecondary }]} numberOfLines={1}>{sw.on ? tr('On for Everyone') : tr('Off for Everyone')}</Text>
          <Text style={styles.featureDetail} numberOfLines={3}>{tr('Shows where you’ve led on every rider’s map. Cross back over it and the older pass fades.')}</Text>
        </View>
        {sw.busy ? (
          <ActivityIndicator color={Colors.text} size="small" />
        ) : (
          <View style={[styles.tick, sw.on && styles.tickOn]}>
            {sw.on ? (
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            ) : null}
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** One feature: its sample, its name and what it is, and whether it shows. The whole row is the switch. */
function FeatureRow({ feature, on, onToggle }: { feature: MapFeature; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={tr(feature.name)}
      accessibilityHint={tr(feature.detail)}
      onPress={() => onToggle(!on)}
      style={({ pressed }) => [styles.feature, on && styles.featureOn, pressed && { opacity: 0.85 }]}>
      <FeatureSample feature={feature} on={on} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.featureName, !on && { color: Colors.textSecondary }]} numberOfLines={1}>{tr(feature.name)}</Text>
        <Text style={styles.featureDetail} numberOfLines={2}>{tr(feature.detail)}</Text>
      </View>
      <View style={[styles.tick, on && styles.tickOn]}>
        {on ? (
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A small square of map with the feature drawn on it the way the map draws it: the same color,
 * width, dashes and casing (core/map-features), so the key and the map never disagree. Off, it
 * fades to a grey outline of itself.
 */
function FeatureSample({ feature, on }: { feature: MapFeature; on: boolean }) {
  const ink = feature.ink;
  const color = on ? ink.color : '#7B8794';
  const ground = '#1B2A1E';
  if (feature.group === 'land') {
    return (
      <Svg width={44} height={32} viewBox="0 0 44 32" style={styles.sample}>
        <Rect width={44} height={32} fill={ground} />
        {feature.id === 'private' ? (
          <>
            <Path d="M0 12H44M18 0V32M30 12V32" stroke={color} strokeWidth={1.2} />
            <Path d="M30 22H44" stroke={color} strokeWidth={1.2} />
          </>
        ) : (
          <Path d="M8 4 L36 7 L40 26 L14 29 L4 18 Z" fill={color} fillOpacity={(ink.fill ?? 0.16) * 1.6} stroke={color} strokeWidth={ink.width} strokeLinejoin="round" />
        )}
      </Svg>
    );
  }
  const d = 'M2 24 C12 24 14 8 24 8 S36 16 42 10';
  const scale = 0.8;
  if (feature.id === 'parkTrails') {
    // Park trails come in the park's level colors: the sample shows the four, green to red.
    const levels = PARK_LEVEL_LEGEND;
    return (
      <Svg width={44} height={32} viewBox="0 0 44 32" style={styles.sample}>
        <Rect width={44} height={32} fill={ground} />
        {levels.map((l, i) => (
          <Path key={l.level} d={`M2 ${6 + i * 6.5} C12 ${6 + i * 6.5} 20 ${4 + i * 6.5} 42 ${5 + i * 6.5}`} stroke={on ? PARK_LEVEL_COLORS[l.level] : '#7B8794'} strokeWidth={ink.width * scale * 0.7} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
    );
  }
  return (
    <Svg width={44} height={32} viewBox="0 0 44 32" style={styles.sample}>
      <Rect width={44} height={32} fill={ground} />
      {ink.casing ? <Path d={d} stroke="rgba(10,22,38,0.9)" strokeWidth={(ink.width + 3.2) * scale} strokeLinecap="round" fill="none" /> : (
        <Path d={d} stroke="rgba(10,22,38,0.6)" strokeWidth={(ink.width + 1.6) * scale} fill="none" />
      )}
      <Path
        d={d}
        stroke={color}
        strokeWidth={ink.width * scale}
        strokeDasharray={ink.dash ? ink.dash.map((n) => n * scale).join(' ') : undefined}
        strokeLinecap={feature.id === 'riderTrails' ? 'round' : 'butt'}
        fill="none"
      />
    </Svg>
  );
}

/** Whose land a tap is on: the park, forest or BLM land (or a Texas parcel), who runs it and whether the public may enter. */
export function LandCard({ land, onClose }: { land: LandInfo; onClose: () => void }) {
  const ink = FEATURE_INK[land.kind === 'public' ? 'blm' : land.kind];
  const kindName: Record<LandInfo['kind'], string> = {
    nationalForest: 'National Forest', blm: 'BLM Land', nationalPark: 'National Park', statePark: 'State Park', public: 'Public Land', private: 'Private Property',
  };
  const facts = [land.manager, land.acres != null ? tr('{n} acres', { n: land.acres.toLocaleString('en-US') }) : null].filter(Boolean);
  return (
    <View style={[styles.card, { borderColor: ink }]} accessibilityLiveRegion="polite">
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.userRow}>
            <View style={[styles.landDot, { backgroundColor: ink }]} />
            <Text style={[styles.userText, { color: ink }]}>{tr(kindName[land.kind])}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{tr(land.title)}</Text>
          {facts.length ? <Text style={styles.rowSub} numberOfLines={2}>{facts.join('   ')}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.close}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      {land.access ? <Text style={styles.facts}>{tr(land.access)}</Text> : null}
      <Text style={styles.fine}>{tr('From {attribution}. Boundaries can be out of date; posted signs win.', { attribution: land.attribution })}</Text>
    </View>
  );
}

const BASE_NAME: Record<BaseMap, string> = { satellite: 'Satellite', topo: 'Topo', terrain: '3D Terrain' };

/** A small picture of each map style, so the choice is seen rather than read. */
function StyleThumb({ base }: { base: BaseMap }) {
  if (base === 'terrain') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice">
        <Rect width={100} height={64} fill="#24466F" />
        <Path d="M0 40 L22 18 L34 28 L52 8 L70 26 L82 18 L100 34 L100 64 L0 64 Z" fill="#3D4A30" />
        <Path d="M52 8 L60 16 L56 18 L50 14 L44 18 Z" fill="#E9E3D2" />
        <Path d="M0 50 C18 40 30 46 44 36 S70 30 100 42" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1} fill="none" />
        <Path d="M0 58 C20 50 34 56 50 46 S76 42 100 52" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1} fill="none" />
        <Path d="M6 62 C24 52 40 54 54 40" stroke={TRAIL_INK.trail} strokeWidth={2.4} strokeDasharray="5 3" fill="none" />
      </Svg>
    );
  }
  if (base === 'topo') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice">
        <Rect width={100} height={64} fill="#E9E3D2" />
        {[30, 21, 12].map((r) => (
          <Ellipse key={r} cx={58} cy={30} rx={r * 1.5} ry={r} stroke="#B08D5A" strokeOpacity={0.7} strokeWidth={1.2} fill="none" />
        ))}
        <Path d="M8 60 C26 44 44 48 52 30" stroke={TRAIL_INK.closed} strokeWidth={2.4} strokeDasharray="5 3" fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice">
      <Rect width={100} height={64} fill="#26301F" />
      <Ellipse cx={30} cy={22} rx={34} ry={20} fill="#3D4A30" />
      <Ellipse cx={78} cy={50} rx={30} ry={18} fill="#1A2216" />
      <Path d="M8 60 C26 44 44 48 52 30 S76 12 94 8" stroke={Colors.sky} strokeWidth={3.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const FLAT: OfflineChoice[] = ['satellite', 'topo', 'trails'];

/**
 * One tap saves satellite, topo and trails around the ride's route (and 3D Terrain, for a rider
 * whose map style is 3D Terrain); then shows how it is going.
 */
function RideMapDownload({ ride, route, terrain }: { ride: { id: string; name: string }; route: LatLng[]; terrain: boolean }) {
  const pro = useContext(SheetPro);
  const maps = useOfflineMaps();
  const saved = rideDownload(maps, ride.id);
  const ALL = useMemo<OfflineChoice[]>(() => (terrain ? [...FLAT, 'terrain'] : FLAT), [terrain]);
  const estimate = useMemo(() => (saved ? 0 : planRide(route, ALL).bytes), [route, saved, ALL]);
  const busy = saved?.status === 'downloading';
  const pct = saved && saved.total ? Math.round(((saved.saved + saved.failed) / saved.total) * 100) : 0;

  if (!saved) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint={tr('Saves satellite, topo and trails around this ride\'s route for riding with no signal')}
        onPress={() => pro('offline_maps') && downloadRide(ride.id, ride.name, route, ALL)}
        style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}>
        <View style={styles.saveRow}>
          <Text style={styles.saveText}>{tr('Download This Ride’s Map')}</Text>
          <ProTag feature="offline_maps" />
        </View>
        <Text style={styles.saveSub}>{`${terrain ? tr('Satellite, Topo, Trails and 3D Terrain') : tr('Satellite, Topo and Trails')}, About ${formatBytes(estimate)}`}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.saved}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle}>{busy ? tr('Downloading Ride Map') : saved.status === 'ready' ? tr('Ride Map Downloaded') : tr('Ride Map')}</Text>
        <Text style={styles.savedSub}>{statusLine(saved)}</Text>
        {busy || saved.status === 'paused' ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>
      {busy ? (
        <Pressable accessibilityRole="button" onPress={() => pauseDownload(saved.id)} hitSlop={8} style={styles.mini}>
          <Text style={styles.miniText}>{tr('Pause')}</Text>
        </Pressable>
      ) : saved.status !== 'ready' ? (
        <Pressable accessibilityRole="button" onPress={() => resumeDownload(saved.id)} hitSlop={8} style={styles.mini}>
          <Text style={styles.miniText}>{saved.status === 'paused' ? tr('Resume') : tr('Finish')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TrailCard({ info, onClose }: { info: TrailInfo; onClose: () => void }) {
  const facts = [info.hiking ? tr('Hiking Trail') : info.source === 'osm' ? tr('Track') : info.kind === 'trail' ? tr('Trail') : tr('Road'), info.miles != null ? `${info.miles} mi segment` : null, info.surface].filter(Boolean);
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{tr(info.title)}</Text>
          {info.where ? <Text style={styles.rowSub} numberOfLines={1}>{info.where}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.close}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      {info.closure ? (
        <View style={styles.closure} accessibilityRole="alert">
          <Text style={styles.closureLabel}>{tr(info.closure.label)}</Text>
          <Text style={styles.closureText}>{tr(info.closure.detail)}</Text>
        </View>
      ) : null}
      <Text style={styles.facts}>{facts.join('   ')}</Text>
      <TrailWidthRow key={`${info.source}|${info.lineKey ?? info.title}|${info.at?.lat}|${info.at?.lng}`} info={info} />
      {info.allowed.length ? (
        <View style={styles.allowed}>
          <Text style={styles.allowedLabel}>{info.seasonal ? tr('Open To, by Season') : tr('Open To')}</Text>
          {info.allowed.slice(0, 6).map((a) => (
            <View key={a.vehicle} style={styles.allowedRow}>
              <Text style={styles.allowedName}>{a.vehicle}</Text>
              <Text style={[styles.allowedDates, a.closedNow && styles.closedNow]}>
                {[a.closedNow ? tr('Closed Now') : null, a.dates].filter(Boolean).join('  ')}
              </Text>
            </View>
          ))}
        </View>
      ) : info.source === 'osm' ? (
        <Text style={styles.rowSub}>{tr('Mapped by riders on OpenStreetMap. Parks and private land need permission or a pass.')}</Text>
      ) : (
        <Text style={styles.rowSub}>{"The agency data doesn't list which vehicles can use this one."}</Text>
      )}
      <Text style={styles.fine}>{tr('From {attribution}. Check posted signs and closures before you ride.', { attribution: info.attribution })}</Text>
    </View>
  );
}

/**
 * A trail another rider mapped and shared. It says plainly that it's user submitted (mint, like its
 * dotted line), who mapped it and when, its ratings, and offers Rate, Navigate and Details.
 */
export function RiderTrailCard({ t, onClose, onRate, onFollow }: { t: PublicTrail; onClose: () => void; onRate: () => void; onFollow: () => void }) {
  const facts = [feetOrMiles(t.lengthM), t.maxWidthIn != null ? tr('{v} Width Limit', { v: inches(t.maxWidthIn) }) : null, t.vehicles.map(vehicleLabel).join(', ')]
    .filter(Boolean)
    .join('   ');
  const garage = useGarageWidths();
  return (
    <View style={[styles.card, styles.riderCard]} accessibilityLiveRegion="polite">
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.userRow}>
            <Svg width={22} height={8}><Path d="M3 4H19" stroke={RIDER_TRAIL_INK} strokeWidth={3.6} strokeLinecap="round" strokeDasharray="0.1 5.5" /></Svg>
            <Text style={styles.userText}>{tr('User Submitted Trail')}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{t.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{mappedBy(t)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.close}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      <View style={styles.userRow}>
        <View style={[styles.diff, { borderColor: difficultyColor(t.difficulty) }]}>
          <View style={[styles.diffDot, { backgroundColor: difficultyColor(t.difficulty) }]} />
          <Text style={styles.diffText}>{difficultyLabel(t.difficulty)}</Text>
        </View>
        <Text style={[styles.facts, { flex: 1 }]} numberOfLines={2}>{facts}</Text>
      </View>
      <RigFitLine limitIn={t.maxWidthIn} garage={garage} />
      <View style={styles.scores}>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreLabel}>{tr('Quality')}</Text>
          <StarScore average={t.quality} count={t.qualityCount} color="#F5C451" empty={tr('Not Rated')} />
        </View>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreLabel}>{tr('Line Accuracy')}</Text>
          <StarScore average={t.average} count={t.ratingCount} color={RIDER_TRAIL_INK} empty={tr('Not Rated')} />
        </View>
      </View>
      <View style={styles.actions}>
        {!t.mine ? (
          <Pressable accessibilityRole="button" onPress={onRate} style={({ pressed }) => [styles.action, styles.actionMain, pressed && { opacity: 0.85 }]}>
            <Text style={[styles.actionText, { color: Colors.background }]}>{t.myScore != null || t.myQuality != null ? tr('Change Rating') : tr('Rate Trail')}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onFollow} style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
          <Text style={styles.actionText}>{tr('Navigate')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/nav/public/${t.id}`)} style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
          <Text style={styles.actionText}>{tr('Details')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A tapped park trail: the park, the trail's name and level, its length, and the OpenStreetMap credit. */
export function ParkTrailCard({ t, onClose }: { t: ParkTrail; onClose: () => void }) {
  const color = parkTrailColor(t);
  const facts = [parkTrailLength(t.lengthM), t.oneway ? tr('One Way') : null, t.surface ? t.surface.replace(/_/g, ' ') : null].filter(Boolean).join('   ');
  return (
    <View style={[styles.card, styles.parkCard]} accessibilityLiveRegion="polite">
      <View style={styles.cardHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.userRow}>
            <Svg width={22} height={8}><Path d="M3 4H19" stroke={color} strokeWidth={3.6} strokeLinecap="round" /></Svg>
            <Text style={[styles.userText, { color: Colors.textSecondary }]} numberOfLines={1}>{t.parkName}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{t.name ?? (t.kind === 'road' ? tr('Park Road') : tr('Park Trail'))}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('Close')} hitSlop={10} onPress={onClose} style={styles.close}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      <View style={styles.userRow}>
        <View style={[styles.diff, { borderColor: color }]}>
          <View style={[styles.diffDot, { backgroundColor: color }]} />
          <Text style={styles.diffText}>{parkLevelLabel(t)}</Text>
        </View>
        <Text style={[styles.facts, { flex: 1 }]} numberOfLines={2}>{facts}</Text>
      </View>
      <Text style={styles.fine}>{tr('Levels are the park’s own ratings as mapped in OpenStreetMap ({credit}). Trails change after storms and work days, so check the park’s posted map.', { credit: t.attribution })}</Text>
    </View>
  );
}

/** Map Settings' button: two sliders, the sign for "settings" that reads at a glance on a map. */
function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8h9M19 8h1M4 16h1M11 16h9" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M16 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 13.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}

const glass = GlassSurface;

const styles = themedStyles(() => ({
  corner: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 8, zIndex: 20 },
  fab: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', ...glass,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
  fabDot: { position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.sky, borderWidth: 1.5, borderColor: Glass.panel },
  sheetRoot: { backgroundColor: 'rgba(4,10,20,0.28)' },
  sheetRootSide: { flexDirection: 'row' },
  sheetScrim: { flex: 1, alignSelf: 'stretch', outlineWidth: 0 },
  sheet: {
    flexShrink: 1, maxHeight: '86%', backgroundColor: Colors.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, gap: 6, borderWidth: 1, borderBottomWidth: 0, borderColor: Glass.edge,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },
  sheetWide: { width: 560, maxWidth: '100%', alignSelf: 'center' },
  sheetSide: { width: 392, maxHeight: undefined, alignSelf: 'stretch', borderRadius: 28, borderBottomWidth: 1, paddingTop: 16 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  sheetTitle: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 28, lineHeight: 32 },
  sheetClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 12, gap: 26 },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 19, lineHeight: 22 },
  styles: { flexDirection: 'row', gap: 10 },
  styleTile: { flex: 1, height: 92, borderRadius: 18, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  styleTileOn: { borderColor: Colors.sky },
  styleArt: { flex: 1, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  styleName: { color: '#FFFFFF', fontFamily: font(700), fontSize: 14, paddingHorizontal: 10, paddingBottom: 8 },
  styleCheck: { position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.sky, alignItems: 'center', justifyContent: 'center' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: { flexBasis: '47%', flexGrow: 1, borderRadius: 18, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge, overflow: 'hidden' },
  quickOn: { borderColor: Colors.sky },
  quickArt: { height: 58 },
  quickFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52 },
  quickName: { color: Colors.text, fontFamily: font(700), fontSize: 14, lineHeight: 17 },
  pill: { width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: withAlpha(Colors.textSecondary, 0.35), justifyContent: 'center' },
  pillOn: { backgroundColor: Colors.sky },
  knob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' },
  knobOn: { alignSelf: 'flex-end' },
  disclose: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge },
  discloseText: { flex: 1, color: Colors.text, fontFamily: font(700), fontSize: 15 },
  discloseSub: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  group2: { borderRadius: 18, backgroundColor: Glass.tile, borderWidth: 1, borderColor: Glass.edge, paddingHorizontal: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60 },
  switchRowRule: { borderTopWidth: 1, borderTopColor: Glass.edge },
  dotStyles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dotStyle: { flexGrow: 1, flexBasis: 88, maxWidth: 140, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1.5, borderColor: Glass.edge, backgroundColor: Glass.tile },
  dotStyleArt: { height: 46, justifyContent: 'center', alignItems: 'center' },
  dotStyleName: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 12, lineHeight: 15, textAlign: 'center' },
  seg: { flexDirection: 'row', borderRadius: 999, padding: 3, backgroundColor: withAlpha(Colors.textSecondary, 0.18) },
  segItem: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, minHeight: 32, justifyContent: 'center' },
  segOn: { backgroundColor: Colors.sky },
  segText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 13 },
  segTextOn: { color: '#FFFFFF' },
  switchName: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  switchDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 16 },
  hint: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, ...glass },
  hintText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 2 },
  groupTitle: { color: SAND, fontFamily: font(700), fontSize: 15 },
  groupAll: { color: Colors.sky, fontFamily: font(600), fontSize: 13 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 5, paddingLeft: 5, paddingRight: 8, borderRadius: Radius.control, borderWidth: 1, borderColor: 'transparent' },
  featureOn: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: Glass.edge },
  featureName: { color: Colors.text, fontFamily: font(700), fontSize: 14 },
  featureDetail: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 15 },
  sample: { borderRadius: 7, overflow: 'hidden' },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  landDot: { width: 10, height: 10, borderRadius: 3 },
  bases: { flexDirection: 'row', gap: 10 },
  base: { flex: 1, gap: 6, alignItems: 'center' },
  baseThumb: { width: '100%', height: 64, borderRadius: Radius.control, overflow: 'hidden', borderWidth: 2, borderColor: Glass.edge },
  baseThumbOn: { borderColor: Colors.sky },
  baseText: { color: Colors.textSecondary, fontFamily: font(700), fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
  rowSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  save: { minHeight: 52, borderRadius: Radius.control, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 1 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveText: { color: Colors.onAccent, fontFamily: font(700), fontSize: 15 },
  saveSub: { color: 'rgba(255,255,255,0.8)', fontFamily: font(500), fontSize: 12 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: Radius.control, borderWidth: 1, borderColor: 'rgba(236,205,145,0.4)' },
  savedSub: { color: SAND, fontFamily: font(600), fontSize: 13 },
  mini: { paddingHorizontal: 12, minHeight: 34, borderRadius: Radius.control - 4, backgroundColor: Colors.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
  miniText: { color: Colors.text, fontFamily: font(600), fontSize: 14 },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  linkText: { color: Colors.sky, fontFamily: font(600), fontSize: 15 },
  offline: { alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, ...glass, borderColor: SAND },
  offlineText: { color: SAND, fontFamily: font(700), fontSize: 13 },
  offlineSub: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 11 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.backgroundElement, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: SAND },
  bottom: { position: 'absolute', left: 12, right: 12, gap: 6, zIndex: 25 },
  looking: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, ...glass },
  lookingText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  card: { borderRadius: Radius.card, padding: 14, gap: 8, ...glass, borderColor: 'rgba(236,205,145,0.45)' },
  closure: { borderRadius: Radius.control, padding: 10, gap: 2, backgroundColor: 'rgba(255,69,58,0.14)', borderWidth: 1, borderColor: TRAIL_INK.closed },
  closureLabel: { color: TRAIL_INK.closed, fontFamily: font(800), fontSize: 15 },
  closureText: { color: Colors.text, fontFamily: font(500), fontSize: 13, lineHeight: 18 },
  closedNow: { color: TRAIL_INK.closed, fontFamily: font(700) },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 22, lineHeight: 24 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundElement },
  facts: { color: SAND, fontFamily: font(600), fontSize: 13 },
  allowed: { gap: 4 },
  allowedLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 13 },
  allowedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  allowedName: { color: Colors.text, fontFamily: font(600), fontSize: 15, flexShrink: 1 },
  allowedDates: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 14 },
  fine: { color: Colors.textSecondary, fontFamily: font(500), fontSize: 12, lineHeight: 16 },
  riderCard: { borderColor: 'rgba(87,227,195,0.55)', gap: 10 },
  parkCard: { borderColor: 'rgba(255,255,255,0.35)', gap: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userText: { color: RIDER_TRAIL_INK, fontFamily: font(700), fontSize: 13 },
  diff: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  diffText: { color: Colors.text, fontFamily: font(700), fontSize: 13 },
  scores: { flexDirection: 'row', gap: 16 },
  scoreCol: { gap: 2 },
  scoreLabel: { color: Colors.textSecondary, fontFamily: font(600), fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSelected, borderWidth: 1, borderColor: Colors.border },
  actionMain: { backgroundColor: RIDER_TRAIL_INK, borderColor: RIDER_TRAIL_INK },
  actionText: { color: Colors.text, fontFamily: font(700), fontSize: 15 },
}));
