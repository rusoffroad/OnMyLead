import Mapbox from '@rnmapbox/maps';

import type { TerrainSave } from '@/core/offline-maps';
import {
  CONTOUR_TILESET, DEM_TILESET, packBounds, packName, STREETS_TILESET, TERRAIN_PACK_ZOOMS, TERRAIN_STYLE_URL,
} from '@/core/terrain';
import type { Box } from '@/core/trails';
import { MAPBOX_TOKEN, terrainBuilt } from './terrain';

/**
 * 3D Terrain in Offline Maps. Mapbox saves its own satellite photos, land height, contours and
 * names for the download's box (a "pack"), next to the squares OnMyLead saves for the flat maps
 * (lib/offline-maps). With no signal, the 3D map shows over a box saved here; elsewhere the flat
 * map shows instead (core/terrain terrainShows).
 */

let ready = false;
function init() {
  if (ready || !terrainBuilt) return;
  Mapbox.setAccessToken(MAPBOX_TOKEN).catch(() => {});
  ready = true;
}

/**
 * Start (or carry on) saving a download's 3D Terrain. `report` hears how far along it is and when
 * it ends. Never throws: a failure is reported as 'failed'.
 */
export async function saveTerrain(id: string, box: Box, report: (state: TerrainSave, pct: number) => void) {
  if (!terrainBuilt) return report('failed', 0);
  init();
  const name = packName(id);
  let last = -1;
  const progress = (_pack: unknown, s: { state: string; percentage: number | null }) => {
    const pct = s.percentage ?? 0;
    if (s.state === 'complete' || pct >= 100) return report('saved', 100);
    // Every whole percent at most, so the list doesn't redraw on every square.
    if (Math.floor(pct) !== last) {
      last = Math.floor(pct);
      report('saving', pct);
    }
  };
  const failed = () => report('failed', Math.max(0, last));
  try {
    const existing = await Mapbox.offlineManager.getPack(name);
    if (existing) {
      // Saved before: Mapbox skips what it already has.
      await Mapbox.offlineManager.subscribe(name, progress, failed);
      await existing.resume();
      return;
    }
    report('saving', 0);
    await Mapbox.offlineManager.createPack(
      {
        name,
        styleURL: TERRAIN_STYLE_URL,
        bounds: packBounds(box),
        minZoom: TERRAIN_PACK_ZOOMS.min,
        maxZoom: TERRAIN_PACK_ZOOMS.max,
        tilesets: [DEM_TILESET, CONTOUR_TILESET, STREETS_TILESET],
        metadata: { app: 'onmylead' },
      },
      progress,
      failed,
    );
  } catch {
    failed();
  }
}

export async function pauseTerrain(id: string) {
  try {
    const pack = await Mapbox.offlineManager.getPack(packName(id));
    await pack?.pause();
  } catch {
    // Nothing to pause.
  }
}

export async function deleteTerrain(id: string) {
  if (!terrainBuilt) return;
  init();
  try {
    await Mapbox.offlineManager.deletePack(packName(id));
  } catch {
    // Already gone.
  }
}
