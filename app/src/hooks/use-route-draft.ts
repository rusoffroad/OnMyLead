import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LatLng } from '@/core/geo';
import { joinLegs, legsFromRoute, straightLeg, type Leg, type LegMode } from '@/core/route-legs';
import { routeAlongTrails, snapToTrails, tilesAround, tilesForLeg } from '@/core/trail-router';
import type { RideRoute } from '@/core/route';
import { loadRoadLines } from '@/lib/trail-tiles';

type Tap = { id: number; p: LatLng; rev: number; /** How far the tap may snap (about a fingertip at the zoom it was made). */ r: number };
type Draft = { taps: Tap[]; legs: Leg[] };

const EMPTY: Draft = { taps: [], legs: [] };

/**
 * The route builder's drawing: taps, and the legs between them, snapped to trails when
 * `follow` is on. A tap shows straight away; snapping it onto the trail and working out the
 * leg's line happen right after, on the phone, from the trail squares (see core/trail-router).
 */
export function useRouteDraft(follow: boolean, offline: boolean) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const ref = useRef<Draft>(EMPTY);
  const nextId = useRef(1);
  const offlineRef = useRef(offline);
  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  const commit = useCallback((next: Draft) => {
    ref.current = next;
    setDraft(next);
  }, []);

  /** Work out leg i's line again, if its two taps haven't changed in the meantime. */
  const solveLeg = useCallback(
    async (i: number) => {
      const d = ref.current;
      const a = d.taps[i], b = d.taps[i + 1], leg = d.legs[i];
      if (!a || !b || !leg) return;
      if (leg.mode === 'straight') {
        commit({ ...d, legs: d.legs.map((l, j) => (j === i ? straightLeg(a.p, b.p) : l)) });
        return;
      }
      const tiles = tilesForLeg(a.p, b.p);
      const lines = tiles ? await loadRoadLines(tiles, offlineRef.current).catch(() => []) : [];
      const found = lines.length ? routeAlongTrails(lines, a.p, b.p, Math.max(a.r, b.r)) : null;
      const now = ref.current;
      const j = now.taps.findIndex((t) => t.id === a.id);
      if (j < 0 || now.taps[j].rev !== a.rev || now.taps[j + 1]?.id !== b.id || now.taps[j + 1].rev !== b.rev) return;
      const next: Leg = found
        ? { mode: 'trail', points: [a.p, ...found.points.slice(1, -1), b.p] }
        : straightLeg(a.p, b.p, 'trail', { noTrail: true });
      commit({ ...now, legs: now.legs.map((l, k) => (k === j ? next : l)) });
    },
    [commit],
  );

  /** Pull a tap onto the nearest trail (when following trails), then redo the legs either side of it. */
  const settle = useCallback(
    async (id: number, snap: boolean) => {
      let d = ref.current;
      let i = d.taps.findIndex((t) => t.id === id);
      if (i < 0) return;
      const tap = d.taps[i];
      if (snap) {
        const lines = await loadRoadLines(tilesAround(tap.p), offlineRef.current).catch(() => []);
        const at = snapToTrails(lines, tap.p, tap.r);
        d = ref.current;
        i = d.taps.findIndex((t) => t.id === id);
        if (i < 0 || d.taps[i].rev !== tap.rev) return;
        if (at) {
          const moved: Tap = { ...tap, p: at, rev: tap.rev + 1 };
          const taps = d.taps.map((t) => (t.id === id ? moved : t));
          // Keep the straight previews attached to the tap while it moves.
          const legs = d.legs.map((l, k) =>
            k === i - 1 ? { ...l, points: [taps[k].p, ...l.points.slice(1, -1), at] } : k === i ? { ...l, points: [at, ...l.points.slice(1)] } : l,
          );
          commit({ taps, legs });
        }
      }
      if (i > 0) solveLeg(i - 1);
      if (i < ref.current.taps.length - 1) solveLeg(i);
    },
    [commit, solveLeg],
  );

  const add = useCallback(
    (p: LatLng, radiusM: number) => {
      const d = ref.current;
      const mode: LegMode = follow ? 'trail' : 'straight';
      const tap: Tap = { id: nextId.current++, p, rev: 0, r: radiusM };
      const prev = d.taps[d.taps.length - 1];
      commit({
        taps: [...d.taps, tap],
        legs: prev ? [...d.legs, straightLeg(prev.p, p, mode, { pending: mode === 'trail' })] : d.legs,
      });
      settle(tap.id, follow);
    },
    [commit, follow, settle],
  );

  const move = useCallback(
    (i: number, p: LatLng, radiusM: number) => {
      const d = ref.current;
      const tap = d.taps[i];
      if (!tap) return;
      const moved: Tap = { ...tap, p, rev: tap.rev + 1, r: radiusM };
      const taps = d.taps.map((t, j) => (j === i ? moved : t));
      const touches = (k: number) => k === i - 1 || k === i;
      const legs = d.legs.map((l, k) => (touches(k) ? straightLeg(taps[k].p, taps[k + 1].p, l.mode, { pending: l.mode === 'trail' }) : l));
      commit({ taps, legs });
      // Snap the moved tap when a leg touching it follows trails.
      settle(tap.id, legs.some((l, k) => touches(k) && l.mode === 'trail'));
    },
    [commit, settle],
  );

  const undo = useCallback(() => {
    const d = ref.current;
    commit({ taps: d.taps.slice(0, -1), legs: d.legs.slice(0, Math.max(0, d.taps.length - 2)) });
  }, [commit]);

  const clear = useCallback(() => commit(EMPTY), [commit]);

  const load = useCallback(
    (route: Pick<RideRoute, 'points' | 'waypoints'>) => {
      const pts = route.waypoints.length ? route.waypoints : route.points;
      const taps = pts.map((p) => ({ id: nextId.current++, p, rev: 0, r: 40 }));
      commit({ taps, legs: route.waypoints.length ? legsFromRoute(route) : pts.slice(1).map((b, i) => straightLeg(pts[i], b)) });
    },
    [commit],
  );

  const taps = useMemo(() => draft.taps.map((t) => t.p), [draft.taps]);
  const points = useMemo(() => joinLegs(taps, draft.legs), [taps, draft.legs]);
  const last = draft.legs[draft.legs.length - 1];

  return {
    taps,
    legs: draft.legs,
    /** The whole line as drawn right now. */
    points,
    /** Some leg is still being worked out. */
    finding: draft.legs.some((l) => l.pending),
    /** The newest leg wanted a trail and there wasn't one. */
    lastNoTrail: !!last?.noTrail,
    trailLegs: draft.legs.filter((l) => l.mode === 'trail' && !l.noTrail && !l.pending && l.points.length > 2).length,
    add,
    move,
    undo,
    clear,
    load,
  };
}

export type RouteDraft = ReturnType<typeof useRouteDraft>;
