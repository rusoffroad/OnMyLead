import { describe, expect, it } from 'vitest';

import { actionHalfWidth, CONTROL_GAP, CONTROL_H, CONTROL_SIDE, phoneControls, type PhoneControlsInput } from '../map-controls';

const base: PhoneControlsInput = {
  screenH: 852, screenW: 393, panelTop: 200, ceiling: 140,
  actions: true, locate: true, tilt: true, music: true,
};
const row = (n: number) => 200 + CONTROL_GAP + n * (CONTROL_H + CONTROL_GAP);

describe('Ride Mode map controls on a phone', () => {
  it('stacks the rows evenly above the panel: actions, then Tilt / Follow Me / Center on Me, then Music', () => {
    expect(phoneControls(base)).toEqual({
      actionsBottom: row(0), locateBottom: row(1), tiltBottom: row(1), musicBottom: row(2), followCompact: true,
    });
  });
  it('puts Tilt level with Center on Me, never on a row of its own', () => {
    const c = phoneControls({ ...base, music: false });
    expect(c.tiltBottom).toBe(c.locateBottom);
    expect(c.musicBottom).toBeNull();
  });
  it('drops the rows down when Directions and Add Waypoint have nothing to show', () => {
    const c = phoneControls({ ...base, actions: false });
    expect(c.actionsBottom).toBeNull();
    expect(c.locateBottom).toBe(row(0));
    expect(c.musicBottom).toBe(row(1));
  });
  it('keeps the Follow Me label on a wide phone and drops it beside Tilt on a narrow one', () => {
    expect(phoneControls({ ...base, screenW: 430 }).followCompact).toBe(false);
    expect(phoneControls({ ...base, screenW: 375 }).followCompact).toBe(true);
    expect(phoneControls({ ...base, screenW: 375, tilt: false }).followCompact).toBe(false);
  });
  it('hides whole rows from the top down when the banners leave no room', () => {
    // Room for exactly one row above the panel.
    const c = phoneControls({ ...base, screenH: 200 + CONTROL_GAP + CONTROL_H + 140 });
    expect(c.actionsBottom).toBe(row(0));
    expect(c.locateBottom).toBeNull();
    expect(c.tiltBottom).toBeNull();
    expect(c.musicBottom).toBeNull();
  });
  it('shows Music only over Center on Me', () => {
    expect(phoneControls({ ...base, locate: false }).musicBottom).toBeNull();
  });
  it('splits row 1 into two equal halves inside the side margins', () => {
    const w = actionHalfWidth(393);
    expect(2 * w + CONTROL_GAP + 2 * CONTROL_SIDE).toBeLessThanOrEqual(393);
    expect(w).toBe(180);
  });
});
