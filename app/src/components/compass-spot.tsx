import { createContext } from 'react';

import type { CompassSpot as Spot } from '@/core/map-corner';

/**
 * Where a screen wants the map's compass: level with its Map Settings button, under the top bar
 * while the bar shows and at the top in Full Map (core/map-corner). Screens wrap their map in
 * `<CompassSpot.Provider value={{ top }}>`; with none the compass keeps Mapbox's top-right corner.
 */
export const CompassSpot = createContext<Spot | null>(null);
