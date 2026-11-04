import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * A picture of a card on screen, sized for sharing. react-native-view-shot draws at the screen's
 * scale, so a 1080-point card came out 3240 px wide on an iPhone and, as a PNG with a photo
 * behind it, over 40 MB: Facebook's share extension never finished with it (Chris, 2026-11-04).
 * The snapshot is shrunk to `width` px and saved as a JPEG (a PNG for line art such as a QR
 * code) under a name the other app can show, a few hundred KB at most.
 */
export async function snapshotForShare(
  view: RefObject<View | null>, opts: { width: number; height?: number; name: string; png?: boolean },
): Promise<string> {
  const raw = await captureRef(view, { format: opts.png ? 'png' : 'jpg', quality: 1, result: 'tmpfile' });
  const ctx = ImageManipulator.ImageManipulator.manipulate(raw);
  ctx.resize(opts.height ? { width: opts.width, height: opts.height } : { width: opts.width });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync(
    opts.png ? { compress: 1, format: ImageManipulator.SaveFormat.PNG } : { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  // The full-size capture (up to 3x the card) is let go now, not when the garbage collector gets to it.
  (image as { release?: () => void }).release?.();
  try {
    const out = new File(Paths.cache, `${opts.name}.${opts.png ? 'png' : 'jpg'}`);
    await new File(saved.uri).copy(out, { overwrite: true });
    return out.uri;
  } catch {
    return saved.uri;
  }
}

export const shareMime = (png?: boolean) => (png ? { mimeType: 'image/png', UTI: 'public.png' } : { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
