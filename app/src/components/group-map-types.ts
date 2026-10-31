import type { BubbleStatus, RideRole } from '@/core/bubble';
import type { RiderFreshness } from '@/core/freshness';
import type { LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';

export type MapRider = {
  id: string;
  name: string;
  role: RideRole;
  status: BubbleStatus;
  lat: number | null;
  lng: number | null;
  /** How old the position is; null when the rider is not sharing. Only 'live' is drawn as a solid dot. */
  freshness: RiderFreshness | null;
  detail: string;
  /** Tapped Mechanical Issue and hasn't sent another status since. */
  breakdown?: boolean;
};

/** What a screen can ask of the live map. */
export type GroupMapHandle = {
  /** Move the map (keeping its zoom) so `p` sits in the middle of the map left open by `inset`. */
  centerOn: (p: LatLng, inset: Inset) => Promise<void>;
};
