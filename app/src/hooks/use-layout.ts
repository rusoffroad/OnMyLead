import { useWindowDimensions } from 'react-native';

import { EXPANDED_MIN, MEDIUM_MIN, widthClass, type WidthClass } from '@/core/layout';

export type Layout = {
  width: number;
  height: number;
  /** compact (phone), medium (small tablet portrait, split view) or expanded (tablet landscape, big iPad). */
  size: WidthClass;
  /** Medium or expanded: panels move beside the map and lists sit beside their detail. */
  wide: boolean;
  /** Expanded only. */
  expanded: boolean;
  landscape: boolean;
};

/**
 * The one place screens ask how much room they have. It follows the app's window, so it updates
 * when a tablet turns, when the app goes into Split View, Slide Over, Stage Manager or Android split
 * screen, and when a foldable opens. See core/layout.ts for the breakpoints.
 */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const size = widthClass(width);
  return { width, height, size, wide: width >= MEDIUM_MIN, expanded: width >= EXPANDED_MIN, landscape: width > height };
}
