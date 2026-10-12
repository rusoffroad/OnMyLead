import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import { ll, satelliteMap } from '@/lib/web-map';

const PIN = `<div class="oml-meet"><svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 42C17 42 3 26.5 3 16.5a14 14 0 0 1 28 0C31 26.5 17 42 17 42Z" fill="${Colors.accent}" stroke="${Colors.background}" stroke-width="3"/><circle cx="17" cy="16.5" r="5.5" fill="#FFFFFF"/></svg></div>`;

/**
 * Create a Ride on the website: click the satellite map to drop the meeting point, drag the pin
 * to fine-tune it. Searching a place or typing coordinates moves the pin here too.
 */
export function MeetPointMap({ value, onPick }: { value: LatLng | null; onPick: (p: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  // Set by a click or drag here, so the map doesn't jump to a spot the rider is already looking at.
  const fromMap = useRef(false);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const m = satelliteMap(el.current!, { doubleClickZoom: false, scrollWheelZoom: 'center' });
    L.control.zoom({ position: 'topright' }).addTo(m);
    el.current!.classList.add('oml-draw');
    m.setView(value ? ll(value) : [39.5, -98.35], value ? 15 : 4);
    m.on('click', (e: L.LeafletMouseEvent) => {
      fromMap.current = true;
      pickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the meeting point wherever it was set from: a click, a search, a typed coordinate.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      pin.current = L.marker(ll(value), {
        draggable: true,
        title: 'Meeting point, drag to move',
        icon: L.divIcon({ className: '', iconSize: [34, 44], iconAnchor: [17, 42], html: PIN }),
      }).addTo(m);
      pin.current.on('dragend', () => {
        const p = pin.current!.getLatLng();
        fromMap.current = true;
        pickRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      pin.current.setLatLng(ll(value));
    }
    // A search, a typed coordinate or Use My Current Location: fly in close to it.
    if (!fromMap.current) m.setView(ll(value), Math.max(m.getZoom(), 15));
    fromMap.current = false;
  }, [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 320, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement }}>
        <div ref={el} className="omlmap" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {value ? 'Drag the pin to fine-tune the spot.' : 'Click the map to drop the meeting point, or search above.'}
      </ThemedText>
    </View>
  );
}
