import type MapView from 'react-native-maps';

import { followFrameAfter, followMove, type FollowFrame } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';
import { edgeZoomOn } from '@/hooks/use-edge-zoom';

/**
 * The follow camera's edge rule (core/follow-camera followMove) on the fallback maps (Apple Maps,
 * Google Maps) used when Mapbox is off: leave the map alone while the dot is in the middle, zoom
 * out one step the first time it nears an edge, and after that tell the caller to move the map.
 */
export async function fallbackFollowStep(
  m: MapView,
  f: LatLng,
  inset: Inset,
  size: { width: number; height: number },
  frame: { current: FollowFrame },
): Promise<'stay' | 'pan'> {
  const [pt, cam] = await Promise.all([
    m.pointForCoordinate({ latitude: f.lat, longitude: f.lng }).catch(() => null),
    m.getCamera().catch(() => null),
  ]);
  // iPhone and iPad report height (altitude) rather than zoom: treat any as a riding zoom.
  const zoom = cam?.zoom ?? 15;
  const move = followMove(frame.current, { pt, size, inset, zoom, screenHeadingDeg: null, noZoomOut: !cam || !edgeZoomOn() });
  frame.current = followFrameAfter(frame.current, move);
  if (move.kind === 'zoom-out') {
    if (cam?.zoom != null) m.animateCamera({ zoom: move.zoom }, { duration: 700 });
    else if (cam?.altitude != null) m.animateCamera({ altitude: cam.altitude * 2 }, { duration: 700 });
    return 'stay';
  }
  return move.kind;
}
