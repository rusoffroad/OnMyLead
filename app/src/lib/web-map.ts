import 'leaflet/dist/leaflet.css';

import L from 'leaflet';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { OSM_ATTRIBUTION, type OsmTrail, type TrailLabel } from '@/core/osm-trails';
import {
  fillTemplate, TOPO_ATTRIBUTION, TOPO_MAX_NATIVE_Z, TRAIL_INK, TRAIL_SOURCE_IDS, TRAIL_SOURCES, TRAILS_MIN_Z, trailTileTemplate, USGS_TOPO,
  type BaseMap, type ClosedLine,
} from '@/core/trails';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Leaflet draws its own popups, controls and pins in HTML; restyle them in the app's dark palette.
const CSS = `
.omlmap { background: ${Colors.backgroundElement}; font-family: Barlow_500Medium, system-ui, sans-serif; }
.omlmap.oml-draw { cursor: crosshair; }
.omlmap .leaflet-popup-content-wrapper { background: ${Colors.backgroundElement}; color: ${Colors.text}; border: 1px solid ${Colors.border}; border-radius: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
.omlmap .leaflet-popup-tip { background: ${Colors.backgroundElement}; border: 1px solid ${Colors.border}; }
.omlmap .leaflet-popup-content { margin: 12px 14px; width: 200px !important; }
.omlmap .leaflet-popup-close-button { color: ${Colors.textSecondary} !important; }
.omlmap .leaflet-control-attribution { background: rgba(10,22,38,.7); color: ${Colors.textSecondary}; font-size: 9px; }
.omlmap .leaflet-control-attribution a { color: ${Colors.textSecondary}; }
.omlmap .leaflet-bar { border: 1px solid ${Colors.border}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.omlmap .leaflet-bar a { width: 40px; height: 40px; line-height: 38px; font-size: 22px; background: rgba(10,22,38,.92); color: ${Colors.text}; border-bottom-color: ${Colors.border}; }
.omlmap .leaflet-bar a:hover { background: ${Colors.backgroundElement}; color: ${Colors.text}; }
.omlmap .leaflet-bar a.leaflet-disabled { background: rgba(10,22,38,.92); color: ${Colors.textSecondary}; opacity: .5; }
@media (max-width: 899px) { .omlmap.oml-full .leaflet-top { margin-top: 70px; } }
/* Full-screen maps carry the Map Layers button top right; the zoom buttons sit under it. */
.omlmap.oml-full .leaflet-top.leaflet-right { margin-top: 118px; }
.oml-pin { position: relative; width: 30px; height: 30px; }
.oml-pin i { position: absolute; left: 6px; top: 6px; width: 12px; height: 12px; border-radius: 50%; border: 3px solid ${Colors.background}; }
.oml-pin b { position: absolute; inset: 0; border-radius: 50%; background: ${Colors.accent}; opacity: .3; }
.oml-pop .live { color: ${Colors.accent}; font-family: Barlow_700Bold, sans-serif; font-size: 13px; }
.oml-pop .t { font-family: BarlowCondensed_700Bold, sans-serif; font-size: 19px; line-height: 22px; color: ${Colors.text}; }
.oml-pop .s { color: ${Colors.textSecondary}; font-size: 14px; margin-top: 2px; }
.oml-pop button { all: unset; cursor: pointer; color: ${Colors.sky}; font-family: Barlow_700Bold, sans-serif; font-size: 14px; margin-top: 6px; display: inline-block; }
.oml-tap { box-sizing: border-box; min-width: 26px; height: 26px; border-radius: 13px; padding: 0 4px; display: flex; align-items: center; justify-content: center;
  background: ${Colors.background}; border: 2.5px solid ${Colors.accent}; color: #fff; font: 12px Barlow_800ExtraBold, sans-serif; cursor: grab; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.oml-tap.first { background: ${RideColors.green}; border-color: ${Colors.background}; }
.oml-tap.last { background: ${Colors.text}; border-color: ${Colors.background}; color: ${Colors.background}; }
.oml-end { box-sizing: border-box; width: 20px; height: 20px; border-radius: 10px; border: 3px solid ${Colors.background}; display: flex; align-items: center; justify-content: center; }
.oml-end i { width: 6px; height: 6px; border-radius: 3px; background: ${Colors.background}; }
.oml-wp { position: relative; width: 30px; height: 30px; }
.oml-wp svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
.oml-wp span { position: absolute; left: 34px; top: 4px; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis;
  padding: 1px 6px; border-radius: 6px; background: rgba(10,22,38,.82); border: 1px solid rgba(241,244,248,.35); color: ${Colors.text}; font: 12px Barlow_700Bold, sans-serif; }
.oml-wp.shared span { border-color: ${Colors.sky}; }
.oml-wp.stop span { border-color: ${Colors.accent}; font-family: Barlow_800ExtraBold, sans-serif; font-size: 13px; }
.oml-wp.stop span small { display: block; color: ${Colors.textSecondary}; font: 11px Barlow_700Bold, sans-serif; }
.oml-found { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.oml-found span { white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; padding: 3px 9px; border-radius: 10px;
  background: #ECCD91; color: ${Colors.background}; font: 13px Barlow_700Bold, sans-serif; box-shadow: 0 3px 10px rgba(0,0,0,.5); }
.oml-found::after { content: ''; width: 2px; height: 10px; background: #ECCD91; }
.oml-found::before { content: ''; order: 3; width: 10px; height: 10px; margin-bottom: -5px; border-radius: 50%; background: #ECCD91; border: 2px solid ${Colors.background}; box-sizing: border-box; }
.oml-trail-tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 5px; white-space: nowrap; max-width: 220px;
  padding: 1px 7px; border-radius: 6px; background: rgba(10,22,38,.86); border: 1px solid rgba(255,196,61,.75); color: #fff; font: 12px Barlow_700Bold, sans-serif; pointer-events: none; }
.oml-trail-tag span { overflow: hidden; text-overflow: ellipsis; }
.oml-trail-tag.closed { border-color: ${TRAIL_INK.closed}; }
.oml-trail-tag b { color: ${TRAIL_INK.closed}; font: 11px Barlow_800ExtraBold, sans-serif; text-transform: uppercase; }
.oml-meet { width: 34px; height: 44px; }
.oml-meet svg { display: block; filter: drop-shadow(0 3px 4px rgba(0,0,0,.55)); }
`;

export function injectMapCss() {
  if (document.getElementById('omlmap-css')) return;
  const el = document.createElement('style');
  el.id = 'omlmap-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** A satellite map with place names, the same imagery as Find a Ride (allowed in deploy/security-headers.conf). */
export function satelliteMap(el: HTMLElement, opts: L.MapOptions = {}): L.Map {
  injectMapCss();
  const m = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, ...opts });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    maxNativeZoom: 18,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  }).addTo(m);
  // Road lines and names, then place names: what the phones' hybrid satellite map shows.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18 }).addTo(m);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18 }).addTo(m);
  m.attributionControl.setPrefix(false);
  return m;
}

export const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

/** The ride's route: logo red over a navy casing, like the phone, with green start and finish ring. */
export function drawRoute(g: L.LayerGroup, points: LatLng[], ends = true) {
  if (points.length < 2) return;
  const line = points.map(ll);
  L.polyline(line, { color: Colors.background, weight: 9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(g);
  L.polyline(line, { color: Colors.accent, weight: 5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(g);
  if (!ends) return;
  const end = (p: LatLng, bg: string, core: boolean, title: string) =>
    L.marker(ll(p), {
      title,
      interactive: false,
      icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: `<div class="oml-end" style="background:${bg}">${core ? '<i></i>' : ''}</div>` }),
    }).addTo(g);
  end(points[0], RideColors.green, false, 'Start');
  end(points[points.length - 1], Colors.text, true, 'Finish');
}

/** Navy casing, then the line: amber dashes for trails, red dashes (barricade tape) for closed ones. */
function casedLine(g: L.LayerGroup, part: LatLng[], closed: boolean) {
  const line = part.map(ll);
  L.polyline(line, { color: TRAIL_INK.casing, weight: 6.5, interactive: false }).addTo(g);
  L.polyline(line, { color: closed ? TRAIL_INK.closed : TRAIL_INK.trail, weight: 3.2, dashArray: closed ? '5 5' : '9 5', interactive: false }).addTo(g);
}

/** OpenStreetMap trails, like the phone's trail layer. */
export function drawOsmTracks(g: L.LayerGroup, lines: OsmTrail[]) {
  for (const t of lines) for (const part of t.parts) casedLine(g, part, t.closed);
}

/** Forest Service routes closed for the season today. */
export function drawClosedLines(g: L.LayerGroup, lines: ClosedLine[]) {
  for (const l of lines) for (const part of l.parts) casedLine(g, part, true);
}

export function drawTrailLabels(g: L.LayerGroup, labels: TrailLabel[]) {
  for (const l of labels) {
    L.marker(ll(l.at), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div class="oml-trail-tag${l.closed ? ' closed' : ''}"><span>${esc(l.name)}</span>${l.closed ? '<b>Closed</b>' : ''}</div>`,
      }),
    }).addTo(g);
  }
}

/** An agency layer drawn by its own map server, one exported image per square (the phone's WMSTile). */
class BoxTiles extends L.TileLayer {
  constructor(private readonly template: string, options: L.TileLayerOptions) {
    super('', options);
  }

  getTileUrl(c: L.Coords): string {
    return fillTemplate(this.template, { z: c.z, x: c.x, y: c.y });
  }
}

export type TrailLayerState = {
  base: BaseMap;
  trails: boolean;
  osmLines: OsmTrail[];
  closedLines: ClosedLine[];
  labels: TrailLabel[];
};

/**
 * The phone's trail layers on a Leaflet map: the USGS topo base, the Forest Service and BLM lines
 * (names and closures are drawn into their squares), OpenStreetMap tracks with their name tags, and
 * today's seasonal closures. Call update with the map's useTrailMap state after each change. The
 * routes and pins a screen draws go in layer groups added after this, so they stay on top.
 */
export function trailLayers(m: L.Map) {
  // Topo covers the satellite imagery and its place names; the agency lines sit on either.
  m.createPane('oml-topo').style.zIndex = '250';
  m.createPane('oml-agency').style.zIndex = '300';
  const topo = L.tileLayer(USGS_TOPO, { pane: 'oml-topo', maxZoom: 19, maxNativeZoom: TOPO_MAX_NATIVE_Z, attribution: TOPO_ATTRIBUTION });
  const agency = TRAIL_SOURCE_IDS.map(
    (id) => new BoxTiles(trailTileTemplate(TRAIL_SOURCES[id]), { pane: 'oml-agency', minZoom: TRAILS_MIN_Z, maxZoom: 19, attribution: TRAIL_SOURCES[id].attribution }),
  );
  const lines = L.layerGroup().addTo(m);
  const tags = L.layerGroup().addTo(m);
  const show = (layer: L.Layer, on: boolean) => {
    if (on && !m.hasLayer(layer)) layer.addTo(m);
    if (!on && m.hasLayer(layer)) layer.remove();
  };
  return {
    update(t: TrailLayerState) {
      show(topo, t.base === 'topo');
      for (const a of agency) show(a, t.trails);
      lines.clearLayers();
      tags.clearLayers();
      if (!t.trails) {
        m.attributionControl.removeAttribution(OSM_ATTRIBUTION);
        return;
      }
      drawOsmTracks(lines, t.osmLines);
      drawClosedLines(lines, t.closedLines);
      drawTrailLabels(tags, t.labels);
      if (t.osmLines.length) m.attributionControl.addAttribution(OSM_ATTRIBUTION);
      else m.attributionControl.removeAttribution(OSM_ATTRIBUTION);
    },
  };
}

/** What the map shows, for useTrailMap's onRegion (the real zoom: a browser window shows far more than a phone). */
export function reportRegion(m: L.Map, onRegion?: (r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, zoom?: number) => void) {
  const b = m.getBounds();
  const c = b.getCenter();
  onRegion?.({ latitude: c.lat, longitude: c.lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() }, m.getZoom());
}

/** Frame these points, or sit at `center` when there are too few to frame. */
export function frame(m: L.Map, points: LatLng[], center: LatLng | null, padding: L.PointExpression = [60, 60]) {
  if (points.length >= 2) m.fitBounds(L.latLngBounds(points.map(ll)), { padding, maxZoom: 16 });
  else if (points.length === 1) m.setView(ll(points[0]), 14);
  else if (center) m.setView(ll(center), 13);
  else m.setView([39.5, -98.35], 4);
}
