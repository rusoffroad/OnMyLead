import { t as tr } from '@/lib/i18n';
import { memo, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';

import type { MapRider } from './group-map-types';
import { RiderPin } from './rider-pin';
import { useGlide } from './use-glide';

export { useGlide } from './use-glide';

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
        description={tr(r.detail)}
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
