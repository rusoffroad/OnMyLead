import type { LatLng } from '@/core/geo';
import { planArea, planRide, type OfflineChoice, type OfflineMap } from '@/core/offline-maps';
import type { Box } from '@/core/trails';

/** The web build has no native map to save squares for, so there are never any downloads. */
const none: OfflineMap[] = [];
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
export const freeSpace = (): number | null => null;
