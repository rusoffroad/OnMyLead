import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { MapControls, MapOverlay, meetsLabel, pinColor, type RidesMapProps } from '@/components/rides-map-chrome';
import { Colors, Radius } from '@/constants/theme';
import { regionMoved, type Bounds } from '@/core/discovery';

const toLatLngBounds = (b: Bounds) => L.latLngBounds([b.minLat, b.minLng], [b.maxLat, b.maxLng]);
const fromLatLngBounds = (b: L.LatLngBounds): Bounds => ({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Leaflet draws its own popups and controls in HTML; restyle them in the app's dark palette.
const CSS = `
.omlmap { background: ${Colors.backgroundElement}; font-family: Barlow_500Medium, system-ui, sans-serif; }
.omlmap .leaflet-popup-content-wrapper { background: ${Colors.backgroundElement}; color: ${Colors.text}; border: 1px solid ${Colors.border}; border-radius: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
.omlmap .leaflet-popup-tip { background: ${Colors.backgroundElement}; border: 1px solid ${Colors.border}; }
.omlmap .leaflet-popup-content { margin: 12px 14px; width: 200px !important; }
.omlmap .leaflet-popup-close-button { color: ${Colors.textSecondary} !important; }
.omlmap .leaflet-control-attribution { background: rgba(10,22,38,.7); color: ${Colors.textSecondary}; font-size: 9px; }
.omlmap .leaflet-control-attribution a { color: ${Colors.textSecondary}; }
.oml-pin { position: relative; width: 30px; height: 30px; }
.oml-pin i { position: absolute; left: 6px; top: 6px; width: 12px; height: 12px; border-radius: 50%; border: 3px solid ${Colors.background}; }
.oml-pin b { position: absolute; inset: 0; border-radius: 50%; background: ${Colors.accent}; opacity: .3; }
.oml-pop .live { color: ${Colors.accent}; font-family: Barlow_700Bold, sans-serif; font-size: 13px; }
.oml-pop .t { font-family: BarlowCondensed_700Bold, sans-serif; font-size: 19px; line-height: 22px; color: ${Colors.text}; }
.oml-pop .s { color: ${Colors.textSecondary}; font-size: 14px; margin-top: 2px; }
.oml-pop button { all: unset; cursor: pointer; color: ${Colors.sky}; font-family: Barlow_700Bold, sans-serif; font-size: 14px; margin-top: 6px; display: inline-block; }
`;

function injectCss() {
  if (document.getElementById('omlmap-css')) return;
  const el = document.createElement('style');
  el.id = 'omlmap-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** The Find a ride map on the web: satellite imagery with place names, same pins and controls as the phone. */
export function RidesMap({ rides, frame, frameKey, circle, title, onPressTitle, onOpen, onSearchArea, height = 400 }: RidesMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const anchor = useRef<Bounds>(frame);
  const settling = useRef(true);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);
  const [moved, setMoved] = useState(false);

  const flyTo = (b: Bounds) => {
    settling.current = true;
    map.current?.fitBounds(toLatLngBounds(b), { animate: true });
  };

  useEffect(() => {
    injectCss();
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    }).addTo(m);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    m.on('moveend', () => {
      const now = fromLatLngBounds(m.getBounds());
      if (settling.current) {
        settling.current = false;
        anchor.current = now;
        setMoved(false);
      } else {
        setMoved(regionMoved(anchor.current, now));
      }
    });
    m.fitBounds(toLatLngBounds(frame));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once; frame changes fly it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flyTo(frame), [frameKey]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (circle) {
      L.circle([circle.center.lat, circle.center.lng], {
        radius: circle.miles * 1609.344, color: Colors.sky, weight: 2, fillColor: Colors.sky, fillOpacity: 0.1,
      }).addTo(g);
    }
    for (const r of rides) {
      const icon = L.divIcon({
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: `<div class="oml-pin">${r.status === 'live' ? '<b></b>' : ''}<i style="background:${pinColor(r)}"></i></div>`,
      });
      const pop = document.createElement('div');
      pop.className = 'oml-pop';
      const away = r.distanceMi != null ? `, ${r.distanceMi < 1 ? 'under 1' : Math.round(r.distanceMi)} mi away` : '';
      pop.innerHTML = `${r.status === 'live' ? '<div class="live">Live now</div>' : ''}<div class="t">${esc(r.name)}</div><div class="s">${esc(meetsLabel(r))}${away}</div><button>Open ride</button>`;
      pop.querySelector('button')!.addEventListener('click', () => openRef.current(r));
      L.marker([r.meet_area_lat, r.meet_area_lng], { icon, title: r.name, zIndexOffset: r.status === 'live' ? 1000 : 0 }).bindPopup(pop, { closeButton: false, offset: [0, -8] }).addTo(g);
    }
  }, [rides, circle]);

  return (
    <View style={{ height, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement }}>
      <div ref={el} className="omlmap" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <MapOverlay
        title={title}
        onPressTitle={onPressTitle}
        count={rides.length}
        moved={moved}
        onSearch={
          onSearchArea
            ? () => {
                if (!map.current) return;
                anchor.current = fromLatLngBounds(map.current.getBounds());
                setMoved(false);
                onSearchArea(anchor.current);
              }
            : undefined
        }
      />
      <MapControls onZoomIn={() => map.current?.zoomIn()} onZoomOut={() => map.current?.zoomOut()} onRecenter={() => flyTo(frame)} />
    </View>
  );
}
