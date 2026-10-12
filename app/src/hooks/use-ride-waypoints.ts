import { useCallback, useEffect, useState } from 'react';

import { sortWaypoints, type Waypoint } from '@/core/waypoints';
import { newChannel, supabase } from '@/lib/supabase';
import { rideWaypoints } from '@/lib/waypoints';

/**
 * The waypoints a joined rider sees on a ride (the shared ones and their own), kept live. Pass
 * enabled=false for anyone not on the ride; the database would return nothing for them anyway.
 */
export function useRideWaypoints(rideId: string | null | undefined, enabled: boolean) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  /** False until the server has the waypoints update. */
  const [switchedOn, setSwitchedOn] = useState(true);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(
    () =>
      rideId && enabled
        ? rideWaypoints(rideId).then((r) => {
            setWaypoints(r.waypoints);
            setSwitchedOn(!r.switchedOff);
            setOffline(r.offline);
          })
        : Promise.resolve(),
    [rideId, enabled],
  );

  /** Show a save or a removal straight away, before the live update arrives. */
  const apply = useCallback((change: { saved?: Waypoint; removedId?: string }) => {
    setWaypoints((prev) => {
      let next = prev;
      if (change.removedId) next = next.filter((w) => w.id !== change.removedId);
      if (change.saved) next = [...next.filter((w) => w.id !== change.saved!.id), change.saved];
      return sortWaypoints(next);
    });
  }, []);

  useEffect(() => {
    if (!rideId || !enabled) return;
    reload();
    const channel = newChannel(`ride-waypoints-${rideId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_waypoints', filter: `ride_id=eq.${rideId}` }, () => reload())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_waypoints', filter: `ride_id=eq.${rideId}` }, () => reload())
      // Realtime can't filter deletes by ride; drop the id if it's one of ours.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ride_waypoints' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (id) setWaypoints((prev) => prev.filter((w) => w.id !== id));
      })
      .subscribe();
    const poll = setInterval(reload, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [rideId, enabled, reload]);

  return { waypoints, switchedOn, offline, reload, apply };
}
