import { File } from 'expo-file-system';

export type PickedPhoto = { uri: string; mimeType?: string | null; file?: Blob | null };

/** Read a picked photo from the app's cache so it can be uploaded. */
export async function readPhotoBytes(photo: PickedPhoto): Promise<ArrayBuffer | Blob> {
  return new File(photo.uri).arrayBuffer();
}
