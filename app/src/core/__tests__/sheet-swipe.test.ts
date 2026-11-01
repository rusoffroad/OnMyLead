import { describe, expect, it } from 'vitest';

import { SHEET_CLOSE_DISTANCE, SHEET_CLOSE_VELOCITY, sheetCanPull, sheetDrag, sheetRelease } from '../sheet-swipe';

describe('swipe down to close a sheet', () => {
  it('follows the finger down from where the list reached its top, never above where it opened', () => {
    expect(sheetDrag(60, 0)).toBe(60);
    expect(sheetDrag(60, 40)).toBe(20);
    expect(sheetDrag(-30, 0)).toBe(0);
    expect(sheetDrag(10, 40)).toBe(0);
  });

  it('closes on a long pull, or a quick flick that has moved a little', () => {
    expect(sheetRelease(SHEET_CLOSE_DISTANCE, 0)).toBe('close');
    expect(sheetRelease(200, -100)).toBe('close');
    expect(sheetRelease(30, SHEET_CLOSE_VELOCITY + 1)).toBe('close');
  });

  it('springs back from a short or slow pull, or a tap that barely moved', () => {
    expect(sheetRelease(40, 100)).toBe('stay');
    expect(sheetRelease(5, 3000)).toBe('stay');
    expect(sheetRelease(0, 0)).toBe('stay');
  });

  it('lets a drag in the list scroll it first, and lets the keyboard go away before the sheet', () => {
    expect(sheetCanPull({ keyboardUp: false, inList: false, listY: 300 })).toBe(true);
    expect(sheetCanPull({ keyboardUp: false, inList: true, listY: 0 })).toBe(true);
    expect(sheetCanPull({ keyboardUp: false, inList: true, listY: 120 })).toBe(false);
    expect(sheetCanPull({ keyboardUp: true, inList: false, listY: 0 })).toBe(false);
  });
});
