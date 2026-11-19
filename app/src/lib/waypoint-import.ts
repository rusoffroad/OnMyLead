import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import { Platform } from 'react-native';

import { parseWaypointFile, type ImportResult } from '@/core/waypoint-import';

/**
 * Import Waypoints (core/waypoint-import.ts has the rules): open a file the rider exported from
 * another map app and read its pins. The file never leaves the device; only the pins the rider
 * keeps are saved, like waypoints they drop themselves.
 */
export type WaypointFile = { name: string; result: ImportResult };

/** Files over this are refused before they are read (a 2,000-pin GPX is well under 1 MB). */
const MAX_BYTES = 25 * 1024 * 1024;

type Picked = { uri: string; name?: string | null; file?: Blob | null };

async function bytesOf(asset: Picked): Promise<Uint8Array> {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
  return new File(asset.uri).bytes();
}

/** The KML inside a KMZ (doc.kml, or the first .kml in it). */
function kmlFromKmz(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => /\.kml$/i.test(f.name) });
  } catch {
    throw new Error('That file could not be opened. Export it again and try once more.');
  }
  const names = Object.keys(files);
  const pick = names.find((n) => /(^|\/)doc\.kml$/i.test(n)) ?? names[0];
  if (!pick) throw new Error('That file is not a GPX, KML or KMZ file. Export your waypoints as GPX or KML and try again.');
  return strFromU8(files[pick]);
}

const nameFromUri = (uri: string) => {
  try {
    return decodeURIComponent(uri.split(/[?#]/)[0].split('/').pop() ?? '') || 'Waypoints';
  } catch {
    return 'Waypoints';
  }
};

/** Read one file (picked, shared into the app, or dropped on the website's map). */
export async function readWaypointFile(asset: Picked): Promise<WaypointFile> {
  const bytes = await bytesOf(asset);
  if (bytes.length > MAX_BYTES) throw new Error('That file is too big to import. Export fewer waypoints at a time.');
  // A zip starts with "PK": that is a KMZ.
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const text = zipped ? kmlFromKmz(bytes) : new TextDecoder().decode(bytes);
  return { name: asset.name || nameFromUri(asset.uri), result: parseWaypointFile(text) };
}

/** Let the rider choose a file. Null when they back out. */
export async function pickWaypointFile(): Promise<WaypointFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  return readWaypointFile(res.assets[0]);
}
