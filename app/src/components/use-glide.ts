import { useEffect, useRef, useState } from 'react';

import { glideAt, glideDurationMs, GLIDE_FRAME_MS, shouldGlide } from '@/core/glide';
import type { LatLng } from '@/core/geo';

/**
 * The map position of a rider's dot. When a new fix comes in, the dot slides there over about a
 * second (see core/glide) instead of jumping, and a slide cut short by the next fix carries on
 * from wherever the dot was drawn.
 */
export function useGlide(lat: number, lng: number): LatLng {
  const [pos, setPos] = useState<LatLng>({ lat, lng });
  const drawn = useRef<LatLng>({ lat, lng });
  const lastFixAt = useRef<number | null>(null);
  useEffect(() => {
    const to = { lat, lng };
    const from = drawn.current;
    const start = Date.now();
    const since = lastFixAt.current == null ? null : start - lastFixAt.current;
    lastFixAt.current = start;
    let raf = 0;
    if (!shouldGlide(from, to)) {
      drawn.current = to;
      raf = requestAnimationFrame(() => setPos(to));
      return () => cancelAnimationFrame(raf);
    }
    const duration = glideDurationMs(since);
    let lastDraw = 0;
    const step = () => {
      const t = Date.now();
      const elapsed = t - start;
      if (t - lastDraw >= GLIDE_FRAME_MS || elapsed >= duration) {
        lastDraw = t;
        const p = glideAt(from, to, elapsed, duration);
        drawn.current = p;
        setPos(p);
      }
      if (elapsed < duration) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lat, lng]);
  return pos;
}
