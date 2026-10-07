import type { BubbleStatus, RideRole } from '@/core/bubble';

export type MapRider = {
  id: string;
  name: string;
  role: RideRole;
  status: BubbleStatus;
  lat: number | null;
  lng: number | null;
  stale: boolean;
  detail: string;
};
