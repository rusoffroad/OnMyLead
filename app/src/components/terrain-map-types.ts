import type { LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';

/** A line a screen draws on the 3D map (route, recorded trail, distance finder, Track Line). */
export type TerrainLine = {
  id: string;
  /** One line, or several pieces drawn the same way. */
  points: LatLng[] | LatLng[][];
  color: string;
  width: number;
  /** Navy (or other) casing under the line. */
  casing?: string;
  casingWidth?: number;
  /** Dash and gap lengths in points. */
  dash?: number[];
};

/** One fix of the phone's own location as the 3D map reports it. */
export type TerrainOwnFix = LatLng & { course: number | null; speed: number | null };

/** What a screen can ask of the 3D map. */
export type TerrainMapHandle = {
  /**
   * Center a point in the part of the map `inset` leaves open, keeping the zoom (zooming in to
   * riding distance when the map is zoomed far out, or to `zoom`, a Mapbox zoom).
   */
  centerOn: (p: LatLng, inset?: Inset, opts?: { animated?: boolean; duration?: number; zoom?: number }) => void;
  /** Frame points, leaving `inset` clear for panels. */
  fit: (points: LatLng[], inset: Inset, animated?: boolean) => void;
  isFarOut: () => boolean;
};
