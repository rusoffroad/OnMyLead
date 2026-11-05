import L from 'leaflet';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { FOLLOW_FRAME_START, followCamShouldMove, followFrameAfter, followMove, type FollowFrame } from '@/core/follow-camera';
import { parkPieces } from '@/core/park-trails';
import type { LatLng } from '@/core/geo';
import { OBSTACLE_INK, type Obstacle } from '@/core/obstacles';
import type { DayLine } from '@/core/track-line';
import type { Place } from '@/core/places';
import { snapRadiusM } from '@/core/trail-router';
import { symbolLabel, waypointSymbol } from '@/core/waypoint-symbols';
import { stopNumber, stopTimeLabel, type Waypoint } from '@/core/waypoints';
import type { TrailMap } from '@/hooks/use-trail-map';
import { NavMapboxMap } from '@/components/nav-mapbox-map';
import { drawRoute, esc, frame, ll, reportRegion, satelliteMap, trailLayers } from '@/lib/web-map';
import { useDotStylePref, useOwnDotD } from '@/hooks/use-dot-size';
import { useOwnMoving } from '@/hooks/use-own-moving';
import { ownDotBox, ownDotSvg, type DotStyle } from '@/core/own-dot-art';
import { edgeZoomOn } from '@/hooks/use-edge-zoom';
import { blaze, stopSign } from './waypoint-map.web';
import { t as tr } from '@/lib/i18n';

export type NavMapHandle = { centerOn: (p: LatLng) => void; fit: (points: LatLng[]) => void };

export const RECORD_INK = '#F6F1E3';
const MEASURE_INK = '#ECCD91';
/** Your own dot on the website's flat map, in the rider's Dot Style and Dot Size (core/own-dot-art). */
const meDotHtml = (style: DotStyle, d: number, heading: number | null | undefined, moving: boolean) =>
  `<div role="img" aria-label="${tr('You are here')}" style="display:block;pointer-events:none">${ownDotSvg(style, d, heading == null ? null : Math.round(heading), moving, 'me')}</div>`;

type NavMapProps = Parameters<typeof FlatNavMap>[0];

/** Map Mode's map: Mapbox when this build and the owner allow it and it can draw here, otherwise the flat map. */
export function NavMap(props: NavMapProps) {
  if (props.trail.mapbox) return <NavMapboxMap {...props} />;
  return <FlatNavMap {...props} />;
}

/**
 * Map Mode's map on the website: the phone's layers on Leaflet (satellite or topo, agency,
 * OpenStreetMap and rider trails), a followed trail in route red, a recorded line, and the distance
 * finder. A click measures while measuring; otherwise it shows the trail under it.
 */
function FlatNavMap({
  trail, recorded, following, measure, measureTaps, measuring, onMeasure, center, found, onCenter, padding, followMe, onUserMove, meHeading, meFixAt, trackLines, obstacles, onObstacle, waypoints, onPressWaypoint, onLongPressMap, ref,
}: {
  trail: TrailMap;
  recorded: LatLng[];
  following: LatLng[] | null;
  measure: LatLng[];
  measureTaps: LatLng[];
  measuring: boolean;
  onMeasure: (p: LatLng, snapM: number) => void;
  center: LatLng | null;
  found?: Place | null;
  onCenter?: (c: LatLng) => void;
  padding?: [number, number, number, number];
  /** Follow-me camera: while set, the map keeps this spot in the open map between the panels. */
  followMe?: LatLng | null;
  /** The rider dragged the map by hand. */
  onUserMove?: () => void;
  /** Which way the rider is moving (core/heading riderHeading), for the arrow on their dot. */
  meHeading?: number | null;
  /** The rider's newest fix's own time (ms), so a repeated fix is ignored. */
  meFixAt?: number | null;
  /** Track Line: where the rider has been, one colour per day, oldest first. */
  trackLines?: DayLine[];
  /** Named spots on the trail being drawn, recorded or followed. */
  obstacles?: Obstacle[];
  onObstacle?: (o: Obstacle) => void;
  /** Waypoints on the map: Map Mode's own, and the ride's when the rider is on a live group ride. */
  waypoints?: Waypoint[];
  onPressWaypoint?: (w: Waypoint) => void;
  /** Press and hold (right-click on the website): when set, called instead of looking up the trail there. */
  onLongPressMap?: (p: LatLng) => void;
  ref?: Ref<NavMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tracks = useRef<ReturnType<typeof trailLayers> | null>(null);
  const centered = useRef(false);
  // The rider dragged the map before their location was known: don't pull it back to them.
  const userMoved = useRef(false);
  const followed = useRef<LatLng | null>(null);
  const followFrame = useRef<FollowFrame>(FOLLOW_FRAME_START);
  const meDot = useRef<L.Marker | null>(null);
  const cb = useRef({ measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter, onUserMove, onObstacle, onPressWaypoint, onLongPressMap });
  useEffect(() => {
    cb.current = { measuring, onMeasure, identifyAt: trail.identifyAt, onRegion: trail.onRegion, onCenter, onUserMove, onObstacle, onPressWaypoint, onLongPressMap };
  }, [measuring, onMeasure, trail.identifyAt, trail.onRegion, onCenter, onUserMove, onObstacle, onPressWaypoint, onLongPressMap]);
  const pad = padding ?? [120, 40, 320, 40];
  const fitPadding = { paddingTopLeft: [pad[3], pad[0]] as L.PointTuple, paddingBottomRight: [pad[1], pad[2]] as L.PointTuple };
  const snapM = (m: L.Map) => snapRadiusM((156_543.03 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** m.getZoom());

  useImperativeHandle(ref, () => ({
    centerOn(p) {
      followed.current = p;
      followFrame.current = FOLLOW_FRAME_START;
      map.current?.setView(ll(p), Math.max(map.current.getZoom(), 14), { animate: true });
    },
    fit(points) {
      if (points.length >= 2) map.current?.fitBounds(L.latLngBounds(points.map(ll)), { ...fitPadding, maxZoom: 16 });
    },
  }));

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false });
    L.control.zoom({ position: 'topright' }).addTo(m);
    tracks.current = trailLayers(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.measuring) cb.current.onMeasure({ lat: e.latlng.lat, lng: e.latlng.lng }, snapM(m));
      else cb.current.identifyAt(e.latlng.lat, e.latlng.lng);
    });
    // Right-click, or press and hold on a touch screen (Leaflet sends both as contextmenu): a waypoint there.
    m.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent?.preventDefault?.();
      cb.current.onLongPressMap?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    const report = () => {
      const c = m.getCenter();
      cb.current.onCenter?.({ lat: c.lat, lng: c.lng });
      reportRegion(m, cb.current.onRegion);
    };
    m.on('moveend', report);
    m.on('dragstart', () => {
      userMoved.current = true;
      cb.current.onUserMove?.();
    });
    frame(m, [], center);
    map.current = m;
    report();
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once; later changes redraw below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!center || centered.current || userMoved.current || !map.current) return;
    centered.current = true;
    map.current.setView(ll(center), 13);
  }, [center]);

  // The rider's own spot (the phone maps draw it themselves), at the rider's Dot Size.
  const meD = useOwnDotD();
  const [meStyle] = useDotStylePref();
  // Moving or stopped by the same rule as every other map; stopped, the dot keeps pointing the
  // last way the rider was heading (the website has no compass).
  const [meMoving, feedMe] = useOwnMoving();
  useEffect(() => {
    if (center) feedMe(meHeading != null, meFixAt ?? undefined);
  }, [center, meHeading, meFixAt, feedMe]);
  const lastMeHeading = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!center) {
      meDot.current?.remove();
      meDot.current = null;
      return;
    }
    if (meHeading != null) lastMeHeading.current = meHeading;
    const box = ownDotBox(meD);
    const icon = L.divIcon({ className: '', iconSize: [box, box], iconAnchor: [box / 2, box / 2], html: meDotHtml(meStyle, meD, lastMeHeading.current, meMoving) });
    if (meDot.current) {
      meDot.current.setLatLng(ll(center));
      meDot.current.setIcon(icon);
    } else {
      meDot.current = L.marker(ll(center), { interactive: false, keyboard: false, zIndexOffset: 1000, icon }).addTo(m);
    }
  }, [center, meHeading, meMoving, meD, meStyle]);

  // Follow-me camera: pan (same zoom) so the spot sits in the open map between the panels.
  useEffect(() => {
    const m = map.current;
    if (!followMe) {
      followed.current = null;
      followFrame.current = FOLLOW_FRAME_START;
      return;
    }
    if (!m || !followCamShouldMove(followed.current, followMe)) return;
    followed.current = followMe;
    // The dot rides through the middle; near an edge the map zooms out once, then moves (core/follow-camera).
    const sz = m.getSize();
    const move = followMove(followFrame.current, {
      pt: m.latLngToContainerPoint(ll(followMe)), size: { width: sz.x, height: sz.y },
      inset: { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] }, zoom: m.getZoom(), screenHeadingDeg: null, noZoomOut: !edgeZoomOn(),
    });
    followFrame.current = followFrameAfter(followFrame.current, move);
    if (move.kind === 'zoom-out') m.setZoom(move.zoom, { animate: true });
    if (move.kind !== 'pan') return;
    const z = m.getZoom();
    const p = m.project(ll(followMe), z).add([(pad[1] - pad[3]) / 2, (pad[2] - pad[0]) / 2]);
    m.panTo(m.unproject(p, z), { animate: true, duration: 0.6 });
    // Only when the followed spot moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followMe]);

  useEffect(() => {
    el.current?.classList.toggle('oml-draw', measuring);
  }, [measuring]);

  const riderLines = useMemo(() => trail.riderTrails.map((t) => t.points), [trail.riderTrails]);
  const parkLines = useMemo(() => parkPieces(trail.parkTrails), [trail.parkTrails]);
  const { base, trails, agencyLayers, osmLines, closedLines, labels } = trail;
  useEffect(() => {
    tracks.current?.update({ base, trails, agencyLayers, osmLines, closedLines, labels, riderLines, parkPieces: parkLines, parkLabels: trail.parkLabels, parks: trail.parks });
  }, [base, trails, agencyLayers, osmLines, closedLines, labels, riderLines, parkLines, trail.parkLabels, trail.parks]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const d of trackLines ?? []) {
      for (const piece of d.pieces) L.polyline(piece.map(ll), { color: d.color, weight: 4, opacity: 0.95, interactive: false }).addTo(g);
    }
    if (following && following.length > 1) drawRoute(g, following, true);
    if (recorded.length > 1) {
      L.polyline(recorded.map(ll), { color: Colors.background, weight: 8, interactive: false }).addTo(g);
      L.polyline(recorded.map(ll), { color: RECORD_INK, weight: 4.5, interactive: false }).addTo(g);
    }
    if (measure.length > 1) {
      L.polyline(measure.map(ll), { color: Colors.background, weight: 7, interactive: false }).addTo(g);
      L.polyline(measure.map(ll), { color: MEASURE_INK, weight: 3.5, dashArray: '8 5', interactive: false }).addTo(g);
    }
    measureTaps.forEach((p, i) => {
      L.marker(ll(p), {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: `<div class="oml-tap">${i + 1}</div>` }),
      }).addTo(g);
    });
    for (const w of waypoints ?? []) {
      const n = w.planned_stop ? stopNumber(w, waypoints ?? []) : null;
      const symbol = waypointSymbol(w);
      const time = w.planned_stop ? stopTimeLabel(w.stop_time) : null;
      const cls = w.planned_stop ? 'stop' : w.shared ? 'shared' : '';
      const size = w.planned_stop ? 34 : 30;
      L.marker(ll(w), {
        icon: L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div class="oml-wp ${cls}" style="width:${size}px;height:${size}px">${w.planned_stop ? stopSign(n, symbol) : blaze(w.shared, symbol)}<span>${esc(w.name)}${time ? `<small>${esc(time)}</small>` : ''}</span></div>`,
        }),
        title: w.planned_stop ? tr('Planned stop {v}, {name}, {v2}', { v: n ?? '', name: w.name, v2: symbolLabel(symbol) }) : tr('{v} waypoint, {name}', { v: symbolLabel(symbol), name: w.name }),
        zIndexOffset: w.planned_stop ? 500 : w.shared ? 400 : 300,
      })
        .on('click', () => cb.current.onPressWaypoint?.(w))
        .addTo(g);
    }
    for (const o of obstacles ?? []) {
      const pin = L.marker(ll(o), {
        keyboard: true,
        title: o.name,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div class="oml-found" style="pointer-events:auto;cursor:pointer"><span style="background:rgba(10,22,38,.92);color:#F1F4F8;border:1.5px solid ${OBSTACLE_INK[o.kind]}">${esc(o.name)}</span></div>`,
        }),
      }).addTo(g);
      pin.on('click', () => cb.current.onObstacle?.(o));
    }
    for (const w of waypoints ?? []) {
      const symbol = waypointSymbol(w);
      const size = w.planned_stop ? 34 : 30;
      const time = w.planned_stop ? stopTimeLabel(w.stop_time) : null;
      const n = w.planned_stop ? stopNumber(w, waypoints ?? []) : null;
      L.marker(ll(w), {
        title: w.planned_stop ? tr('Planned stop {v}, {name}', { v: n ?? '', name: w.name }) : tr('{v} waypoint, {name}', { v: symbolLabel(symbol), name: w.name }),
        zIndexOffset: 400,
        icon: L.divIcon({
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div class="oml-wp ${w.planned_stop ? 'stop' : w.shared ? 'shared' : ''}" style="width:${size}px;height:${size}px">${w.planned_stop ? stopSign(n, symbol) : blaze(w.shared, symbol)}<span>${esc(w.name)}${time ? `<small>${esc(time)}</small>` : ''}</span></div>`,
        }),
      })
        .on('click', () => cb.current.onPressWaypoint?.(w))
        .addTo(g);
    }
    if (found) {
      L.marker(ll(found), {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="oml-found"><span>${esc(found.name)}</span></div>` }),
      }).addTo(g);
    }
  }, [following, recorded, measure, measureTaps, found, trackLines, obstacles, waypoints]);

  useEffect(() => {
    if (!found || !map.current) return;
    const b = found.bounds;
    const area: L.LatLngBoundsExpression = b ? [[b.south, b.west], [b.north, b.east]] : [ll(found), ll(found)];
    map.current.flyToBounds(area, { ...fitPadding, maxZoom: b ? 16 : 15, duration: 0.9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <div ref={el} className="omlmap oml-full" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
    </View>
  );
}
