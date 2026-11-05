import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * A picture of a card on screen, sized for sharing. react-native-view-shot draws at the screen's
 * scale, so a 1080-point card came out 3240 px wide on an iPhone and, as a PNG with a photo
 * behind it, over 40 MB: Facebook's share extension never finished with it (Chris, 2026-11-04).
 * The card is still drawn at the asked size (sharp text), then shrunk to `width` px and saved as
 * a PNG (the cards have rounded corners, which a JPEG would fill in) under a name the other app
 * can show: about 1 to 2 MB for a photo card, far less for a QR code.
 */
export async function snapshotForShare(
  view: RefObject<View | null>, opts: { width: number; height?: number; name: string },
): Promise<string> {
  const captured = await captureRef(view, { format: 'png', quality: 1, width: opts.width, height: opts.height, result: 'tmpfile' });
  // react-native-view-shot hands back a bare path on iOS; expo-file-system wants a file:// address.
  const raw = captured.startsWith('file://') ? captured : `file://${captured}`;
  let saved: { uri: string };
  let image: ImageManipulator.ImageRef | null = null;
  try {
    const ctx = ImageManipulator.ImageManipulator.manipulate(raw);
    ctx.resize(opts.height ? { width: opts.width, height: opts.height } : { width: opts.width });
    image = await ctx.renderAsync();
    saved = await image.saveAsync({ compress: 1, format: ImageManipulator.SaveFormat.PNG });
  } finally {
    // The rendered bitmap and the full-size capture (up to 3x the card, tens of MB) are let go
    // now, shrunk or not.
    image?.release();
    discard(raw);
  }
  try {
    // Each share gets its own folder, so the file keeps its plain name (OnMyLead.png) and a
    // second share never overwrites one another app is still reading. Older folders go.
    const folder = new Directory(Paths.cache, `share-${Date.now()}`);
    folder.create({ intermediates: true, idempotent: true });
    const out = new File(folder, `${opts.name}.png`);
    await new File(saved.uri).copy(out, { overwrite: true });
    discard(saved.uri);
    tidy(folder.uri);
    return out.uri;
  } catch {
    return saved.uri;
  }
}

let previous: string | null = null;
let beforeThat: string | null = null;

/** Keeps the last two share folders (the newest may still be in a share sheet) and deletes older. */
function tidy(uri: string) {
  if (beforeThat) {
    try {
      new Directory(beforeThat).delete();
    } catch {
      // The OS clears the cache later.
    }
  }
  beforeThat = previous;
  previous = uri;
}

function discard(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // A temp file the OS clears later.
  }
}

export const shareMime = () => ({ mimeType: 'image/png', UTI: 'public.png' });
