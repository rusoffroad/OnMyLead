import type { BubbleStatus, RideRole } from '@/core/bubble';
import type { RiderFreshness } from '@/core/freshness';

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
