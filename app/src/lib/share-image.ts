import { File, Paths } from 'expo-file-system';
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
  const ctx = ImageManipulator.ImageManipulator.manipulate(raw);
  ctx.resize(opts.height ? { width: opts.width, height: opts.height } : { width: opts.width });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 1, format: ImageManipulator.SaveFormat.PNG });
  // The full-size capture (up to 3x the card, tens of MB) is let go now, not when the garbage
  // collector or the OS gets to it.
  (image as { release?: () => void }).release?.();
  discard(raw);
  try {
    const out = new File(Paths.cache, `${opts.name}.png`);
    await new File(saved.uri).copy(out, { overwrite: true });
    discard(saved.uri);
    return out.uri;
  } catch {
    return saved.uri;
  }
}

function discard(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // A temp file the OS clears later.
  }
}

export const shareMime = () => ({ mimeType: 'image/png', UTI: 'public.png' });
