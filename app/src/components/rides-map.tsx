import { useEffect, useRef, useState } from 'react';
import MapView, { Callout, Circle, Marker, type Region } from 'react-native-maps';
import { View } from 'react-native';

import { TrailTiles } from '@/components/trail-tiles';
import { MapControls, MapOverlay, RideBubble, RidePin, type RidesMapProps } from '@/components/rides-map-chrome';
import { Colors, Radius } from '@/constants/theme';
import { boundsOfRegion, regionFor, regionMoved, zoomRegion } from '@/core/discovery';
import { useTrailMap } from '@/hooks/use-trail-map';

/**
 * Public rides as pins on a map the rider can pinch, pan and zoom. Opens on the rider's state.
 * Pins sit on the rounded meeting area, never the exact spot. Zoomed in, public trails and
 * off-road park tracks show too (the rider's Map Layers choice from the ride maps).
 * The web build uses rides-map.web.tsx.
 */
export function RidesMap({ rides, frame, frameKey, circle, title, onPressTitle, onOpen, onSearchArea, height = 400 }: RidesMapProps) {
  const map = useRef<MapView>(null);
  const [initial] = useState(() => regionFor(frame));
  const region = useRef<Region>(initial);
  // The region the map settled on after we last moved it, so "Search this area" shows only after the rider moves it.
  const anchor = useRef(boundsOfRegion(initial));
  const settling = useRef(true);
  const [moved, setMoved] = useState(false);
  const trail = useTrailMap();

  const flyTo = (r: Region) => {
    settling.current = true;
    map.current?.animateToRegion(r, 350);
  };

  // Fly only when the frame itself changes (a new state), not on every search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flyTo(regionFor(frame)), [frameKey]);

  const zoom = (factor: number) => map.current?.animateToRegion(zoomRegion(region.current, factor), 250);

  return (
    <View style={{ height, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundElement }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={initial}
        showsUserLocation
        showsCompass={false}
        mapType="hybrid"
        userInterfaceStyle="dark"
        onRegionChangeComplete={(r) => {
          region.current = r;
          trail.onRegion(r);
          const now = boundsOfRegion(r);
          if (settling.current) {
            settling.current = false;
            anchor.current = now;
            setMoved(false);
          } else {
            setMoved(regionMoved(anchor.current, now));
          }
        }}>
        <TrailTiles trail={trail} base="satellite" />
        {circle ? (
          <Circle
            center={{ latitude: circle.center.lat, longitude: circle.center.lng }}
            radius={circle.miles * 1609.344}
            strokeColor="rgba(59, 134, 247, 0.9)"
            fillColor="rgba(59, 134, 247, 0.10)"
            strokeWidth={2}
          />
        ) : null}
        {rides.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.meet_area_lat, longitude: r.meet_area_lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={r.status === 'live' ? 2 : 1}
            calloutAnchor={{ x: 0.5, y: 0.1 }}
            accessibilityLabel={r.name}>
            <RidePin ride={r} />
            <Callout tooltip onPress={() => onOpen(r)}>
              <RideBubble ride={r} />
            </Callout>
          </Marker>
        ))}
      </MapView>
      <MapOverlay
        title={title}
        onPressTitle={onPressTitle}
        count={rides.length}
        moved={moved}
        onSearch={
          onSearchArea
            ? () => {
                anchor.current = boundsOfRegion(region.current);
                setMoved(false);
                onSearchArea(anchor.current);
              }
            : undefined
        }
      />
      <MapControls onZoomIn={() => zoom(0.5)} onZoomOut={() => zoom(2)} onRecenter={() => flyTo(regionFor(frame))} />
    </View>
  );
}
