import { memo, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';

import { glideAt, glideDurationMs, GLIDE_FRAME_MS, shouldGlide } from '@/core/glide';
import type { LatLng } from '@/core/geo';
import type { MapRider } from './group-map-types';
import { RiderPin } from './rider-pin';

/**
 * The map position of a rider's dot. When a new fix comes in, the dot slides there over about a
 * second (see core/glide) instead of jumping, and a slide cut short by the next fix carries on
 * from wherever the dot was drawn.
 */
export function useGlide(lat: number, lng: number): LatLng {
  const [pos, setPos] = useState<LatLng>({ lat, lng });
  const drawn = useRef<LatLng>({ lat, lng });
  const lastFixAt = useRef<number | null>(null);
  useEffect(() => {
    const to = { lat, lng };
    const from = drawn.current;
    const start = Date.now();
    const since = lastFixAt.current == null ? null : start - lastFixAt.current;
    lastFixAt.current = start;
    let raf = 0;
    if (!shouldGlide(from, to)) {
      drawn.current = to;
      raf = requestAnimationFrame(() => setPos(to));
      return () => cancelAnimationFrame(raf);
    }
    const duration = glideDurationMs(since);
    let lastDraw = 0;
    const step = () => {
      const t = Date.now();
      const elapsed = t - start;
      if (t - lastDraw >= GLIDE_FRAME_MS || elapsed >= duration) {
        lastDraw = t;
        const p = glideAt(from, to, elapsed, duration);
        drawn.current = p;
        setPos(p);
      }
      if (elapsed < duration) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);
  return pos;
}

/** Everything a rider's pin draws, so the pin is redrawn only when one of these changes. */
export function pinSignature(r: MapRider, mapHeading: number) {
  const f = r.freshness;
  return [
    r.name, r.role, r.status, r.breakdown ? 1 : 0, f?.state ?? '', f?.ago ?? '', f?.label ?? '', r.detail,
    r.headingDeg == null ? '' : Math.round(r.headingDeg / 5) * 5, mapHeading,
  ].join('|');
}

/**
 * One rider on the live map. Memoized on what the pin shows, so the screen's clock tick or a
 * panel opening no longer redraws every rider, and Android only re-renders a pin's picture for
 * a moment after it changes (redrawing it on every frame is what made pins flicker).
 */
export const RiderMarker = memo(
  function RiderMarker({ rider: r, mapHeading, onPress }: {
    rider: MapRider;
    mapHeading: number;
    onPress: (id: string) => void;
  }) {
    const at = useGlide(r.lat!, r.lng!);
    const sig = pinSignature(r, mapHeading);
    // Android draws a custom marker as a picture; it only needs redrawing while the pin changes.
    const [settledSig, setSettledSig] = useState<string | null>(null);
    useEffect(() => {
      const t = setTimeout(() => setSettledSig(sig), 700);
      return () => clearTimeout(t);
    }, [sig]);
    const tracks = Platform.OS === 'android' ? settledSig !== sig : true;
    return (
      <Marker
        coordinate={{ latitude: at.lat, longitude: at.lng }}
        title={r.name}
        description={r.detail}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracks}
        onPress={() => onPress(r.id)}
        zIndex={r.breakdown ? 6 : r.role === 'leader' ? 5 : 4}>
        <RiderPin rider={r} mapHeading={mapHeading} />
      </Marker>
    );
  },
  (a, b) =>
    a.onPress === b.onPress &&
    a.mapHeading === b.mapHeading &&
    a.rider.lat === b.rider.lat &&
    a.rider.lng === b.rider.lng &&
    pinSignature(a.rider, a.mapHeading) === pinSignature(b.rider, b.mapHeading),
);
