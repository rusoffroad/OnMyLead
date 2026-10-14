import type { LatLng } from '@/core/geo';
import { planArea, planRide, type OfflineChoice, type OfflineMap } from '@/core/offline-maps';
import type { Box } from '@/core/trails';

/** The web build has no native map to save squares for, so there are never any downloads. */
const box = { minLat: 38.5, minLng: -109.7, maxLat: 38.7, maxLng: -109.4 };
const MB = 1024 * 1024;
const none: OfflineMap[] = [
  { id: 'o1', name: 'Slickrock Saturday', kind: 'ride', rideId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', box, choices: ['satellite', 'topo', 'trails'], status: 'ready', total: 100, saved: 100, failed: 0, bytes: 212 * MB, createdAt: '2026-10-10T00:00:00Z' },
  { id: 'o2', name: 'Moab and Sand Flats', kind: 'area', box, choices: ['satellite', 'trails'], status: 'ready', total: 100, saved: 100, failed: 0, bytes: 486 * MB, createdAt: '2026-10-09T00:00:00Z' },
  { id: 'o3', name: 'Hatfield-McCoy Trails', kind: 'area', box, choices: ['satellite', 'topo', 'trails'], status: 'downloading', total: 100, saved: 64, failed: 0, bytes: 420 * MB, createdAt: '2026-10-14T00:00:00Z' },
];
export const useOfflineMaps = () => none;
export const rideDownload = (_list: OfflineMap[], _rideId: string | undefined): OfflineMap | undefined => undefined;
export { planArea, planRide };
export async function downloadArea(_name: string, _box: Box, _choices: OfflineChoice[]) {
  return '';
}
export async function downloadRide(_rideId: string, _name: string, _route: LatLng[], _choices: OfflineChoice[]) {
  return '';
}
export function resumeDownload(_id: string) {}
export function pauseDownload(_id: string) {}
export async function deleteOfflineMap(_id: string) {}
export function renameOfflineMap(_id: string, _name: string) {}
export const freeSpace = (): number | null => 41.8 * 1024 * 1024 * 1024;
