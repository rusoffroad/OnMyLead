export type PickedPhoto = { uri: string; mimeType?: string | null; file?: Blob | null };

/** On web the picker hands back the browser File (or a blob: URL). */
export async function readPhotoBytes(photo: PickedPhoto): Promise<ArrayBuffer | Blob> {
  if (photo.file) return photo.file;
  return (await fetch(photo.uri)).blob();
}
