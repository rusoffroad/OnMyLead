import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';

import { FOLLOW_FRAME_START, followFrameAfter, followMove, leadInset } from '@/core/follow-camera';
import type { LatLng } from '@/core/geo';
import { riderHeading, screenAngle } from '@/core/heading';
import { JUNCTION_AHEAD_M, JUNCTION_ZOOM_START, junctionZoomStep, nextJunction } from '@/core/intersections';
import type { Inset } from '@/core/map-center';
import { metersPerPointAt } from '@/core/terrain';
import { useIntersectionZoomPref } from '@/hooks/use-intersection-zoom';
import type { MapboxMapHandle } from './mapbox-map-types';

/** The rider's newest fix as the follow camera needs it. */
export type FollowFix = LatLng & { course?: number | null; speed?: number | null };

/** How long the zoom into and out of an intersection takes (ms). */
const JUNCTION_ZOOM_MS = 900;
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
  useEffect(() => {
    on.current = junctionsOn;
  }, [junctionsOn]);
  const frame = useRef(FOLLOW_FRAME_START);
  const junction = useRef(JUNCTION_ZOOM_START);
  const busy = useRef(false);

  const start = useCallback((p: LatLng, inset: Inset, animated = true) => {
    frame.current = FOLLOW_FRAME_START;
    junction.current = JUNCTION_ZOOM_START;
    map.current?.centerOn(p, inset, animated ? undefined : { animated: false });
  }, [map]);

  const stop = useCallback(() => {
    frame.current = FOLLOW_FRAME_START;
    junction.current = JUNCTION_ZOOM_START;
  }, []);

  const step = useCallback(async (f: FollowFix, inset: Inset, durationMs: number) => {
    const m = map.current;
    if (!m || busy.current) return;
    busy.current = true;
    try {
      const cam = m.camera();
      const size = { width: cam.width, height: cam.height };
      const heading = riderHeading({ speedMps: f.speed, headingDeg: f.course }, true);
      const screenHeading = heading == null ? null : screenAngle(heading, cam.heading);

      // Zoom In at Intersections: look ahead for a junction while moving; zoom back once through it.
      const j = junction.current;
      if (on.current || j.state === 'in') {
        let ahead: { at: LatLng; distM: number } | null = null;
        if (j.state === 'idle' && heading != null) {
          const radius = Math.min(700, JUNCTION_AHEAD_M / Math.max(0.05, metersPerPointAt(f.lat, cam.zoom)));
          ahead = nextJunction(f, heading, await m.roadsNear(f, radius));
        }
        const r = junctionZoomStep(j, { on: on.current, nowMs: Date.now(), zoom: cam.zoom, at: f, speedMps: f.speed ?? null, junction: ahead });
        junction.current = r.next;
        if (r.zoom != null) {
          m.centerOn(f, leadInset(inset, size, screenHeading), { zoom: r.zoom, duration: JUNCTION_ZOOM_MS });
          return;
        }
      }

      // Keep the dot on screen: zoom out once, then move the map.
      const move = followMove(frame.current, {
        pt: await m.project(f), size, inset, zoom: cam.zoom, screenHeadingDeg: screenHeading, noZoomOut: junction.current.state === 'in',
      });
      frame.current = followFrameAfter(frame.current, move);
      if (move.kind === 'zoom-out') m.zoomTo(move.zoom, ZOOM_OUT_MS);
      else if (move.kind === 'pan') m.centerOn(f, move.inset, { duration: durationMs });
    } finally {
      busy.current = false;
    }
  }, [map]);

  return useMemo(() => ({ start, step, stop }), [start, step, stop]);
}
