import { describe, expect, it } from 'vitest';

import { deviceLine, MAX_SCREENSHOT_BASE64, rememberScreen, screenBeforeContact, screenshotHint, screenshotProblem } from '../contact';

describe('bug report details', () => {
  it('describes the device in one line', () => {
    expect(deviceLine({ model: 'iPhone 16 Pro', os: 'iOS', osVersion: '27.0', version: '1.0.1', build: '4' })).toBe('iPhone 16 Pro, iOS 27.0, OnMyLead 1.0.1 (4)');
    expect(deviceLine({ model: null, os: 'Android', osVersion: '15', version: '1.0.1', build: null })).toBe('Android 15, OnMyLead 1.0.1');
    expect(deviceLine({})).toBe('');
    expect(deviceLine({ model: 'x'.repeat(200) })).toHaveLength(120);
  });

  it('remembers the screens before Contact Us', () => {
    let t: string[] = [];
    for (const s of ['/(tabs)', '/ride/[id]', '/ride/[id]', '/ride/[id]/live', '/contact']) t = rememberScreen(t, s);
    expect(t).toEqual(['/(tabs)', '/ride/[id]', '/ride/[id]/live', '/contact']);
    expect(screenBeforeContact(t)).toBe('/ride/[id]/live');
    expect(screenBeforeContact(['/contact'])).toBeNull();
    expect(rememberScreen(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['b', 'c', 'd', 'e', 'f']);
  });

  it('checks the screenshot size', () => {
    expect(screenshotProblem('abc')).toBeNull();
    expect(screenshotProblem(null)).toMatch(/couldn’t be read/);
    expect(screenshotProblem('x'.repeat(MAX_SCREENSHOT_BASE64 + 1))).toMatch(/too big/);
  });

  it('says how to take a screenshot on each device', () => {
    expect(screenshotHint('ios')).toMatch(/side button and volume up/);
    expect(screenshotHint('ios', true)).toMatch(/top button/);
    expect(screenshotHint('android')).toMatch(/power and volume down/);
    expect(screenshotHint('web')).toMatch(/Add a picture/);
  });
});
