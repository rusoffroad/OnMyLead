/**
 * A file handed to OnMyLead by the phone (Import Waypoints, 4.0): from the share sheet, or tapped
 * in Files, Mail or Drive. The app only registers for GPX, KML, KMZ and GeoJSON files
 * (plugins/with-open-files.js), so any file link that arrives is one to import.
 *
 * Returns the in-app path that opens it (Map Mode with the import sheet), or null for every other
 * link (ride, group, friend and event links go on as before).
 */
export function fileImportPath(link: string): string | null {
  if (!/^(file|content):\/\//i.test(link)) return null;
  return `/nav?import=${encodeURIComponent(link)}`;
}
