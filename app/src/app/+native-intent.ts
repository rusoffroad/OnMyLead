import { fileImportPath } from '@/core/open-file';

/**
 * Links the phone hands the app before Expo Router reads them. A GPX, KML or KMZ file sent to
 * OnMyLead opens Map Mode's Import Waypoints; everything else is left exactly as it came.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return fileImportPath(path) ?? path;
  } catch {
    return path;
  }
}
