import type { Box } from '@/core/trails';
import type { TrailMap } from '@/hooks/use-trail-map';

/** The web build has no native map, so there is no area to pick. */
export function AreaPickerMap(_props: {
  trail: TrailMap;
  frame: { top: number; bottom: number; left: number; right: number };
  start: { lat: number; lng: number } | null;
  onBox: (box: Box | null) => void;
}) {
  return null;
}
