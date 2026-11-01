/**
 * The website keeps a trail photo as a small data URL in the browser's storage (there is no
 * documents folder), so it survives a reload. The picker is asked for a reduced-quality JPEG.
 */
export async function keepPhoto(picked: { uri: string; mimeType?: string | null; file?: Blob | null }): Promise<string> {
  if (picked.uri.startsWith('data:')) return picked.uri;
  const blob = picked.file ?? (await (await fetch(picked.uri)).blob());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that photo.'));
    r.readAsDataURL(blob);
  });
}

export function dropPhoto(_uri: string) {
  // Nothing to delete: the data URL goes with the trail.
}
