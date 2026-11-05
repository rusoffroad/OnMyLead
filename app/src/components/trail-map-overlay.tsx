import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

import { Colors, font, Glass, GlassSurface, Radius, themedStyles } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { difficultyColor, difficultyLabel, feetOrMiles, mappedBy, RIDER_TRAIL_INK, vehicleLabel, type PublicTrail } from '@/core/nav-trails';
import { formatBytes, IMAGERY_ATTRIBUTION, statusLine, type OfflineChoice } from '@/core/offline-maps';
import { OSM_ATTRIBUTION } from '@/core/osm-trails';
import { PARK_LEVEL_COLORS, PARK_LEVEL_LEGEND, PARK_TRAILS_ATTRIBUTION, parkLevelLabel, parkTrailColor, parkTrailLength, type ParkTrail } from '@/core/park-trails';
import { FEATURE_GROUPS, FEATURE_INK, MAP_FEATURE_IDS, MAP_FEATURES, type MapFeature, type MapFeatureId } from '@/core/map-features';
import { TOPO_ATTRIBUTION, TRAIL_INK, type BaseMap, type LandInfo, type TrailInfo } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { downloadRide, pauseDownload, planRide, resumeDownload, rideDownload, useOfflineMaps } from '@/lib/offline-maps';
import { requirePro } from '@/lib/pro';
import { RateTrailSheet } from './rate-trail-sheet';
import { RigFitLine, TrailWidthRow } from './trail-width-row';
import { inches } from '@/core/trail-width';
import { useGarageWidths } from '@/lib/trail-width';
import { StarScore } from './stars';
import { ProTag } from '@/components/pro-tag';
import { tracklineInk } from './leader-trackline-ink';

import { t as tr } from '@/lib/i18n';
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
  trail, top = 12, cardTop, bottom = 12, route, ride, lookupHint = 'Tap a line to see who can ride it.', cardWidth, onFollow, ridden, bare = false, threeD = false, trackline,
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
  /** Full Map: no layers button or zoom hint, just the 3D button, the No Signal tag and a tapped trail's card. */
  bare?: boolean;
  /** A map that can tilt (Ride Mode, Map Mode): adds the one-tap 3D button under the layers button. */
  threeD?: boolean;
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
  const anyOn = MAP_FEATURE_IDS.some((id) => trail.features[id]);

  return (
    <>
      <View pointerEvents="box-none" style={[styles.corner, { top }]}>
        {bare ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Map Style and Features')}
          accessibilityState={{ expanded: open }}
          hitSlop={6}
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [styles.fab, (open || anyOn || trail.base !== 'satellite') && styles.fabOn, pressed && { opacity: 0.8 }]}>
          <LayersIcon color={anyOn || trail.base !== 'satellite' ? SAND : Colors.text} />
        </Pressable>
        )}
        {threeD && trail.terrainAvailable && trail.mapbox && (!open || bare) ? <ThreeDButton trail={trail} /> : null}
        {trail.offline && (!open || bare) ? (
          <View style={styles.offline} accessible accessibilityLabel={tr('No signal. The map is showing what\'s downloaded on this phone.')}>
            <Text style={styles.offlineText}>{tr('No Signal')}</Text>
            <Text style={styles.offlineSub}>{tr('Downloaded Map')}</Text>
          </View>
        ) : null}
        {open && !bare ? <LayersPanel trail={trail} route={route} ride={ride} lookupHint={lookupHint} credit={credit} top={top} bottom={bottom} trackline={trackline} /> : null}
      </View>

      {(trail.zoomInHint || trail.closerForTracks) && !open && !bare ? (
        <View pointerEvents="none" style={[styles.hint, { top: top + 6 }]}>
          <Text style={styles.hintText}>{trail.zoomInHint ? tr('Zoom In to See Trails') : tr('Zoom In for Park and Local Trails')}</Text>
        </View>
      ) : null}

      {!open || bare ? (
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
      ) : null}
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

function LayersPanel({
  trail, route, ride, lookupHint, credit, top, bottom, trackline,
}: { trail: TrailMap; route?: LatLng[] | null; ride?: { id: string; name: string } | null; lookupHint: string; credit: string; top: number; bottom: number; trackline?: TracklineSwitch }) {
  const { height } = useWindowDimensions();
  // Under the layers button and clear of the screen's own bottom panel; the list scrolls inside.
  const maxHeight = Math.max(240, height - top - 52 - Math.max(96, bottom + 90));
  return (
    <ScrollView
      style={[styles.panel, { maxHeight }]}
      contentContainerStyle={styles.panelBody}
      showsVerticalScrollIndicator
      accessibilityViewIsModal={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={styles.panelTitle}>{tr('Map Style')}</Text>
        <ProTag feature="map_layers" style={{ alignSelf: 'auto' }} />
      </View>
      <View style={styles.bases} accessibilityRole="radiogroup" accessibilityLabel={tr('Map style')}>
        {(trail.terrainAvailable ? (['satellite', 'topo', 'terrain'] as BaseMap[]) : (['satellite', 'topo'] as BaseMap[])).map((b) => {
          const on = trail.base === b;
          return (
            <Pressable
              key={b}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tr(BASE_NAME[b])}
              onPress={() => requirePro('map_layers') && trail.setBase(b)}
              style={({ pressed }) => [styles.base, pressed && { opacity: 0.8 }]}>
              <View style={[styles.baseThumb, on && styles.baseThumbOn]}>
                <StyleThumb base={b} />
              </View>
              <Text style={[styles.baseText, on && { color: Colors.text }]}>{tr(BASE_NAME[b])}</Text>
            </Pressable>
          );
        })}
      </View>
      {trail.base === 'terrain' ? (
        <Text style={styles.fine}>
          {trail.terrain3d
            ? tr('Satellite on the real shape of the land, with contour lines and peak heights in feet. {v} Shows in Ride Mode and Map Mode.', { v: WEB ? 'Right-drag or Ctrl-drag to tilt and turn.' : 'Drag up or down with two fingers to tilt, twist to turn.' })
            : tr('No signal here, so the flat map is showing. Add 3D Terrain to a download in Offline Maps to see it with no signal.')}
        </Text>
      ) : null}

      {trackline ? <TracklineRow sw={trackline} /> : null}

      <MapFeaturesList trail={trail} lookupHint={lookupHint} />

      {!WEB && ride && route && route.length > 1 ? <RideMapDownload ride={ride} route={route} terrain={trail.terrainAvailable && trail.base === 'terrain'} /> : null}
      {!WEB ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/maps')} hitSlop={6} style={styles.link}>
          <Text style={styles.linkText}>{tr('Offline Maps')}</Text>
          <Text style={styles.linkText}>›</Text>
        </Pressable>
      ) : null}
      {credit ? <Text style={styles.fine}>{tr('Map data: {credit}', { credit })}</Text> : null}
    </ScrollView>
  );
}

/**
 * Map Features: every kind of line and land the map can show, grouped as Roads, Trails and Land,
 * each with a sample of exactly how it looks on the map. Tapping a row turns it on or off; each
 * group has one tap to show or hide all of it. Choices are saved and follow the rider to their
 * other devices.
 */
function MapFeaturesList({ trail, lookupHint }: { trail: TrailMap; lookupHint: string }) {
  const set = (id: MapFeatureId, on: boolean) => {
    // Rider Trails and Park Trails are free for everyone; the rest are part of map layers (Pro).
    if (id === 'riderTrails' || id === 'parkTrails' || requirePro('map_layers')) trail.setFeature(id, on);
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={styles.panelTitle}>{tr('Map Features')}</Text>
        <ProTag feature="map_layers" style={{ alignSelf: 'auto' }} />
      </View>
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
                  if (!requirePro('map_layers')) return;
                  for (const f of list) if (trail.features[f.id] !== !allOn) trail.setFeature(f.id, !allOn);
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
    <View style={{ gap: 8 }}>
      <Text style={styles.panelTitle}>{tr('Leader Trackline')}</Text>
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
        onPress={() => requirePro('offline_maps') && downloadRide(ride.id, ride.name, route, ALL)}
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

/**
 * One tap between the flat map and 3D Terrain, so riders don't have to find it in Map Layers.
 * Lit while 3D is on; tapping again goes back to the style the rider had (Satellite or Topo).
 */
function ThreeDButton({ trail }: { trail: TrailMap }) {
  const on = trail.base === 'terrain';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={tr('3D Terrain')}
      accessibilityState={{ checked: on }}
      accessibilityHint={on ? tr('Lays the map flat again') : tr('Tilts the map and raises the mountains')}
      hitSlop={6}
      onPress={() => requirePro('map_layers') && trail.toggle3d()}
      style={({ pressed }) => [styles.fab, on && styles.fab3dOn, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.fab3dText, on && styles.fab3dTextOn]}>3D</Text>
    </Pressable>
  );
}

function LayersIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M3.5 12.2l8.5 4.5 8.5-4.5M3.5 16.4l8.5 4.5 8.5-4.5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const glass = GlassSurface;

const styles = themedStyles(() => ({
  corner: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 8, zIndex: 20 },
  fab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...glass },
  fabOn: { borderColor: SAND },
  fab3dOn: { backgroundColor: Colors.sky, borderColor: Colors.sky },
  fab3dText: { color: Colors.text, fontFamily: font(800, 'display'), fontSize: 16, letterSpacing: 0.5 },
  fab3dTextOn: { color: '#FFFFFF' },
  hint: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, ...glass },
  hintText: { color: Colors.text, fontFamily: font(600), fontSize: 13 },
  panel: { width: 300, borderRadius: Radius.card, ...glass },
  panelBody: { padding: 14, gap: 12 },
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
  panelTitle: { color: Colors.text, fontFamily: font(700, 'display'), fontSize: 20 },
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
