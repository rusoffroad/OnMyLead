/**
 * The Leader Trackline on the flat Apple or Google map (Ride Mode without Mapbox), drawn the same
 * way as on Mapbox (leader-trackline-ink).
 */
import { memo, useMemo } from 'react';
import { Polyline } from 'react-native-maps';

import type { LatLng } from '@/core/geo';
import type { TracklinePieces } from '@/core/leader-trackline';
import { tracklineInk } from './leader-trackline-ink';

const coords = (points: LatLng[]) => points.map((p) => ({ latitude: p.lat, longitude: p.lng }));

/** One piece on the flat Apple or Google map, kept the same while its points are (no flashing). */
const Piece = memo(function Piece({ points, old }: { points: LatLng[]; old: boolean }) {
  const c = useMemo(() => coords(points), [points]);
  const ink = tracklineInk();
  return (
    <>
      <Polyline coordinates={c} strokeColor={ink.casing} strokeWidth={old ? ink.oldCasing : ink.freshCasing} lineCap="round" lineJoin="round" zIndex={old ? 3 : 5} tappable={false} />
      <Polyline
        coordinates={c}
        strokeColor={old ? ink.old : ink.fresh}
        strokeWidth={old ? ink.oldWidth : ink.freshWidth}
        lineCap={old ? 'butt' : 'round'}
        lineJoin="round"
        lineDashPattern={old ? ink.oldDash : undefined}
        zIndex={old ? 4 : 6}
        tappable={false}
      />
    </>
  );
});

/** The trackline on the flat Apple or Google map (Ride Mode without Mapbox). */
export function TracklinePolylines({ trackline }: { trackline: TracklinePieces | null | undefined }) {
  if (!trackline) return null;
  return (
    <>
      {trackline.old.map((p, i) => (
        <Piece key={`o-${i}`} points={p} old />
      ))}
      {trackline.fresh.map((p, i) => (
        <Piece key={`f-${i}`} points={p} old={false} />
      ))}
    </>
  );
}
