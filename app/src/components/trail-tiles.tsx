import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, Polyline, UrlTile, WMSTile } from 'react-native-maps';

import { IMAGERY_MAX_NATIVE_Z, USGS_IMAGERY } from '@/core/offline-maps';
import { font } from '@/constants/theme';
import { RIDER_TRAIL_INK, type PublicTrail } from '@/core/nav-trails';
import { parkPieces, parkSummaryLine, type ParkPiece, type ParkSummary, type ParkTrail } from '@/core/park-trails';
import type { OsmTrail, TrailLabel } from '@/core/osm-trails';
import { FEATURE_BY_ID } from '@/core/map-features';
import { TOPO_MAX_NATIVE_Z, TRAIL_INK, USGS_TOPO, type BaseMap, type ClosedLine } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { TILE_MAX_AGE_S, tileCachePath } from '@/lib/trail-tiles';

import { t as tr } from '@/lib/i18n';
/**
 * The topo base map and the public trails overlay, drawn as tiles inside a MapView. Put it first
 * among the map's children so routes and rider pins draw on top. Every tile seen is kept on the
 * phone, so a trail you looked at with signal is still there without it.
 *
 * With no signal (`offline`), every layer reads only what is saved on the phone, stretching a
 * saved wider square where a closer one is missing, and the satellite map is drawn from the
 * downloaded USGS aerial photos, since Apple's satellite imagery can't be saved ahead of time.
 * `base` overrides the rider's choice (Find a Ride is always satellite).
 */
export function TrailTiles({ trail, base = trail.base }: { trail: TrailMap; base?: BaseMap }) {
  const { trails, offline, agencyLayers } = trail;
  return (
    <>
      {base !== 'topo' && offline ? (
        <UrlTile
          urlTemplate={USGS_IMAGERY}
          offlineMode
          maximumNativeZ={IMAGERY_MAX_NATIVE_Z}
          tileCachePath={tileCachePath('imagery')}
          zIndex={-3}
        />
      ) : null}
      {base === 'topo' ? (
        <UrlTile
          urlTemplate={USGS_TOPO}
          shouldReplaceMapContent
          maximumNativeZ={TOPO_MAX_NATIVE_Z}
          tileCachePath={tileCachePath('topo')}
          tileCacheMaxAge={TILE_MAX_AGE_S}
          offlineMode={offline}
          zIndex={-2}
        />
      ) : null}
      {/* Land under trails; each layer keeps its own saved squares (see useTrailMap agencyLayers). */}
      {agencyLayers.map((a) => (
        <WMSTile
          key={a.key}
          urlTemplate={a.template}
          minimumZ={a.minZ}
          tileCachePath={tileCachePath(a.key)}
          tileCacheMaxAge={TILE_MAX_AGE_S}
          offlineMode={offline}
          zIndex={a.land ? -1.5 : -1}
        />
      ))}
      {trails && trail.osmLines.length ? <OsmLines lines={trail.osmLines} /> : null}
      {trails && trail.closedLines.length ? <ClosedLines lines={trail.closedLines} /> : null}
      {trails && trail.labels.length ? <Labels labels={trail.labels} /> : null}
      {trail.riderTrails.length ? <RiderLines trails={trail.riderTrails} /> : null}
      {trail.parkTrails.length ? <ParkLines trails={trail.parkTrails} /> : null}
      {trail.parkLabels.length ? <Labels labels={trail.parkLabels} /> : null}
      {trail.parks.length ? <ParkTitles parks={trail.parks} /> : null}
    </>
  );
}

type Part = OsmTrail['parts'][number];
const coords = (part: Part) => part.map((p) => ({ latitude: p.lat, longitude: p.lng }));

const OPEN_DASH = [9, 5];
const CLOSED_DASH = [5, 5];

/**
 * Navy casing, then the line: closed lines are red dashes, which read as red and navy barricade tape.
 * Memoized on the line itself: Apple Maps takes a line off the map and puts it back on every prop
 * change, so redrawing unchanged lines on each pan or zoom made every trail flash.
 */
const HIKE = FEATURE_BY_ID.hiking.ink;

const Cased = memo(function Cased({ part, closed, path }: { part: Part; closed: boolean; path?: boolean }) {
  const c = useMemo(() => coords(part), [part]);
  if (path) {
    // Hiking: thin pink dash-dots on a light casing, lighter than anything a vehicle uses.
    return (
      <>
        <Polyline coordinates={c} strokeColor="rgba(10,22,38,0.6)" strokeWidth={HIKE.width + 1.6} zIndex={0} tappable={false} />
        <Polyline coordinates={c} strokeColor={HIKE.color} strokeWidth={HIKE.width} lineDashPattern={HIKE.dash} zIndex={0} tappable={false} />
      </>
    );
  }
  return (
    <>
      <Polyline coordinates={c} strokeColor={TRAIL_INK.casing} strokeWidth={6.5} zIndex={0} tappable={false} />
      <Polyline
        coordinates={c}
        strokeColor={closed ? TRAIL_INK.closed : TRAIL_INK.trail}
        strokeWidth={3.2}
        lineDashPattern={closed ? CLOSED_DASH : OPEN_DASH}
        zIndex={closed ? 1 : 0}
        tappable={false}
      />
    </>
  );
});

/**
 * OpenStreetMap dirt tracks (core/osm-trails) drawn in the same amber dash as the agency trails,
 * so a rider sees one kind of line for "dirt you can follow" whatever the source. drawableOsm
 * hands out one piece per item, in a steady order, so lines that stay in view are left alone.
 */
const OsmLines = memo(function OsmLines({ lines }: { lines: OsmTrail[] }) {
  return (
    <>
      {lines.map((t) => t.parts.map((part, i) => <Cased key={`${t.key}-${i}`} part={part} closed={t.closed} path={t.kind === 'path'} />))}
    </>
  );
});

/** Forest Service routes closed for the season today, over the agency's own (open-colored) line. */
const ClosedLines = memo(function ClosedLines({ lines }: { lines: ClosedLine[] }) {
  return (
    <>
      {lines.map((l) =>
        l.parts.map((part, i) => <Cased key={`${l.key}-${i}`} part={part} closed />),
      )}
    </>
  );
});

const RIDER_DOTS = [1, 8];

/** One rider-mapped trail: navy casing and mint dots, unlike any agency or OpenStreetMap line. */
const RiderLine = memo(function RiderLine({ trail }: { trail: PublicTrail }) {
  const c = useMemo(() => coords(trail.points), [trail.points]);
  return (
    <>
      <Polyline coordinates={c} strokeColor={TRAIL_INK.casing} strokeWidth={7} zIndex={1} tappable={false} />
      <Polyline coordinates={c} strokeColor={RIDER_TRAIL_INK} strokeWidth={4} lineDashPattern={RIDER_DOTS} lineCap="round" zIndex={1} tappable={false} />
    </>
  );
});

/** Trails riders mapped and shared in Map Mode (hidden with Rider Trails off in Map layers). */
const RiderLines = memo(function RiderLines({ trails }: { trails: PublicTrail[] }) {
  return (
    <>
      {trails.map((t) => (
        <RiderLine key={t.id} trail={t} />
      ))}
    </>
  );
});

/** One park trail: navy casing and a solid line in the park's level color (core/park-trails). */
const ParkLine = memo(function ParkLine({ piece }: { piece: ParkPiece }) {
  const c = useMemo(() => coords(piece.points), [piece.points]);
  return (
    <>
      <Polyline coordinates={c} strokeColor={TRAIL_INK.casing} strokeWidth={piece.road ? 5.2 : 7} zIndex={1} tappable={false} />
      <Polyline coordinates={c} strokeColor={piece.color} strokeWidth={piece.road ? 2.4 : 4} lineDashPattern={piece.closed ? CLOSED_DASH : undefined} lineCap="round" zIndex={1} tappable={false} />
    </>
  );
});

/** The trails of offroad parks (hidden with Park Trails off in Map layers). */
const ParkLines = memo(function ParkLines({ trails }: { trails: ParkTrail[] }) {
  const pieces = useMemo(() => parkPieces(trails), [trails]);
  return (
    <>
      {pieces.map((p) => (
        <ParkLine key={p.key} piece={p} />
      ))}
    </>
  );
});

/** A park's name and how much of it is mapped, from far out, so riders see where the parks are. */
const ParkTitles = memo(function ParkTitles({ parks }: { parks: ParkSummary[] }) {
  return (
    <>
      {parks.map((p) => (
        <ParkTitle key={p.parkOsmId} park={p} />
      ))}
    </>
  );
});

const ParkTitle = memo(function ParkTitle({ park }: { park: ParkSummary }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker coordinate={{ latitude: park.center.lat, longitude: park.center.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} tappable={false} zIndex={2} accessibilityLabel={park.parkName}>
      <View style={styles.parkTitle}>
        <Text style={styles.parkTitleText} numberOfLines={2}>{park.parkName}</Text>
        <Text style={styles.parkTitleSub} numberOfLines={1}>{parkSummaryLine(park)}</Text>
      </View>
    </Marker>
  );
});

const Labels = memo(function Labels({ labels }: { labels: TrailLabel[] }) {
  return (
    <>
      {labels.map((l) => (
        <NameTag key={l.key} label={l} />
      ))}
    </>
  );
});

/**
 * A trail's name on the map, flat so it reads at any angle. Native maps snapshot a marker's view;
 * Android needs it to keep redrawing until the text has laid out, then it's frozen for speed.
 * A tag that hasn't moved isn't redrawn when the map does.
 */
const NameTag = memo(
  function NameTag({ label }: { label: TrailLabel }) {
    const [track, setTrack] = useState(true);
    useEffect(() => {
      const t = setTimeout(() => setTrack(false), 600);
      return () => clearTimeout(t);
    }, []);
    return (
      <Marker
        coordinate={{ latitude: label.at.lat, longitude: label.at.lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={track}
        tappable={false}
        zIndex={2}
        accessibilityLabel={label.closed ? `${label.name}, closed` : label.name}>
        <View style={[styles.tag, label.closed && styles.tagClosed]}>
          <Text style={styles.tagText} numberOfLines={1}>{label.name}</Text>
          {label.closed ? <Text style={styles.tagClosedText}>{tr('Closed')}</Text> : null}
        </View>
      </Marker>
    );
  },
  (a, b) => a.label.key === b.label.key && a.label.name === b.label.name && a.label.closed === b.label.closed && a.label.at.lat === b.label.at.lat && a.label.at.lng === b.label.at.lng,
);

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 190,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(10,22,38,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,196,61,0.75)',
  },
  tagClosed: { borderColor: TRAIL_INK.closed },
  parkTitle: { maxWidth: 170, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(10,22,38,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center' },
  parkTitleText: { color: '#FFFFFF', fontFamily: font(800), fontSize: 13, textAlign: 'center' },
  parkTitleSub: { color: 'rgba(255,255,255,0.8)', fontFamily: font(600), fontSize: 11 },
  tagText: { color: '#FFFFFF', fontFamily: font(700), fontSize: 12, flexShrink: 1 },
  tagClosedText: { color: TRAIL_INK.closed, fontFamily: font(800), fontSize: 11, textTransform: 'uppercase' },
});
