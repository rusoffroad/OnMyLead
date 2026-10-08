import type { Bounds } from '@/core/discovery';
import type { Ride } from '@/lib/types';

/** The web build has no native map; the list under it carries the rides. */
export function RidesMap(_props: { rides: Ride[]; bounds: Bounds; onOpen: (ride: Ride) => void; height?: number }) {
  return null;
}
