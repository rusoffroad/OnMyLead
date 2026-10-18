import { Fragment, memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker, Polyline, UrlTile, WMSTile } from 'react-native-maps';

import { IMAGERY_MAX_NATIVE_Z, USGS_IMAGERY } from '@/core/offline-maps';
import { font } from '@/constants/theme';
import type { OsmTrail, TrailLabel } from '@/core/osm-trails';
import {
  TOPO_MAX_NATIVE_Z, TRAIL_INK, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate, USGS_TOPO, type BaseMap, type ClosedLine,
} from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';
import { TILE_MAX_AGE_S, tileCachePath } from '@/lib/trail-tiles';

const TEMPLATES = Object.fromEntries(TRAIL_SOURCE_IDS.map((id) => [id, trailTileTemplate(TRAIL_SOURCES[id])]));

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
  const { trails, offline } = trail;
  return (
    <>
      {base === 'satellite' && offline ? (
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
      {trails
        ? TRAIL_SOURCE_IDS.map((id) => (
            <WMSTile
              key={id}
              urlTemplate={TEMPLATES[id]}
              minimumZ={TRAILS_MIN_Z}
              tileCachePath={tileCachePath(id)}
              tileCacheMaxAge={TILE_MAX_AGE_S}
              offlineMode={offline}
              zIndex={-1}
            />
          ))
        : null}
      {trails && trail.osmLines.length ? <OsmLines lines={trail.osmLines} /> : null}
      {trails && trail.closedLines.length ? <ClosedLines lines={trail.closedLines} /> : null}
      {trails && trail.labels.length ? <Labels labels={trail.labels} /> : null}
    </>
  );
}

type Part = OsmTrail['parts'][number];
const coords = (part: Part) => part.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/** Navy casing, then the line: closed lines are red dashes, which read as red and navy barricade tape. */
function Cased({ part, closed }: { part: Part; closed: boolean }) {
  const c = coords(part);
  return (
    <>
      <Polyline coordinates={c} strokeColor={TRAIL_INK.casing} strokeWidth={6.5} zIndex={0} tappable={false} />
      <Polyline
        coordinates={c}
        strokeColor={closed ? TRAIL_INK.closed : TRAIL_INK.trail}
        strokeWidth={3.2}
        lineDashPattern={closed ? [5, 5] : [9, 5]}
        zIndex={closed ? 1 : 0}
        tappable={false}
      />
    </>
  );
}

/**
 * OpenStreetMap dirt tracks (core/osm-trails) drawn in the same amber dash as the agency trails,
 * so a rider sees one kind of line for "dirt you can follow" whatever the source.
 */
const OsmLines = memo(function OsmLines({ lines }: { lines: OsmTrail[] }) {
  return (
    <>
      {lines.map((t) =>
        t.parts.map((part, i) => (
          <Fragment key={`${t.key}-${i}`}>
            <Cased part={part} closed={t.closed} />
          </Fragment>
        )),
      )}
    </>
  );
});

/** Forest Service routes closed for the season today, over the agency's own (open-colored) line. */
const ClosedLines = memo(function ClosedLines({ lines }: { lines: ClosedLine[] }) {
  return (
    <>
      {lines.map((l) =>
        l.parts.map((part, i) => (
          <Fragment key={`${l.key}-${i}`}>
            <Cased part={part} closed />
          </Fragment>
        )),
      )}
    </>
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
 */
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
        {label.closed ? <Text style={styles.tagClosedText}>Closed</Text> : null}
      </View>
    </Marker>
  );
}

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
  tagText: { color: '#FFFFFF', fontFamily: font(700), fontSize: 12, flexShrink: 1 },
  tagClosedText: { color: TRAIL_INK.closed, fontFamily: font(800), fontSize: 11, textTransform: 'uppercase' },
});
