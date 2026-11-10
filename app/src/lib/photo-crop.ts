import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

import { isWholePhoto, type Size } from '@/core/photo-crop';
import type { Rect } from '@/core/avatar';

/**
 * Photo crop (core/photo-crop has the math, components/photo-cropper the screen). Every photo a
 * rider uploads goes through the crop screen first, on iPhone, iPad, Android and the website alike;
 * the native pickers' own edit step is off so the frame works the same everywhere.
 */

/** Long side the crop screen loads a photo at: plenty for every upload (the biggest saves 1600 px). */
export const CROP_WORKING_MAX = 2560;

export type CropSource = { uri: string; width: number; height: number };

/**
 * Loads the picked photo the right way up (the camera's rotation applied) and, when it's huge,
 * smaller, so what the crop screen shows and what it cuts are the same pixels on every device.
 */
export async function preparePhoto(asset: Pick<ImagePickerAsset, 'uri' | 'width' | 'height'>): Promise<CropSource> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  const long = Math.max(asset.width || 0, asset.height || 0);
  if (long > CROP_WORKING_MAX) ctx.resize(asset.width >= asset.height ? { width: CROP_WORKING_MAX } : { height: CROP_WORKING_MAX });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width || image.width, height: saved.height || image.height };
}

export type CropSave = {
  /** Shrinks the result so its long side is at most this many pixels. */
  maxSide?: number;
  /** JPEG quality of the result (the upload may shrink it again). */
  quality?: number;
  /** Also hand back the JPEG as base64 (the contact form sends it that way). */
  base64?: boolean;
};

/** Cuts `rect` out of the prepared photo and saves it as a JPEG, ready for the upload code. */
export async function applyCrop(source: CropSource, rect: Rect, save: CropSave = {}): Promise<ImagePickerAsset> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(source.uri);
  if (!isWholePhoto(rect, source)) ctx.crop(rect);
  const out: Size = { width: rect.width, height: rect.height };
  const max = save.maxSide;
  if (max && Math.max(out.width, out.height) > max) ctx.resize(out.width >= out.height ? { width: max } : { height: max });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: save.quality ?? 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: !!save.base64 });
  return {
    uri: saved.uri,
    width: saved.width || image.width,
    height: saved.height || image.height,
    type: 'image',
    mimeType: 'image/jpeg',
    fileName: 'photo.jpg',
    base64: saved.base64 ?? null,
    // The website's original File is the uncropped photo: uploads read the cropped one from `uri`.
    file: undefined,
  };
}
