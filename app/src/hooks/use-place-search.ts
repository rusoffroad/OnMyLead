import { useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/core/geo';
import { MIN_QUERY, type Place } from '@/core/places';
import { searchPlaces } from '@/lib/places';

const WAIT_MS = 350;

/**
 * Searches places as the rider types, a moment after they pause. `active` false (the words are
 * the place they just picked) stops it asking again. Only the answer to the newest words shows.
 */
export function usePlaceSearch(query: string, near: LatLng | null | undefined, active = true) {
  // The latest answer, kept with the words it answers, so a stale one never shows.
  const [result, setResult] = useState<{ q: string; places: Place[] | null; error: string | null } | null>(null);
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  });

  const q = query.trim();
  const searching = active && q.length >= MIN_QUERY;
  const answer = searching && result?.q === q ? result : null;

  useEffect(() => {
    if (!searching) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, nearRef.current ?? null, ctl.signal)
        .then((found) => setResult({ q, places: found, error: null }))
        .catch((e) => {
          if (ctl.signal.aborted) return;
          setResult({
            q,
            places: null,
            error: e instanceof Error && e.message.startsWith('Place search') ? e.message : 'No signal for place search. Try again with service.',
          });
        });
    }, WAIT_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, searching]);

  return { q, busy: searching && !answer, places: answer?.places ?? null, error: answer?.error ?? null };
}
