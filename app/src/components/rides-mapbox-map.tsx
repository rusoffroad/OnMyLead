import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { regionMoved, type Bounds } from '@/core/discovery';
import { circlePolygon } from '@/core/terrain';
import type { TrailMap } from '@/hooks/use-trail-map';
import type { Ride } from '@/lib/types';
import { MapboxMap, MapboxMarker, type MapFill, type MapboxMapHandle } from './mapbox-map';
import { mapFrameStyle, MapControls, MapOverlay, RideBubble, RidePin, type RidesMapProps } from './rides-map-chrome';
import { t } from '@/lib/i18n';

const FIT = { top: 24, right: 24, bottom: 24, left: 24 };

/**
 * Find a Ride's map on Mapbox (apps and website): public rides as pins on satellite, a bubble over
 * the tapped one, the search ring, and the same Full Map, zoom and back-to-my-state buttons as
 * the flat map (rides-map.tsx). Always satellite here, whatever the rider's Map Style.
 */
export function RidesMapboxMap({
  rides, frame, frameKey, circle, title, onPressTitle, onOpen, onSearchArea, height = 400, full, onToggleFull, trail,
}: RidesMapProps & { trail: TrailMap }) {
  const map = useRef<MapboxMapHandle>(null);
  const [ready, setReady] = useState(false);
  // The edges the map settled on after we last moved it, so "Search this area" shows only after the rider moves it.
  const anchor = useRef<Bounds>(frame);
  const now = useRef<Bounds>(frame);
  const settling = useRef(true);
  const [moved, setMoved] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const corners = (b: Bounds) => [{ lat: b.minLat, lng: b.minLng }, { lat: b.maxLat, lng: b.maxLng }];
  const flyTo = (b: Bounds) => {
    settling.current = true;
    map.current?.fit(corners(b), FIT);
  };

  // Fly only when the frame itself changes (a new state), not on every search.
  useEffect(() => {
    if (ready) flyTo(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, frameKey]);

  const fills = useMemo<MapFill[]>(
    () => (circle ? [{ id: 'radius', polygon: circlePolygon(circle.center, circle.miles * 1609.344), color: Colors.sky, opacity: 0.1, stroke: Colors.sky, strokeWidth: 2 }] : []),
    [circle],
  );
  const picked = open ? rides.find((r) => r.id === open) ?? null : null;

  return (
    <View style={mapFrameStyle(height, full)}>
      <MapboxMap
        ref={map}
        trail={trail}
        look="satellite"
        tilt={false}
        compass={false}
        initial={{ center: { lat: (frame.minLat + frame.maxLat) / 2, lng: (frame.minLng + frame.maxLng) / 2 }, zoom: 5 }}
        fills={fills}
        onReady={() => setReady(true)}
        onPress={() => setOpen(null)}
        onIdle={(c) => {
          now.current = c.bounds;
          if (settling.current) {
            settling.current = false;
            anchor.current = c.bounds;
            setMoved(false);
          } else {
            setMoved(regionMoved(anchor.current, c.bounds));
          }
        }}>
        {rides.map((r) => (
          <MapboxMarker key={r.id} at={{ lat: r.meet_area_lat, lng: r.meet_area_lng }}>
            <Pressable accessibilityRole="button" accessibilityLabel={r.name} onPress={() => setOpen((o) => (o === r.id ? null : r.id))}>
              <RidePin ride={r} />
            </Pressable>
          </MapboxMarker>
        ))}
        {picked ? (
          <MapboxMarker at={{ lat: picked.meet_area_lat, lng: picked.meet_area_lng }} anchor={{ x: 0.5, y: 1.1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Open {name}', { name: picked.name })} onPress={() => onOpen(picked as Ride)}>
              <RideBubble ride={picked} />
            </Pressable>
          </MapboxMarker>
        ) : null}
      </MapboxMap>
      <MapOverlay
        title={title}
        onPressTitle={onPressTitle}
        count={rides.length}
        moved={moved}
        onSearch={
          onSearchArea
            ? () => {
                anchor.current = now.current;
                setMoved(false);
                onSearchArea(anchor.current);
              }
            : undefined
        }
      />
      <MapControls onZoomIn={() => map.current?.zoomBy(1)} onZoomOut={() => map.current?.zoomBy(-1)} onRecenter={() => flyTo(frame)} full={full} onToggleFull={onToggleFull} />
    </View>
  );
}
