import { File } from 'expo-file-system';

/** Read a picked document as text. */
export async function readPickedText(asset: { uri: string; file?: Blob | null }): Promise<string> {
  return new File(asset.uri).text();
}
