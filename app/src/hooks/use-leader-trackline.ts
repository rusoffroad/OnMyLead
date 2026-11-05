import { useState } from 'react';

import type { LatLng } from '@/core/geo';
import { keepSame, tracklinePieces, type TracklinePieces } from '@/core/leader-trackline';

/**
 * The Leader Trackline to draw from the leader's trail (hooks/use-leader-trail), or null when it
 * is off. Worked out again only when the trail grows, reusing unchanged pieces (core keepSame) so
 * the maps redraw only the piece that grew.
 */
export function useLeaderTrackline(points: LatLng[] | null | undefined, on: boolean): TracklinePieces | null {
  const src = on && points && points.length > 1 ? points : null;
  const [seen, setSeen] = useState<{ src: LatLng[] | null; out: TracklinePieces | null }>({ src: null, out: null });
  if (seen.src !== src) {
    // Adjusted while rendering (React's way to follow a prop), like use-leader-trail.
    const out = src ? keepSame(seen.out, tracklinePieces(src)) : null;
    setSeen({ src, out });
    return out;
  }
  return seen.out;
}
