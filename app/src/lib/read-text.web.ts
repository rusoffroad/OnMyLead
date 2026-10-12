/** On web the picker hands back the browser File (or a blob: URL). */
export async function readPickedText(asset: { uri: string; file?: Blob | null }): Promise<string> {
  if (asset.file) return asset.file.text();
  return (await fetch(asset.uri)).text();
}
