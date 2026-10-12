import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { MapControls, MapOverlay, meetsLabel, pinColor, type RidesMapProps } from '@/components/rides-map-chrome';
import { Colors, Radius } from '@/constants/theme';
import { regionMoved, type Bounds } from '@/core/discovery';
import { esc, satelliteMap } from '@/lib/web-map';

const toLatLngBounds = (b: Bounds) => L.latLngBounds([b.minLat, b.minLng], [b.maxLat, b.maxLng]);
const fromLatLngBounds = (b: L.LatLngBounds): Bounds => ({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() });

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
    const m = satelliteMap(el.current!);
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
      pop.innerHTML = `${r.status === 'live' ? '<div class="live">Live Now</div>' : ''}<div class="t">${esc(r.name)}</div><div class="s">${esc(meetsLabel(r))}${away}</div><button>Open Ride</button>`;
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
