import { useCallback, useEffect, useState } from 'react';

import { rideLeaderIds } from '@/core/chat';
import { canShareWaypoints } from '@/core/waypoints';
import { useRideWaypoints } from '@/hooks/use-ride-waypoints';
import { getMembers, getRide } from '@/lib/api';
import { sharingRideId } from '@/lib/location';
import { useSession } from '@/lib/session';
import type { Ride, RideMember } from '@/lib/types';

/**
 * The live group ride a rider is on while they have Map Mode open (they're sharing their location
 * with it). A waypoint dropped in Map Mode then goes to that ride, like in Ride Mode: the leader's
 * can be shared with the group, everyone else's are their own. Null fields when there is none.
 */
export function useMapModeRide(onScreen: boolean) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const [ride, setRide] = useState<Ride | null>(null);
  const [members, setMembers] = useState<RideMember[]>([]);

  useEffect(() => {
    if (!onScreen || !me) return;
    let live = true;
    (async () => {
      const id = await sharingRideId();
      if (!id) {
        if (live) setRide(null);
        return;
      }
      const [r, m] = await Promise.all([getRide(id), getMembers(id)]);
      if (!live) return;
      setRide(r?.status === 'live' ? r : null);
      setMembers(m);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [onScreen, me]);

  const mine = ride ? members.find((m) => m.user_id === me && m.status === 'joined') : undefined;
  const rideId = ride && mine ? ride.id : null;
  const canShare = !!rideId && canShareWaypoints(me, mine, rideLeaderIds(members, ride?.organizer_id));
  const wp = useRideWaypoints(rideId, !!rideId);
  const nameOf = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId)?.profiles?.display_name || 'Rider',
    [members],
  );
  return { rideId, rideName: rideId ? ride?.name ?? null : null, me, canShare, wp, nameOf };
}
