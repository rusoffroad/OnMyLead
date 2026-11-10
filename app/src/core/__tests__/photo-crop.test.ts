import { describe, expect, it } from 'vitest';

import {
  clampView, coverScale, cropRect, frameSize, isWholePhoto, keyNudge, MAX_CROP_ZOOM, panBy, shapeAspect, workingSize, zoomAt,
} from '../photo-crop';

const wide = { width: 4000, height: 3000 };
const tall = { width: 3000, height: 4000 };

describe('photo crop shapes', () => {
  it('follows the photo for Original, 4:3 and 16:9, and keeps Square and 4:5 fixed', () => {
    expect(shapeAspect('original', wide)).toBeCloseTo(4 / 3);
    expect(shapeAspect('original', tall)).toBeCloseTo(3 / 4);
    expect(shapeAspect('square', tall)).toBe(1);
    expect(shapeAspect('16:9', wide)).toBeCloseTo(16 / 9);
    expect(shapeAspect('16:9', tall)).toBeCloseTo(9 / 16);
    expect(shapeAspect('4:3', tall)).toBeCloseTo(3 / 4);
    expect(shapeAspect('4:5', wide)).toBeCloseTo(4 / 5);
    expect(shapeAspect('original', { width: 0, height: 0 })).toBe(1);
  });

  it('fits the biggest frame of the shape in the space', () => {
    expect(frameSize({ width: 400, height: 600 }, 16 / 9)).toEqual({ width: 400, height: 225 });
    expect(frameSize({ width: 1000, height: 500 }, 1)).toEqual({ width: 500, height: 500 });
    expect(frameSize({ width: 300, height: 300 }, NaN)).toEqual({ width: 300, height: 300 });
  });
});

describe('framing', () => {
  const frame = { width: 300, height: 300 };

  it('starts with the photo just covering the frame, centred', () => {
    expect(coverScale(wide, frame)).toBeCloseTo(0.1);
    expect(cropRect({ zoom: 1, x: 0, y: 0 }, wide, frame, 1)).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
  });

  it('never lets an empty edge into the frame', () => {
    // At zoom 1 the wide photo is 400 x 300 on screen: 50 points to spare left and right, none up or down.
    expect(clampView({ zoom: 1, x: 500, y: -90 }, wide, frame)).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(panBy({ zoom: 1, x: 0, y: 0 }, -80, 0, wide, frame)).toEqual({ zoom: 1, x: -50, y: 0 });
    expect(clampView({ zoom: 0.2, x: 0, y: 0 }, wide, frame).zoom).toBe(1);
    expect(clampView({ zoom: 99, x: 0, y: 0 }, wide, frame).zoom).toBe(MAX_CROP_ZOOM);
  });

  it('drags the left edge in: the crop moves to the photo’s left side', () => {
    const r = cropRect({ zoom: 1, x: 50, y: 0 }, wide, frame, 1);
    expect(r).toEqual({ originX: 0, originY: 0, width: 3000, height: 3000 });
  });

  it('zooms on the point under the fingers', () => {
    // Zoom 2x on the frame's top-left corner: that corner of the photo stays put.
    const v = zoomAt({ zoom: 1, x: 0, y: 0 }, 2, -150, -150, wide, frame);
    expect(v).toEqual({ zoom: 2, x: 150, y: 150 });
    const r = cropRect(v, wide, frame, 1);
    expect(r).toEqual({ originX: 500, originY: 0, width: 1500, height: 1500 });
    // Zoom buttons zoom on the centre.
    expect(cropRect(zoomAt({ zoom: 1, x: 0, y: 0 }, 2, 0, 0, wide, frame), wide, frame, 1))
      .toEqual({ originX: 1250, originY: 750, width: 1500, height: 1500 });
  });

  it('keeps an exact shape and stays inside the photo', () => {
    const frame169 = frameSize({ width: 390, height: 600 }, 16 / 9);
    const r = cropRect({ zoom: 3.3, x: -999, y: 999 }, tall, frame169, 16 / 9);
    expect(r.width / r.height).toBeCloseTo(16 / 9, 2);
    expect(r.originX + r.width).toBeLessThanOrEqual(tall.width);
    expect(r.originY + r.height).toBeLessThanOrEqual(tall.height);
    expect(r.originX).toBeGreaterThanOrEqual(0);
    expect(r.originY).toBeGreaterThanOrEqual(0);
  });

  it('knows when the frame holds the whole photo', () => {
    const frame43 = frameSize({ width: 400, height: 400 }, 4 / 3);
    expect(isWholePhoto(cropRect({ zoom: 1, x: 0, y: 0 }, wide, frame43), wide)).toBe(true);
    expect(isWholePhoto(cropRect({ zoom: 1.5, x: 0, y: 0 }, wide, frame43), wide)).toBe(false);
  });
});

describe('helpers', () => {
  it('loads a big photo smaller for cropping, never bigger', () => {
    expect(workingSize({ width: 8000, height: 6000 }, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(workingSize({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 });
  });

  it('moves with the arrow keys', () => {
    expect(keyNudge('ArrowLeft', false)).toEqual({ dx: -10, dy: 0 });
    expect(keyNudge('ArrowDown', true)).toEqual({ dx: 0, dy: 40 });
    expect(keyNudge('a', false)).toBeNull();
  });
});
