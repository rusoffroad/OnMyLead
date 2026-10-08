import { useEffect, useRef } from 'react';
import MapView, { Callout, Marker } from 'react-native-maps';
import { Text, View } from 'react-native';

import type { Bounds } from '@/core/discovery';
import { regionFor } from '@/core/discovery';
import type { Ride } from '@/lib/types';

/**
 * Public rides as pins on a map. Pins sit on the rounded meeting area, never the exact spot.
 * The web build uses rides-map.web.tsx (a native map is not available there).
 */
export function RidesMap({
  rides, bounds, onOpen, height = 320,
}: {
  rides: Ride[];
  bounds: Bounds;
  onOpen: (ride: Ride) => void;
  height?: number;
}) {
  const map = useRef<MapView>(null);

  useEffect(() => {
    map.current?.animateToRegion(regionFor(bounds), 300);
  }, [bounds]);

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <MapView ref={map} style={{ flex: 1 }} initialRegion={regionFor(bounds)} showsUserLocation mapType="hybrid">
        {rides.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.meet_area_lat, longitude: r.meet_area_lng }}
            pinColor={r.status === 'live' ? '#E03131' : '#1C7ED6'}>
            <Callout onPress={() => onOpen(r)}>
              <View style={{ maxWidth: 220, padding: 4 }}>
                <Text style={{ fontWeight: '700' }}>{r.status === 'live' ? 'LIVE · ' : ''}{r.name}</Text>
                <Text>
                  {new Date(r.meet_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={{ color: '#1C7ED6', marginTop: 2 }}>Tap to open</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
