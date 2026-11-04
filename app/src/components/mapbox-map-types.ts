import type { Bounds } from '@/core/discovery';
import type { LatLng } from '@/core/geo';
import type { Inset } from '@/core/map-center';

/** A line a screen draws on the Mapbox map (route, recorded trail, distance finder, Track Line). */
export type MapLine = {
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

/** A filled shape on the ground (Find a Ride's search ring). */
export type MapFill = {
  id: string;
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
  color: string;
  opacity: number;
  stroke: string;
  strokeWidth: number;
};

/** One fix of the phone's own location as the map reports it. */
export type MapboxOwnFix = LatLng & { course: number | null; speed: number | null };

/** The map came to rest: its middle, its edges, and about how many meters one point covers there. */
export type MapIdle = { center: LatLng; bounds: Bounds; metersPerPoint: number; zoom: number };

/** What a screen can ask of the Mapbox map. */
export type MapboxMapHandle = {
  /**
   * Center a point in the part of the map `inset` leaves open, keeping the zoom (zooming in to
   * riding distance when the map is zoomed far out, or to `zoom`, a Mapbox zoom).
   */
  centerOn: (p: LatLng, inset?: Inset, opts?: { animated?: boolean; duration?: number; zoom?: number }) => void;
  /** Frame points, leaving `inset` clear for panels. */
  fit: (points: LatLng[], inset: Inset, animated?: boolean) => void;
  /** Zoom in (`+1`) or out (`-1`) by whole levels, as the +/- buttons do. */
  zoomBy: (levels: number) => void;
  /** The spot under a point of the map (x, y from the top-left corner). */
  pointAt: (x: number, y: number) => Promise<LatLng | null>;
  isFarOut: () => boolean;
  /** Where a spot is on screen (points from the top-left corner), or null while the map can't say. */
  project: (p: LatLng) => Promise<{ x: number; y: number } | null>;
  /** The camera now: Mapbox zoom, turn from north (degrees) and the map's size in points. */
  camera: () => { zoom: number; heading: number; width: number; height: number };
  /** Zoom to a Mapbox zoom, keeping the middle where it is. */
  zoomTo: (zoom: number, duration?: number) => void;
  /** Road, track and trail lines drawn within `radiusPt` points of a spot (Zoom In at Intersections). */
  roadsNear: (p: LatLng, radiusPt: number) => Promise<LatLng[][]>;
};

// Older names, kept for the files written when only 3D Terrain was drawn by Mapbox.
export type TerrainLine = MapLine;
export type TerrainOwnFix = MapboxOwnFix;
export type TerrainMapHandle = MapboxMapHandle;
