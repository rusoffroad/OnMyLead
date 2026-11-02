import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import { extendTrail, parseStoredTrail, TRAIL_MAX_AGE_MS, type LeaderTrail } from '@/core/freeride';
import type { LatLng } from '@/core/geo';

/** One slot on the phone: only the latest Freeride's trail is kept, so old rides never pile up. */
const KEY = 'ride.leaderTrail.v1';
function isStale(raw: string): boolean {
  try {
    const at = (JSON.parse(raw) as { updatedAt?: unknown }).updatedAt;
    return typeof at !== 'number' || Date.now() - at > TRAIL_MAX_AGE_MS;
  } catch {
    return true;
  }
}

/** Save at most this often while the trail grows. */
const SAVE_EVERY_MS = 20_000;

/**
 * The leader's trail on a Freeride, built on this phone from the leader's live spots (which only
 * riders on the ride receive). It is kept on the phone so leaving Ride Mode and coming back
 * doesn't lose it, and is never uploaded. Pass `enabled` false on a ride with a mapped route.
 */
export function useLeaderTrail(rideId: string | undefined, leaderId: string | null, leaderAt: LatLng | null, enabled: boolean): LeaderTrail | null {
  const [trail, setTrail] = useState<LeaderTrail | null>(null);
  const loaded = useRef<string | null>(null);
  const savedAt = useRef(0);

  // Pick up the trail this phone kept for the ride, once.
  useEffect(() => {
    if (!enabled || !rideId || loaded.current === rideId) return;
    let gone = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (gone) return;
        loaded.current = rideId;
        const stored = parseStoredTrail(raw, rideId);
        // A trail older than the limit (for any ride) is deleted, not just skipped.
        if (raw && !stored && isStale(raw)) AsyncStorage.removeItem(KEY).catch(() => {});
        // A spot that arrived while reading wins over nothing, but a kept trail carries on from it.
        if (stored) setTrail((t) => (t && t.leaderId === stored.leaderId ? t.points.reduce((acc, p) => extendTrail(acc, rideId, stored.leaderId, p), stored) : t ?? stored));
      })
      .catch(() => {
        loaded.current = rideId;
      });
    return () => {
      gone = true;
    };
  }, [enabled, rideId]);

  // Each new leader spot grows the trail (adjusted while rendering, React's way to follow a prop).
  const lat = leaderAt?.lat;
  const lng = leaderAt?.lng;
  const spotKey = enabled && rideId && leaderId && lat != null && lng != null ? `${rideId}:${leaderId}:${lat}:${lng}` : null;
  const [seenSpot, setSeenSpot] = useState<string | null>(null);
  if (spotKey && spotKey !== seenSpot) {
    setSeenSpot(spotKey);
    setTrail(extendTrail(trail, rideId!, leaderId!, { lat: lat!, lng: lng! }));
  }

  useEffect(() => {
    if (!trail || Date.now() - savedAt.current < SAVE_EVERY_MS) return;
    savedAt.current = Date.now();
    AsyncStorage.setItem(KEY, JSON.stringify(trail)).catch(() => {});
  }, [trail]);

  // Save the latest on the way out.
  const latest = useRef(trail);
  useEffect(() => {
    latest.current = trail;
  }, [trail]);
  useEffect(
    () => () => {
      if (latest.current) AsyncStorage.setItem(KEY, JSON.stringify(latest.current)).catch(() => {});
    },
    [],
  );

  return enabled ? trail : null;
}
