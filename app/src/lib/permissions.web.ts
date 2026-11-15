/**
 * You > Permissions on the website: the browser's location permission only (the website has no
 * push, Bluetooth, camera capture or motion features that ask). A blocked permission can only be
 * changed in the browser's site settings, which a page can't open.
 */
import { fromBrowser, permissionAction, type PermissionId, type PermissionPlatform, type PermissionStatus } from '@/core/permissions';

export const PERMISSION_PLATFORM: PermissionPlatform = 'web';

export type PermissionReport = {
  statuses: Partial<Record<PermissionId, PermissionStatus>>;
  locationServicesOff: boolean;
};

export async function readPermissions(): Promise<PermissionReport> {
  let location: PermissionStatus = 'unknown';
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      location = fromBrowser((await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state);
    } else if (typeof navigator === 'undefined' || !navigator.geolocation) {
      location = 'unknown';
    }
  } catch {
    location = 'unknown';
  }
  return { statuses: { location }, locationServicesOff: false };
}

export async function fixPermission(id: PermissionId, now: PermissionStatus, _userId: string | null): Promise<'asked' | 'settings' | 'none'> {
  if (permissionAction(id, now, 'web') !== 'ask' || id !== 'location') return 'none';
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'none';
  // Asking for one fix shows the browser's question.
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 30000, maximumAge: 60000 });
  });
  return 'asked';
}
