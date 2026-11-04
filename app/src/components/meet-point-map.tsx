import type { LatLng } from '@/core/geo';
import { useTrailMap } from '@/hooks/use-trail-map';
import { MeetPointMapboxMap } from './meet-point-mapbox-map';

/**
 * The meeting-point picker on iPhone, iPad and Android: the Mapbox satellite map when this build
 * and the owner allow it (tap to drop the pin, drag it to fine-tune). Without Mapbox the phone sets
 * the meeting point by search, location or coordinates, as it always has.
 */
export function MeetPointMap(props: { value: LatLng | null; onPick: (p: LatLng) => void }) {
  const trail = useTrailMap();
  if (trail.mapbox) return <MeetPointMapboxMap {...props} trail={trail} />;
  return null;
}
