/**
 * Photo crop: the shared math behind the crop screen every photo upload goes through (profile
 * picture, group photo, vehicle, post, event, trail and contact screenshot). The rider sees the
 * photo behind a fixed frame, drags it and pinches (or uses the zoom buttons, the mouse wheel or
 * the keyboard on the website) to choose what's inside; the frame's part of the photo is then cut
 * out in pixels with expo-image-manipulator. Pure functions, so iPhone, iPad, Android and the
 * website frame a photo the same way.
 *
 * Coordinates: the photo starts at "cover" size (the smallest size that fills the frame) and
 * `zoom` multiplies that. `x`/`y` is how far the photo's centre sits from the frame's centre, in
 * screen points. The photo always covers the whole frame, so a crop never has empty edges.
 */
import type { Rect } from './avatar';

export type Size = { width: number; height: number };
export type CropView = { zoom: number; x: number; y: number };

/** How far in a rider can zoom (8x the cover size), so a crop never gets tiny and blurry. */
export const MAX_CROP_ZOOM = 8;
/** One tap of the zoom buttons (or the + and - keys on the website). */
export const CROP_ZOOM_STEP = 1.25;

/** A frame shape the rider can pick when the upload doesn't need one shape. */
export type CropShape = 'original' | 'square' | '4:3' | '16:9' | '4:5';
export const CROP_SHAPES: { value: CropShape; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'square', label: 'Square' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5' },
];

/**
 * Width / height of a shape for a photo. 4:3 and 16:9 follow the photo's own direction (on a tall
 * photo they are 3:4 and 9:16); 4:5 is always tall.
 */
export function shapeAspect(shape: CropShape, photo: Size): number {
  const own = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
  const tall = own < 1;
  const ratio = (a: number, b: number) => (tall ? b / a : a / b);
  switch (shape) {
    case 'square':
      return 1;
    case '4:3':
      return ratio(4, 3);
    case '16:9':
      return ratio(16, 9);
    case '4:5':
      // Always the tall post shape, whichever way the photo was taken.
      return 4 / 5;
    default:
      return own;
  }
}

/** The biggest frame of `aspect` that fits in the space (with nothing smaller than 1 point). */
export function frameSize(space: Size, aspect: number): Size {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const w = Math.max(1, space.width);
  const h = Math.max(1, space.height);
  return w / h > a ? { width: h * a, height: h } : { width: w, height: w / a };
}

/** Screen points per photo pixel when the photo just covers the frame (zoom 1). */
export function coverScale(photo: Size, frame: Size): number {
  if (photo.width <= 0 || photo.height <= 0) return 1;
  return Math.max(frame.width / photo.width, frame.height / photo.height);
}

const clampZoom = (z: number) => Math.min(MAX_CROP_ZOOM, Math.max(1, Number.isFinite(z) ? z : 1));

/** Keeps the zoom in range and the photo covering the frame (no empty edge shows). */
export function clampView(view: CropView, photo: Size, frame: Size): CropView {
  const zoom = clampZoom(view.zoom);
  const k = coverScale(photo, frame) * zoom;
  const maxX = Math.max(0, (photo.width * k - frame.width) / 2);
  const maxY = Math.max(0, (photo.height * k - frame.height) / 2);
  const x = Math.min(maxX, Math.max(-maxX, view.x || 0));
  const y = Math.min(maxY, Math.max(-maxY, view.y || 0));
  return { zoom, x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

/**
 * Zooms to `zoom` keeping the point under the fingers (or the mouse) still. `focusX`/`focusY` are
 * measured from the frame's centre; leave them at 0 to zoom on the centre (the zoom buttons).
 */
export function zoomAt(view: CropView, zoom: number, focusX: number, focusY: number, photo: Size, frame: Size): CropView {
  const next = clampZoom(zoom);
  const f = next / clampZoom(view.zoom);
  return clampView({ zoom: next, x: focusX - (focusX - view.x) * f, y: focusY - (focusY - view.y) * f }, photo, frame);
}

/** Moves the photo by a drag (in screen points), staying inside the frame. */
export function panBy(view: CropView, dx: number, dy: number, photo: Size, frame: Size): CropView {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, photo, frame);
}

/**
 * The part of the photo inside the frame, in whole photo pixels, for ImageManipulator's crop.
 * With `aspect`, the rectangle has exactly that shape (to the nearest pixel), so a square stays square.
 */
export function cropRect(view: CropView, photo: Size, frame: Size, aspect?: number): Rect {
  const v = clampView(view, photo, frame);
  const k = coverScale(photo, frame) * v.zoom;
  const W = Math.max(1, Math.round(photo.width));
  const H = Math.max(1, Math.round(photo.height));
  let width = Math.min(W, Math.max(1, Math.round(frame.width / k)));
  let height = Math.min(H, Math.max(1, Math.round(frame.height / k)));
  if (aspect && aspect > 0 && Number.isFinite(aspect)) {
    height = Math.max(1, Math.round(width / aspect));
    if (height > H) {
      height = H;
      width = Math.max(1, Math.min(W, Math.round(H * aspect)));
    }
  }
  // The frame's centre in photo pixels, then the rectangle around it, kept inside the photo.
  const cx = W / 2 - v.x / k;
  const cy = H / 2 - v.y / k;
  const originX = Math.min(W - width, Math.max(0, Math.round(cx - width / 2)));
  const originY = Math.min(H - height, Math.max(0, Math.round(cy - height / 2)));
  return { originX, originY, width, height };
}

/** True when the frame shows the whole photo untouched (so it needn't be cut at all). */
export function isWholePhoto(rect: Rect, photo: Size): boolean {
  return rect.originX === 0 && rect.originY === 0 && rect.width >= Math.round(photo.width) && rect.height >= Math.round(photo.height);
}

/** Size to load a big photo at for cropping: the long side at most `max` pixels (never enlarged). */
export function workingSize(photo: Size, max: number): Size {
  const long = Math.max(photo.width, photo.height);
  if (long <= max || long <= 0) return { width: Math.round(photo.width), height: Math.round(photo.height) };
  const f = max / long;
  return { width: Math.max(1, Math.round(photo.width * f)), height: Math.max(1, Math.round(photo.height * f)) };
}

/** Arrow keys on the website: how far one press moves the photo (Shift moves farther). */
export function keyNudge(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 40 : 10;
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default:
      return null;
  }
}
