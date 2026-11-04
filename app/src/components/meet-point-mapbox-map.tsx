import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius } from '@/constants/theme';
import type { LatLng } from '@/core/geo';
import type { TrailMap } from '@/hooks/use-trail-map';
import { MapboxMap, MapboxMarker, type MapboxMapHandle } from './mapbox-map';

/**
 * The meeting-point map on Mapbox (Create a Ride and Create an Event, every device): tap or click
 * the satellite map to drop the meeting point, drag the pin to fine-tune it. Searching a place or
 * typing coordinates moves the pin here too.
 */
export function MeetPointMapboxMap({ value, onPick, trail }: { value: LatLng | null; onPick: (p: LatLng) => void; trail: TrailMap }) {
  const map = useRef<MapboxMapHandle>(null);
  const [ready, setReady] = useState(false);
  // Set by a click or drag here, so the map doesn't jump to a spot the rider is already looking at.
  const fromMap = useRef(false);
  const pick = (p: LatLng) => {
    fromMap.current = true;
    onPick(p);
  };

  // Follow the meeting point wherever it was set from: a search, a typed coordinate, Use My Current Location.
  useEffect(() => {
    if (!ready || !value) return;
    if (!fromMap.current) map.current?.centerOn(value, undefined, { zoom: 14, duration: 700 });
    fromMap.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, value?.lat, value?.lng]);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 320, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement }}>
        <MapboxMap
          ref={map}
          trail={trail}
          look="satellite"
          tilt={false}
          initial={value ? { center: value, zoom: 14 } : null}
          onReady={() => setReady(true)}
          onPress={pick}>
          {value ? (
            <MapboxMarker id="meet-point" at={value} anchor={{ x: 0.5, y: 0.95 }} draggable onDragEnd={pick}>
              <View accessible accessibilityLabel="Meeting point, drag to move">
                <Svg width={34} height={44} viewBox="0 0 34 44">
                  <Path d="M17 42C17 42 3 26.5 3 16.5a14 14 0 0 1 28 0C31 26.5 17 42 17 42Z" fill={Colors.accent} stroke={Colors.background} strokeWidth={3} />
                  <Circle cx={17} cy={16.5} r={5.5} fill="#FFFFFF" />
                </Svg>
              </View>
            </MapboxMarker>
          ) : null}
        </MapboxMap>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {value ? 'Drag the pin to fine-tune the spot.' : `${Platform.OS === 'web' ? 'Click' : 'Tap'} the map to drop the meeting point, or search above.`}
      </ThemedText>
    </View>
  );
}
