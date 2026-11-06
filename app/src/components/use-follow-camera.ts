import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

import { FOLLOW_FRAME_START, followFrameAfter, followMove, leadInset } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import { riderHeading, screenAngle } from '@/core/heading';
import { JUNCTION_AHEAD_M, JUNCTION_LOOK_EVERY_MS, JUNCTION_ZOOM_START, junctionZoomStep, nextJunction } from '@/core/intersections';
import type { Inset } from '@/core/map-center';
import { metersPerPointAt } from '@/core/terrain';
import { useEdgeZoomPref } from '@/hooks/use-edge-zoom';
import { useIntersectionZoomPref } from '@/hooks/use-intersection-zoom';
import type { MapboxMapHandle } from './mapbox-map-types';

/** The rider's newest fix as the follow camera needs it. */
export type FollowFix = LatLng & { course?: number | null; speed?: number | null };

/** How long the zoom into and out of an intersection takes (ms). */
const JUNCTION_ZOOM_MS = 900;
/** A map lookup that takes longer than this is given up on for this fix (ms). */
const MAP_CALL_MS = 500;
/** A step running longer than this has hung; the next fix moves the camera anyway (ms). */
const STEP_STUCK_MS = 2500;

/** The answer, or `fallback` if the map hasn't answered in `ms` (a lookup never holds up the camera). */
function within<T>(p: Promise<T> | undefined, ms: number, fallback: T): Promise<T> {
  if (!p) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => resolve(v), () => resolve(fallback)).finally(() => clearTimeout(t));
  });
}

/** How long the one zoom out takes (ms). */
const ZOOM_OUT_MS = 700;

/**
 * The follow camera for a live Mapbox map (Ride Mode, Map Mode): keeps the rider's dot on screen by
 * zooming out once and then moving the map (core/follow-camera followMove), and zooms in at
 * intersections when the rider's switch is on (core/intersections).
 *
 * `start` when following begins (it centers on the rider and allows the one zoom out again), `step`
 * with each new fix while following, `stop` when it ends (the map stays where it is).
 */
export function useFollowCamera(map: RefObject<MapboxMapHandle | null>) {
  const [junctionsOn] = useIntersectionZoomPref();
  const on = useRef(junctionsOn);
  const [edgeOn] = useEdgeZoomPref();
  const edge = useRef(edgeOn);
  useEffect(() => {
    on.current = junctionsOn;
    edge.current = edgeOn;
  }, [junctionsOn, edgeOn]);
  const frame = useRef(FOLLOW_FRAME_START);
  const junction = useRef(JUNCTION_ZOOM_START);
  const busy = useRef(false);
  const busySince = useRef(0);
  const lookedAt = useRef(0);
  // Each step's number: a step that hung and was overtaken mustn't move the camera or free the lock.
  const stepGen = useRef(0);

  const start = useCallback((p: LatLng, inset: Inset, animated = true) => {
    // A step still waiting on the map mustn't move the camera after this.
    stepGen.current++;
    busy.current = false;
    frame.current = FOLLOW_FRAME_START;
    junction.current = JUNCTION_ZOOM_START;
    lookedAt.current = 0;
    map.current?.centerOn(p, inset, animated ? undefined : { animated: false });
  }, [map]);

  const stop = useCallback(() => {
    // A step still waiting on the map (up to about a second) mustn't move the camera once paused.
    stepGen.current++;
    busy.current = false;
    frame.current = FOLLOW_FRAME_START;
    junction.current = JUNCTION_ZOOM_START;
  }, []);

  /** Moves the map for this fix; false when a slower step is still running (the fix is skipped). */
  const step = useCallback(async (f: FollowFix, inset: Inset, durationMs: number): Promise<boolean> => {
    const m = map.current;
    // A step still running skips this fix, unless it has hung (a map call that never answered):
    // then the camera must not stay frozen, so this fix goes ahead.
    if (!m || (busy.current && Date.now() - busySince.current < STEP_STUCK_MS)) return false;
    busy.current = true;
    busySince.current = Date.now();
    const gen = ++stepGen.current;
    try {
      const cam = m.camera();
      const size = { width: cam.width, height: cam.height };
      const heading = riderHeading({ speedMps: f.speed, headingDeg: f.course }, true);
      const screenHeading = heading == null ? null : screenAngle(heading, cam.heading);

      // Zoom In at Intersections: look ahead for a junction while moving; zoom back once through it.
      const j = junction.current;
      if (on.current || j.state === 'in') {
        let ahead: { at: LatLng; distM: number } | null = null;
        if (j.state === 'idle' && heading != null && Date.now() - lookedAt.current >= JUNCTION_LOOK_EVERY_MS) {
          lookedAt.current = Date.now();
          const radius = Math.min(700, JUNCTION_AHEAD_M / Math.max(0.05, metersPerPointAt(f.lat, cam.zoom)));
          ahead = nextJunction(f, heading, await within(m.roadsNear(f, radius), MAP_CALL_MS, []));
          if (gen !== stepGen.current) return false;
        }
        const r = junctionZoomStep(j, { on: on.current, nowMs: Date.now(), zoom: cam.zoom, at: f, speedMps: f.speed ?? null, junction: ahead });
        junction.current = r.next;
        if (r.zoom != null) {
          m.centerOn(f, leadInset(inset, size, screenHeading), { zoom: r.zoom, duration: JUNCTION_ZOOM_MS });
          return true;
        }
      }

      // Keep the dot on screen: zoom out once, then move the map.
      // Centered following doesn't need the dot's spot on screen: skip the map call (no lag).
      const pt = frame.current.locked ? null : await within(m.project(f), MAP_CALL_MS, null);
      if (gen !== stepGen.current) return false;
      const move = followMove(frame.current, {
        pt, size, inset, zoom: cam.zoom, screenHeadingDeg: screenHeading,
        noZoomOut: junction.current.state === 'in' || !edge.current,
      });
      frame.current = followFrameAfter(frame.current, move);
      if (move.kind === 'zoom-out') m.zoomTo(move.zoom, ZOOM_OUT_MS);
      else if (move.kind === 'pan') m.centerOn(f, move.inset, { duration: durationMs });
      return true;
    } finally {
      if (gen === stepGen.current) busy.current = false;
    }
  }, [map]);

  return useMemo(() => ({ start, step, stop }), [start, step, stop]);
}
