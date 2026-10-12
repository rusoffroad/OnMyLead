import 'leaflet/dist/leaflet.css';

import L from 'leaflet';

import { Colors, RideColors } from '@/constants/theme';
import type { LatLng } from '@/core/geo';

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

/** Frame these points, or sit at `center` when there are too few to frame. */
export function frame(m: L.Map, points: LatLng[], center: LatLng | null, padding: L.PointExpression = [60, 60]) {
  if (points.length >= 2) m.fitBounds(L.latLngBounds(points.map(ll)), { padding, maxZoom: 16 });
  else if (points.length === 1) m.setView(ll(points[0]), 14);
  else if (center) m.setView(ll(center), 13);
  else m.setView([39.5, -98.35], 4);
}
